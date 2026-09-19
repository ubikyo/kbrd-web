import { useCallback, useEffect, useState } from "react";
import {
  Box,
  Combobox,
  Group,
  Input,
  Loader,
  PasswordInput,
  Radio,
  ScrollArea,
  Stack,
  Text,
  TextInput,
  UnstyledButton,
  useCombobox,
} from "@mantine/core";
import { MdLock, MdRefresh, MdWifi } from "react-icons/md";

import { scanNetworks, type ScannedNetwork } from "../api/network";
import {
  networkDraftErrors,
  type NetworkDraft,
} from "../components/settings/networkDraft";

/**
 * What the list shows in development. `/usr/bin/kbrd-network` only exists
 * on the keyboard, so a scan run from a development machine has no radio
 * behind it and always comes back empty — which leaves the one step that
 * is meant to be picked from with nothing to pick.
 *
 * Invented names, deliberately obvious ones. Nothing here ever reaches a
 * device: picking one fills the SSID field exactly as a real scan would,
 * and the wizard then fails to join it, which is the truthful outcome.
 */
const DEMO_NETWORKS: ScannedNetwork[] = [
  { ssid: "Livebox-4F2A", security: "psk" },
  { ssid: "Freebox-CAFE", security: "psk" },
  { ssid: "Bbox-9C1D", security: "psk" },
  { ssid: "iPhone de Camille", security: "psk" },
  { ssid: "SFR_A03C", security: "psk" },
  { ssid: "Café des Sports", security: "open" },
  { ssid: "eduroam", security: "8021x" },
  { ssid: "Invités", security: "open" },
];

type Props = {
  draft: NetworkDraft;
  onChange: (patch: Partial<NetworkDraft>) => void;
  /** Whether this is a keyboard at all — `null` until KBRD-API has said.
   * Only read in development, where `true` is what takes the list off
   * its invented networks and onto a real scan. */
  onDevice: boolean | null;
};

/**
 * The wizard's own way of picking a network: the ones in range down the
 * left, what is being joined down the right.
 *
 * Settings asks the same question in one row of a modal (see
 * `NetworkWifiFields`), which is the right shape there. Here there is a
 * whole page for it and nothing else to do with it, so the scan runs on
 * its own as the step opens and the result is the control — a Combobox
 * with its options rendered inline rather than in a dropdown, which is
 * what gives the list its keyboard handling for free.
 *
 * A hidden network never turns up in a scan, so the name stays typable on
 * the right — and typing is also what clears the selection on the left,
 * both writing the same one field.
 */
