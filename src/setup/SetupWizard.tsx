import { useEffect, useState } from "react";
import { useMediaQuery } from "@mantine/hooks";
import {
  Box,
  Button,
  Group,
  Input,
  Paper,
  Stack,
  Text,
  Title,
} from "@mantine/core";
import kbrdLogo from "../assets/media/KBRD.svg";
import kbrdAltLogo from "../assets/media/KBRD-Alt.svg";
import { getNetwork, type NetworkStatus } from "../api/network";
import { completeSetup } from "../api/setup";
import {
  EMPTY_NETWORK_DRAFT,
  IPV4_FIELDS,
  isIpv4Complete,
  isWifiCompleteWithKey,
  networkBody,
  type NetworkDraft,
} from "../components/settings/networkDraft";
import Ipv4Picker from "./Ipv4Picker";
import SetupArt from "./SetupArt";
import PasswordPicker from "./PasswordPicker";
import ScreenPicker from "./ScreenPicker";
import WifiPicker from "./WifiPicker";
import {
  EMPTY_PASSWORD_DRAFT,
  isPasswordComplete,
  type PasswordDraft,
} from "./passwordDraft";
import {
  EMPTY_SCREEN_DRAFT,
  isScreenComplete,
  screenName,
  screenSize,
  type ScreenDraft,
} from "./screenDraft";

/** One line of the last step's summary: what was answered, under the
 * name of the question. Stacked rather than side by side the way
 * Settings' own rows are (see `FieldRow`) — half the wizard's width is
 * not enough for both, and these read down a column. */
function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <Box>
      <Input.Label>{label}</Input.Label>
      <Text className="setup-fact" size="sm" c="dimmed">
        {value}
      </Text>
    </Box>
  );
}

/** The steps as the art names them, one card each and in the wizard's own
 * order. A `\n` in a label is a line break the card keeps (see
 * `.setup-card-label` in App.css) — where a line reads better broken at
 * a particular word than wherever the column happens to run out.
 *
 * Their order is the wizard's own — so a card's index is the step it stands for, and the one being
 * answered is the lit square among them.
 *
 * There are five and the panel holds three of them — two on a narrow
 * window — so the row slides: see `CARDS_SHOWN` and `.setup-cards` in
 * App.css. */
const CARDS = [
  { number: "1", label: "Select a\nWi-Fi network" },
  { number: "2", label: "Set the network\naddressing" },
  { number: "3", label: "Select the connected screen model" },
  { number: "4", label: "Set a password\nfor access" },
  { number: "5", label: "Review the settings" },
] as const;

/** How many of them the panel shows at once, and below which width it
 * drops to two. The width is cut into that many columns and the row is
 * slid by whole ones, so the number is the layout's as much as it is the
 * slide's — both are in App.css too (see `--cards-shown`), and the two
 * have to agree.
 *
 * Three squares over a panel narrower than this are columns a word wide,
 * where every label breaks to a stack of them; two of the same squares
 * are half again as wide and read as the sentences they are. */
const CARDS_SHOWN = 3;
const CARDS_SHOWN_NARROW = 2;
const NARROW_QUERY = "(max-width: 1349.98px)";

/** How many cards the row is wound on by, for the step being answered.
 *
 * Nothing at all until the active card would fall off the end: the first
 * steps are the first cards, already on screen, and moving under them
 * would only take the run-up away from the ones that come after. From
 * there it is whatever brings the active card to the last place shown,
 * and it stops at the end of the row rather than sliding the last cards
 * out of sight. */
function slideFor(step: number, shown: number) {
  const last = CARDS.length - shown;
  return Math.min(Math.max(step - (shown - 1), 0), last);
}

/**
 * The first run: what the keyboard has to be told before there is an app
 * to show. Which network to join, how to address itself on it, which
 * screen it is attached to, and what to ask for before it opens.
 *
 * Nothing is written until the last step is confirmed — one call, at the
 * end (see `api/setup.ts`). A wizard closed or reloaded half-way leaves
 * the device exactly as it was, and starts again from the top: a device
 * part configured is worse than one not configured at all, since nothing
 * afterwards would ever ask again.
 *
 * The network is applied last, and by KBRD-API rather than here: joining
 * a network takes the hotspot down, and the hotspot is what this page is
 * being read over. So the last thing shown is where to find the keyboard
 * afterwards, not the app — which would stop answering mid-sentence.
 */
