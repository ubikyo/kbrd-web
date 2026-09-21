import { Alert, Stack, Text, Title } from "@mantine/core";

import Ipv4Picker from "../../setup/Ipv4Picker";
import WifiPicker from "../../setup/WifiPicker";
import type { NetworkTabs } from "./useNetwork";

/**
 * What Save had to say about the network, on whichever of the two tabs
 * is being looked at — it applies both, so neither is the one place its
 * answer belongs (see `useNetwork`).
 *
 * The alert is the last thing this page shows: the interface goes down
 * as it is drawn, and where to find the keyboard afterwards is the only
 * thing left that is any use.
 */
function Outcome({ network }: { network: NetworkTabs }) {
  const { draft, hotspot } = network;
  const static_ = draft.mode === "static";

  return (
    <>
      {network.error && (
        <Text size="xs" c="red">
          {network.error}
        </Text>
      )}

      {network.applied && (
        <Alert color="yellow" title="Connecting">
          The keyboard is joining <b>{draft.ssid}</b> and is leaving this
          network as it does — this page will stop answering. Find it again
          at <b>{(static_ && draft.address.trim()) || "its new address"}</b>
          {hotspot?.ssid ? (
            <>
              , or on <b>{hotspot.ssid}</b> at <b>{hotspot.address}</b> if
              the network could not be joined.
            </>
          ) : (
            "."
          )}
        </Alert>
      )}
    </>
  );
}

/**
 * The Settings modal's Wi-Fi tab: which network the keyboard joins, and
 * its key.
 *
 * The wizard's own step, unchanged (see `setup/WifiPicker`) — the same
 * question deserves the same control, and a device is set up once and
 * moved to another network for years afterwards from here. Addressing is
 * the tab next door, the way a printer or a NAS splits Wireless from
 * TCP/IP: the two together are taller than this dialog, and they are two
 * questions.
 *
 * No button of its own: the modal's Save is what applies this tab and
 * the one beside it, together, because that is how the device takes them
 * (see `useNetwork`).
 */
export function NetworkWifiTab({
  network,
  active,
}: {
  network: NetworkTabs;
  /** Whether this is the tab on screen. The picker scans as it mounts,
   * and a scan takes the radio for several seconds — not something to do
   * to a keyboard because somebody opened Settings. */
  active: boolean;
}) {
  const { status } = network;

  return (
    <Stack className="settings-network" gap="md">
      {status?.available && status.mode === "hotspot" && (
        <Text size="xs" c="dimmed">
          The keyboard is broadcasting its own network,{" "}
          <b>{status.hotspot?.ssid}</b>, because none was saved or the
          saved one could not be joined. Pick a network below to take it
          off the hotspot.
        </Text>
      )}

      <Title order={4}>Wi-Fi</Title>
      {active && (
        <WifiPicker
          draft={network.draft}
          onChange={network.patch}
          onDevice={status === null ? null : status.available}
          secured={status?.config.secured ?? false}
        />
      )}

      <Outcome network={network} />
    </Stack>
  );
}

/**
 * The Settings modal's Network tab: how the keyboard takes an address on
 * the network picked next door.
 *
 * The wizard's second step, unchanged (see `setup/Ipv4Picker`), and
 * applied by the same Save as the tab beside it.
 */
export function NetworkIpv4Tab({ network }: { network: NetworkTabs }) {
  return (
    <Stack className="settings-network" gap="md">
      <Title order={4}>IPv4</Title>
      <Ipv4Picker draft={network.draft} onChange={network.patch} />

      <Outcome network={network} />
    </Stack>
  );
}
