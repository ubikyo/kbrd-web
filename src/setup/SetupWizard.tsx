import { useEffect, useState } from "react";
import {
  Box,
  Button,
  Group,
  Input,
  Paper,
  Stack,
  Tabs,
  Text,
  Title,
} from "@mantine/core";
import { getNetwork, type NetworkStatus } from "../api/network";
import { completeSetup } from "../api/setup";
import {
  EMPTY_NETWORK_DRAFT,
  IPV4_FIELDS,
  isIpv4Complete,
  isWifiComplete,
  networkBody,
  type NetworkDraft,
} from "../components/settings/networkDraft";
import Ipv4Picker from "./Ipv4Picker";
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

/** The strip across the top, in order. Labels only: an icon and a line of
 * explanation apiece cost more room than they were worth, and the step
 * being answered says what it wants itself. */
const STEPS = [
  { value: "wifi", label: "Wi-Fi" },
  { value: "network", label: "Network" },
  { value: "screen", label: "Screen" },
  { value: "password", label: "Password" },
  { value: "confirm", label: "Confirm" },
] as const;

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

  // Nothing is stored on a device that has never been set up, so the form
  // starts empty rather than from `/api/network`'s own configuration —
  // and the key counts as typed from the first keystroke, there being no
  // saved one for an untouched field to mean "keep".
  const [network, setNetwork] = useState<NetworkDraft>({
    ...EMPTY_NETWORK_DRAFT,
    passphraseTouched: true,
  });
  const [screen, setScreen] = useState<ScreenDraft>(EMPTY_SCREEN_DRAFT);
  const [password, setPassword] =
    useState<PasswordDraft>(EMPTY_PASSWORD_DRAFT);

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

  const wifiDone = isWifiComplete(network);
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
      <Box className="setup-shell">
        {/* Centred over the whole column, steps included — it names the
            page rather than the step being answered. */}
        <div className="setup-title">Initial setup</div>

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
          /* One `Tabs`, the way the Settings modal is built: the steps
             in its list, what is being answered in its panel. `Tabs`
             rather than Mantine's own `Stepper` because that styling is
             what was wanted — see `.setup-steps` in App.css for the half
             that makes the list inert, a wizard being walked with Back
             and Next rather than by clicking ahead.

             Horizontal, so the steps read across the top of the panel
             they head — the column is 650px wide and four labels fit
             across it with room to spare. */
          <Tabs
            className="setup-tabs"
            value={STEPS[step].value}
            variant="outline"
            style={
              {
                "--tab-border-color": "var(--kbrd-border-color)",
              } as React.CSSProperties
            }
          >
            {/* Equal quarters of the frame rather than four labels
                huddled at its left edge — walked in order, they read as
                how far in you are. */}
            <Tabs.List className="setup-steps" grow>
              {STEPS.map((item) => (
                <Tabs.Tab key={item.value} value={item.value}>
                  {item.label}
                </Tabs.Tab>
              ))}
            </Tabs.List>

            {/* One panel, always the active step's: rendering all four
                would mean four copies of `stepBody` for the one that is
                on screen. */}
            <Tabs.Panel className="setup-content" value={STEPS[step].value}>
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
                {step < STEPS.length - 1 ? (
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
            </Tabs.Panel>
          </Tabs>
        )}
      </Box>

      {/* The width the wizard doesn't take, filled rather than left as
          bare background — decoration only, which is why it is an empty
          box and hidden from a reader (see `.setup-art` in App.css). */}
      <Box className="setup-art" aria-hidden />
    </Box>
  );
}