export default function SetupWizard({ onDone }: { onDone: () => void }) {
  const [step, setStep] = useState(0);

  // Read on the first render rather than after it: the row would
  // otherwise be laid out for three cards and reflow to two a frame
  // later, which is the one width at which the slide should not move.
  const narrow = useMediaQuery(NARROW_QUERY, false, {
    getInitialValueInEffect: false,
  });
  const cardsShown = narrow ? CARDS_SHOWN_NARROW : CARDS_SHOWN;

  // Nothing is stored on a device that has never been set up, so the form
  // starts empty rather than from `/api/network`'s own configuration —
  // and the key counts as typed from the first keystroke, there being no
  // saved one for an untouched field to mean "keep".
  const [network, setNetwork] = useState<NetworkDraft>({
    ...EMPTY_NETWORK_DRAFT,
    passphraseTouched: true,
  });
  const [screen, setScreen] = useState<ScreenDraft>(EMPTY_SCREEN_DRAFT);
  const [password, setPassword] = useState<PasswordDraft>(EMPTY_PASSWORD_DRAFT);

  const [status, setStatus] = useState<NetworkStatus | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [applied, setApplied] = useState(false);

  // Read once, for the hotspot's own name and address: it is where the
  // keyboard goes back to if the network it is given can't be joined, and
  // so the one thing worth telling the user before they lose this page.
  useEffect(() => {
    let cancelled = false;
    getNetwork().then(
      (next) => {
        if (!cancelled) setStatus(next);
      },
      () => {},
    );
    return () => {
      cancelled = true;
    };
  }, []);

  const hotspot = status?.available ? status.hotspot : null;

  const { widthMm, heightMm } = screenSize(screen);
  const name = screenName(screen);

  // The wizard's own rule, not Settings': a first run has no saved key
  // for an empty field to stand for (see `isWifiCompleteWithKey`).
  const wifiDone = isWifiCompleteWithKey(network);
  const ipv4Done = isIpv4Complete(network);
  const screenDone = isScreenComplete(screen);
  const passwordDone = isPasswordComplete(password);
  const stepDone = [
    wifiDone,
    ipv4Done,
    screenDone,
    passwordDone,
    wifiDone && ipv4Done && screenDone && passwordDone,
  ];

  function patchNetwork(patch: Partial<NetworkDraft>) {
    setNetwork((current) => ({ ...current, ...patch }));
  }

  function patchScreen(patch: Partial<ScreenDraft>) {
    setScreen((current) => ({ ...current, ...patch }));
  }

  function patchPassword(patch: Partial<PasswordDraft>) {
    setPassword((current) => ({ ...current, ...patch }));
  }

  async function finish() {
    setSaving(true);
    setError(null);
    try {
      await completeSetup({
        display: {
          name,
          // Left empty for a screen described by hand: there is no entry
          // in the list it came from to point back at.
          brand: screen.mode === "known" ? screen.brand : "",
          model: screen.mode === "known" ? screen.model : "",
          physical_width_mm: widthMm,
          physical_height_mm: heightMm,
        },
        // Exactly as it was typed, once: KBRD-API hashes it and nothing
        // hands it back (see `api/setup.ts`).
        password: password.password,
        network: networkBody(network),
      });
      setApplied(true);
    } catch (failure) {
      setError(
        failure instanceof Error ? failure.message : "The setup was refused",
      );
    }
    setSaving(false);
  }

  /** The step being answered, under the strip that names it. */
  function stepBody() {
    switch (step) {
      case 0:
        return (
          <WifiPicker
            draft={network}
            onChange={patchNetwork}
            onDevice={status === null ? null : status.available}
          />
        );

      case 1:
        return <Ipv4Picker draft={network} onChange={patchNetwork} />;

      case 2:
        return <ScreenPicker draft={screen} onChange={patchScreen} />;

      case 3:
        return <PasswordPicker draft={password} onChange={patchPassword} />;

      default:
        return (
          /* The three steps as two columns — the network down one side,
             the screen and the password down the other, in the order
             they were answered. */
          <Box className="setup-columns">
            <Stack gap="md">
              <Title order={4}>Network</Title>
              <SummaryRow label="Network (SSID)" value={network.ssid} />
              <SummaryRow
                label="Addressing"
                value={network.mode === "dhcp" ? "DHCP" : "Static"}
              />
              {/* The five that were typed, in the order they were asked
                  for (see `Ipv4Picker`). Nothing under DHCP: there is
                  nothing to show until the router has answered, and what
                  the draft holds for them is whatever Static was last
                  left at. */}
              {network.mode === "static" &&
                IPV4_FIELDS.map(({ key, label }) => (
                  <SummaryRow
                    key={key}
                    label={label}
                    value={network[key] || "—"}
                  />
                ))}
            </Stack>

            <Stack gap="md">
              <Title order={4}>Screen</Title>
              <SummaryRow label="Name" value={name || "—"} />
              <SummaryRow
                label="Size"
                value={screenDone ? `${widthMm} × ${heightMm} mm` : "—"}
              />

              <Title order={4} mt="md">
                Password
              </Title>
              {/* That there is one, and not a thing about it — not its
                  length, not a run of dots standing in for it. */}
              <SummaryRow
                label="This app"
                value={passwordDone ? "Asks for a password" : "—"}
              />
            </Stack>
          </Box>
        );
    }
  }

  return (
    <Box className="setup-page" bg="var(--kbrd-color-body)">
      {/* The two panels, and as wide as the pair of them ever gets (see
          `.setup-frame` in App.css). Past that the page stops growing
          them and grows the green beside them instead. */}
      <Box className="setup-frame">
        {/* The width the wizard doesn't take, filled rather than left as
          bare background. The green is the box's own CSS and the shooting
          stars are drawn over it (see `SetupArt`) — both decoration, and
          both saying so themselves: the sky carries the `aria-hidden`.
          The title and the cards below it are not decoration, and are
          read like any other text. */}
        <Box className="setup-art">
          {/* Everything on the panel goes once the setup is away: the
              cards are a list of what is still to be answered and
              nothing is, the welcome is to a wizard that has been walked,
              and a sky still running would keep drawing the eye back to
              the half of the page that no longer has anything to say. The
              green stays, so what is left is the page the last word is
              written on (see `applied` below). */}
          {!applied && (
            <>
              <SetupArt />

              {/* Over the cards rather than over the wizard opposite: it
            names what the cards are a list of, and the wizard's
            own column is headed by the mark instead. */}
              <div className="setup-title">Welcome!</div>
              <p className="setup-intro">
                {/* The mark itself where the name was, set in the line
                    rather than standing over it — and carrying the name
                    as its `alt`, so the sentence is still a sentence
                    read aloud. It is the one place in the wizard the
                    logo is a word and not a heading (see
                    `.setup-intro-logo`). */}
                Complete these steps to set up{" "}
                <img
                  className="setup-intro-logo"
                  src={kbrdAltLogo}
                  alt="KBRD"
                />
                .
              </p>

              {/* Along the foot of the panel, over the art. The number in its
            disc at the top of each square and the line it stands for at
            the bottom — the two corners the square is drawn to hold
            apart (see `.setup-card` in App.css).

            The frame shows three of the five; the row inside it carries
            all of them and is slid under it, which is what walks the
            last two into view as they are reached. */}
              <Box className="setup-cards">
                <Box
                  className="setup-cards-track"
                  style={
                    {
                      "--slide": slideFor(step, cardsShown),
                      "--cards-shown": cardsShown,
                    } as React.CSSProperties
                  }
                >
                  {CARDS.map((card, index) => (
                    <Box
                      key={card.number}
                      className="setup-card"
                      data-active={index === step || undefined}
                    >
                      <span className="setup-card-number">{card.number}</span>
                      <span className="setup-card-label">{card.label}</span>
                    </Box>
                  ))}
                </Box>
              </Box>
            </>
          )}
        </Box>

        <Box className="setup-shell">
          {/* The app's own mark at the head of the column, where the page's
            title used to stand — that has moved to the art (see
            `.setup-title`), and what heads the wizard is whose keyboard
            is being set up rather than what is being done to it. */}
          <img className="setup-logo" src={kbrdLogo} alt="KBRD" />

          {applied ? (
            <Paper p="xl" radius="md" withBorder>
              <Stack gap="md">
                <Title order={3}>Setting up</Title>
                <Text size="sm">
                  The keyboard is joining <b>{network.ssid}</b> and is leaving
                  this network as it does, so this page will stop answering.
                  Open it again on the address{" "}
                  {network.mode === "static"
                    ? "you gave it"
                    : "your router gives it"}
                  .
                </Text>
                {hotspot?.ssid && (
                  <Text size="sm" c="dimmed">
                    If it cannot join that network it comes back up as its own
                    hotspot, <b>{hotspot.ssid}</b>, at <b>{hotspot.address}</b>{" "}
                    — the setup is saved either way and won't be asked for
                    again.
                  </Text>
                )}
                <Group>
                  <Button color="green" onClick={onDone}>
                    Continue anyway
                  </Button>
                </Group>
              </Stack>
            </Paper>
          ) : (
            /* The step being answered and the row that walks it, and
             nothing above them naming the steps: that job belongs to the
             cards on the art (see `CARDS`), which is why there is no
             strip here and no `Tabs` left to draw one. */
            <Box className="setup-content">
              {/* The only part that scrolls: the page itself is the
                  window's own height, so a long step gives way here
                  rather than pushing Back/Next off the bottom. */}
              <Box className="setup-body">
                {stepBody()}

                {error && (
                  <Text size="sm" c="red" mt="md">
                    {error}
                  </Text>
                )}
              </Box>

              <Group
                className="setup-actions"
                // Nothing to go back to from the first step, so Back is
                // not there to be refused — and Next takes the end of
                // the row on its own.
                justify={step > 0 ? "space-between" : "flex-end"}
              >
                {step > 0 && (
                  <Button
                    color="gray"
                    disabled={saving}
                    onClick={() => setStep((current) => current - 1)}
                  >
                    Back
                  </Button>
                )}
                {step < stepDone.length - 1 ? (
                  <Button
                    color="green"
                    disabled={!stepDone[step]}
                    onClick={() => setStep((current) => current + 1)}
                  >
                    Next
                  </Button>
                ) : (
                  <Button
                    color="green"
                    disabled={!stepDone[step] || saving}
                    loading={saving}
                    onClick={() => void finish()}
                  >
                    Finish
                  </Button>
                )}
              </Group>
            </Box>
          )}
        </Box>
      </Box>

      {/* Everything to the right of those 1500px, in the same green as
          the panel on the left and kept off the window's edges by the
          same 20px — so a wide screen reads as the wizard set into a
          green page rather than as a page with a gap down one side. It
          is decoration and nothing else: there is nothing in it to read
          and nothing in it to reach. */}
      <Box className="setup-spill" aria-hidden />
    </Box>
  );
}