export default function WifiPicker({ draft, onChange, onDevice }: Props) {
  const [networks, setNetworks] = useState<ScannedNetwork[] | null>(null);
  // Starts true: the first scan runs as this mounts, and a control that
  // began idle would flash "no networks" before it had looked.
  const [scanning, setScanning] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const combobox = useCombobox();
  // Whether the name is being typed rather than picked. Held here rather
  // than derived from "the SSID isn't in the list": a hidden network
  // typed by hand and a scan that has just come back empty would look
  // the same, and the row would lose its radio under the user.
  const [other, setOther] = useState(false);

  /** Switching to a name typed by hand starts from nothing: the row that
   * was selected is not a first guess at a hidden network's name, it is
   * the thing being moved away from. Already being in the mode is not a
   * switch, so refocusing the field leaves what is there alone. */
  function chooseOther() {
    if (other) return;
    setOther(true);
    onChange({ ssid: "" });
  }

  // Every state change is inside a callback rather than in the body: the
  // first scan is started straight from an effect below, and a change
  // made synchronously there is a render cascade.
  const load = useCallback(() => {
    scanNetworks().then(
      ({ networks: found }) => {
        setNetworks(found);
        setScanning(false);
      },
      (failure: unknown) => {
        // An empty list either way — a scan that found nothing and one
        // that could not run read the same here, and the line below says
        // which it was.
        setNetworks([]);
        setError(
          failure instanceof Error ? failure.message : "The scan failed",
        );
        setScanning(false);
      },
    );
  }, []);

  useEffect(load, [load]);

  function rescan() {
    setError(null);
    setScanning(true);
    load();
  }

  const errors = networkDraftErrors(draft);
  // Known before anything is asked, which is the point: the invented
  // list is there instead of a wait, so waiting to find out whether to
  // show it would defeat it. A bundle built for the keyboard is not a
  // development one, so a device never sees these names — and a
  // development session that *is* pointed at a keyboard drops them the
  // moment KBRD-API says it has a radio.
  const demo = import.meta.env.DEV && onDevice !== true;
  const looking = !demo && scanning && networks === null;
  const rows = demo ? DEMO_NETWORKS : (networks ?? []);

  return (
    <Box className="setup-columns">
      <Stack gap={0}>
        <Group
          className="wifi-label"
          justify="space-between"
          align="center"
          wrap="nowrap"
        >
          {/* Mantine's own input label rather than text dressed up as
              one: its weight, its size *and* its line height, so this
              and "Password" opposite start their fields on the same
              line rather than 1.4px apart. */}
          <Input.Label>SSID</Input.Label>
          {/* The icon alone, the way the Inspector's own toggles are
              drawn (see `.icon-toggle`): it turns while the scan runs,
              which is all that is left to say so now the label is
              gone. */}
          <UnstyledButton
            className="icon-toggle wifi-scan"
            aria-label="Scan again"
            data-busy={scanning || undefined}
            disabled={scanning}
            onClick={rescan}
          >
            <MdRefresh size={18} />
          </UnstyledButton>
        </Group>

        <Box className="setup-list wifi-list">
          <Combobox
            store={combobox}
            onOptionSubmit={(ssid) => {
              setOther(false);
              onChange({ ssid });
            }}
          >
            <Combobox.Options>
              {/* A fixed eight rows rather than a box that grows to
                  what the scan found: the frame then holds still as
                  results come in, and as a rescan empties it. */}
              <ScrollArea className="setup-scroll" type="scroll">
                {looking ? (
                  <Group gap="xs" p="sm">
                    <Loader size="xs" />
                    <Text size="sm" c="dimmed">
                      Looking for networks…
                    </Text>
                  </Group>
                ) : rows.length > 0 ? (
                  rows.map((network) => (
                    <Combobox.Option
                      key={network.ssid}
                      value={network.ssid}
                      active={!other && network.ssid === draft.ssid}
                    >
                      <Group gap="sm" wrap="nowrap" w="100%">
                        {/* Display-only: the whole row is what takes the
                            click, so the radio says which one is picked
                            rather than being a second thing to hit. */}
                        <Radio
                          size="xs"
                          color="green"
                          checked={!other && network.ssid === draft.ssid}
                          readOnly
                          tabIndex={-1}
                          aria-hidden
                        />
                        <MdWifi size={16} />
                        <Text size="sm" truncate style={{ flex: 1 }}>
                          {network.ssid}
                        </Text>
                        {network.security !== "open" && <MdLock size={14} />}
                      </Group>
                    </Combobox.Option>
                  ))
                ) : (
                  <Combobox.Empty>
                    No network in range — scan again
                  </Combobox.Empty>
                )}
              </ScrollArea>
            </Combobox.Options>
          </Combobox>

          {/* Under the list and inside the same frame: a hidden network
              never turns up in a scan, and it is the same question as
              the rows above — so it is the same list, with the name
              typed instead of picked. */}
          <Group className="setup-other" gap="sm" wrap="nowrap">
            <Radio
              size="xs"
              color="green"
              aria-label="Other SSID"
              checked={other}
              onChange={chooseOther}
            />
            <Text size="sm" c="dimmed">
              Other SSID :
            </Text>
            <TextInput
              variant="unstyled"
              size="sm"
              style={{ flex: 1 }}
              aria-label="Other SSID name"
              maxLength={32}
              value={other ? draft.ssid : ""}
              onFocus={chooseOther}
              onChange={(event) => {
                setOther(true);
                onChange({ ssid: event.currentTarget.value });
              }}
            />
          </Group>
        </Box>

        {!demo && error && (
          <Text size="xs" c="red" mt="xs">
            {error}
          </Text>
        )}
      </Stack>

      <Stack gap="md">
        <PasswordInput
          label="Password"
          // Its label is held to the same box as every other in the
          // wizard by `.setup-content` in App.css — that is what starts
          // it level with the list opposite. The radius comes from
          // `.setup-columns`, alongside.
          value={draft.passphrase}
          // Only what is wrong with what was typed: a key too short or
          // too long for WPA2. An empty field is not marked at all —
          // nothing has been got wrong yet, and Next being out of reach
          // is what says the step isn't done (see
          // `isWifiCompleteWithKey`).
          error={errors.passphrase}
          onChange={(event) =>
            onChange({
              passphrase: event.currentTarget.value,
              passphraseTouched: true,
            })
          }
        />
      </Stack>
    </Box>
  );
}
