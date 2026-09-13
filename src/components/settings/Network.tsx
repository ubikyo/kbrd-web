import { useEffect, useRef, useState } from "react";
import { Alert, Button, Group, Stack, Text, Title } from "@mantine/core";
import { MdWifi } from "react-icons/md";

import { getNetwork, saveNetwork, type NetworkStatus } from "../../api/network";
import Confirmation from "../modals/Confirmation";
import FieldRow from "./FieldRow";
import NetworkIpv4Fields from "./NetworkIpv4Fields";
import NetworkWifiFields from "./NetworkWifiFields";
import {
  EMPTY_NETWORK_DRAFT,
  isNetworkDraftComplete,
  networkBody,
  networkDraftFrom,
  type NetworkDraft,
} from "./networkDraft";

// Same cadence as the device and storage readings in `Settings`: this is
// a state to watch, not a setting — the fields below are the setting.
const STATUS_POLL_INTERVAL_MS = 5000;

function StateRow({ label, value }: { label: string; value: string }) {
  return (
    <FieldRow label={label}>
      <Text size="sm" c="dimmed">
        {value || "—"}
      </Text>
    </FieldRow>
  );
}

/**
 * The Settings modal's Network tab: which Wi-Fi the keyboard joins, and
 * how it addresses itself on it.
 *
 * Out of the box — and whenever a saved network can't be joined — the
 * keyboard broadcasts an access point of its own and serves DHCP on it,
 * so this page is reachable at a fixed address to be told where to go
 * next (see KBRD-OS's `/usr/bin/kbrd-network`). That is the state most of
 * these settings are filled in from. On a device that has *never* been
 * configured the first-run wizard asks the same questions ahead of the
 * app, over these same fields (see `setup/SetupWizard`).
 *
 * Nothing here goes through the modal's own Save, for the same reason the
 * Backup tab doesn't: applying takes the interface down — usually the
 * very one this browser is on — so it is its own button, behind its own
 * confirmation, and the connection is expected to go away afterwards.
 */
export default function Network({ active }: { active: boolean }) {
  const [status, setStatus] = useState<NetworkStatus | null>(null);
  const [draft, setDraft] = useState<NetworkDraft>(EMPTY_NETWORK_DRAFT);
  // The first reading fills the form, and only the first: every later one
  // would overwrite what is being typed. A ref rather than state — it is
  // read and set inside the poll's own callback, and nothing renders off
  // it.
  const seeded = useRef(false);

  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [applied, setApplied] = useState(false);

  // Polled while the tab is open, like the device and storage readings —
  // a connection comes up on its own, and this is how it is seen to.
  useEffect(() => {
    if (!active) return;
    let cancelled = false;

    function poll() {
      getNetwork().then(
        (next) => {
          if (cancelled) return;
          setStatus(next);
          if (seeded.current) return;
          seeded.current = true;
          setDraft(networkDraftFrom(next.config));
        },
        () => {},
      );
    }

    poll();
    const timer = window.setInterval(poll, STATUS_POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [active]);

  function patch(data: Partial<NetworkDraft>) {
    setDraft((current) => ({ ...current, ...data }));
    setApplied(false);
  }

  async function connect() {
    setConfirming(false);
    setSaving(true);
    setError(null);
    try {
      await saveNetwork(networkBody(draft));
    } catch (failure) {
      setError(
        failure instanceof Error ? failure.message : "The change was refused",
      );
      setSaving(false);
      return;
    }
    setSaving(false);
    setApplied(true);
  }

  const static_ = draft.mode === "static";
  const hotspot = status?.available ? status.hotspot : null;
  const connectedTo = status?.available ? status : null;

  const stateLabel = !status
    ? "Reading…"
    : !status.available
      ? "Not a keyboard"
      : status.mode === "hotspot"
        ? "Hotspot"
        : status.connected
          ? "Connected"
          : "Not connected";

  const stateColor = !connectedTo
    ? "dimmed"
    : connectedTo.mode === "hotspot"
      ? "yellow"
      : connectedTo.connected
        ? "green"
        : "red";

  return (
    <Stack gap="md">
      <Title order={4}>State</Title>
      <FieldRow label="State">
        <Text size="sm" fw={700} c={stateColor}>
          {stateLabel}
        </Text>
      </FieldRow>
      <StateRow label="Network" value={connectedTo?.ssid ?? ""} />
      <StateRow label="IP address" value={connectedTo?.ipv4.address ?? ""} />
      <StateRow label="Netmask" value={connectedTo?.ipv4.netmask ?? ""} />
      <StateRow label="Gateway" value={connectedTo?.ipv4.gateway ?? ""} />
      <StateRow label="DNS" value={connectedTo?.ipv4.dns.join(", ") ?? ""} />

      {status && !status.available && (
        <Text size="xs" c="dimmed">
          KBRD-API is not running on a keyboard here, so there is no
          interface to read or to configure. The fields below still show
          what was saved.
        </Text>
      )}

      {connectedTo?.mode === "hotspot" && (
        <Text size="xs" c="dimmed">
          The keyboard is broadcasting its own network,{" "}
          <b>{hotspot?.ssid}</b>, because none was saved or the saved one
          could not be joined. Pick a network below to take it off the
          hotspot.
        </Text>
      )}

      <Title order={4} mt="md">
        Wi-Fi
      </Title>
      <NetworkWifiFields
        draft={draft}
        onChange={patch}
        secured={status?.config.secured ?? false}
        onScanError={setError}
      />

      <Title order={4} mt="md">
        IPv4
      </Title>
      <NetworkIpv4Fields draft={draft} onChange={patch} />

      <Group mt="md">
        <Button
          color="green"
          leftSection={<MdWifi size={16} />}
          disabled={!isNetworkDraftComplete(draft) || saving}
          loading={saving}
          onClick={() => setConfirming(true)}
        >
          Connect
        </Button>
      </Group>

      {error && (
        <Text size="xs" c="red">
          {error}
        </Text>
      )}

      {applied && (
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

      {confirming && (
        <Confirmation
          title="Join this network?"
          message={
            <>
              The keyboard will join <b>{draft.ssid}</b> and drop whatever
              it is on now, this page included. If it cannot, it comes back
              up as its own hotspot
              {hotspot?.ssid ? (
                <>
                  {" "}
                  — <b>{hotspot.ssid}</b>, at <b>{hotspot.address}</b>
                </>
              ) : null}
              .
            </>
          }
          onConfirm={() => void connect()}
          onCancel={() => setConfirming(false)}
        />
      )}
    </Stack>
  );
}
