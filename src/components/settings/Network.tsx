import { useEffect, useRef, useState } from "react";
import {
  Alert,
  Autocomplete,
  Button,
  Group,
  MaskInput,
  PasswordInput,
  Select,
  Stack,
  Text,
  Title,
} from "@mantine/core";
import { MdRefresh, MdWifi } from "react-icons/md";

import {
  getNetwork,
  saveNetwork,
  scanNetworks,
  type Ipv4Mode,
  type NetworkStatus,
  type NetworkWrite,
} from "../../api/network";
import Confirmation from "../modals/Confirmation";
import FieldRow from "./FieldRow";
import {
  IPV4_MASK,
  isNetmask,
  toAddress,
  toDigits,
  toMasked,
} from "./ipv4";

// Same cadence as the device and storage readings in `Settings`: this is
// a state to watch, not a setting — the fields below are the setting.
const STATUS_POLL_INTERVAL_MS = 5000;

// WPA2's own range, and KBRD-API's (see `api/network.py`).
const PASSPHRASE_MIN = 8;
const PASSPHRASE_MAX = 63;

/** The five address fields, as the draft holds them: twelve digit slots
 * each, not addresses (see `ipv4.ts`). */
type Addresses = {
  address: string;
  netmask: string;
  gateway: string;
  dns1: string;
  dns2: string;
};

type Draft = Addresses & {
  ssid: string;
  passphrase: string;
  /**
   * The key never comes back from the device, so an untouched field and
   * an empty one are not the same thing: untouched means "keep what is
   * saved" and is sent by leaving `passphrase` out of the body, while
   * emptied means "this network is open". This is what tells them apart.
   */
  passphraseTouched: boolean;
  mode: Ipv4Mode;
};

const EMPTY: Draft = {
  ssid: "",
  passphrase: "",
  passphraseTouched: false,
  mode: "dhcp",
  address: "",
  netmask: "",
  gateway: "",
  dns1: "",
  dns2: "",
};

/** One masked IPv4 field. Uncontrolled on purpose: the mask writes into
 * the input itself, so it is mounted with what was saved (`seed`, which
 * changes when the saved configuration arrives) and reports the digits
 * back as they are typed. */
function AddressField({
  label,
  seed,
  digits,
  onChange,
  error,
}: {
  label: string;
  seed: number;
  digits: string;
  onChange: (digits: string) => void;
  error?: string;
}) {
  return (
    <FieldRow label={label}>
      <MaskInput
        key={`${label}-${seed}`}
        w="100%"
        aria-label={label}
        mask={IPV4_MASK}
        defaultValue={toMasked(toAddress(digits))}
        onChangeRaw={onChange}
        error={error}
      />
    </FieldRow>
  );
}

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
 * next (see KBRD-OS's `/usr/bin/kbrd-network`). That is the state most
 * of these settings are filled in from.
 *
 * Nothing here goes through the modal's own Save, for the same reason the
 * Backup tab doesn't: applying takes the interface down — usually the
 * very one this browser is on — so it is its own button, behind its own
 * confirmation, and the connection is expected to go away afterwards.
 */
export default function Network({ active }: { active: boolean }) {
  const [status, setStatus] = useState<NetworkStatus | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  // Bumped when the saved configuration is read in, to remount the
  // masked fields on their new values.
  const [seed, setSeed] = useState(0);
  // The first reading fills the form, and only the first: every later one
  // would overwrite what is being typed. A ref rather than state — it is
  // read and set inside the poll's own callback, and nothing renders off
  // it.
  const seeded = useRef(false);

  const [networks, setNetworks] = useState<string[]>([]);
  const [scanning, setScanning] = useState(false);

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

          const { ssid, ipv4 } = next.config;
          setDraft({
            ...EMPTY,
            ssid,
            mode: ipv4.mode,
            address: toDigits(ipv4.address),
            netmask: toDigits(ipv4.netmask),
            gateway: toDigits(ipv4.gateway),
            dns1: toDigits(ipv4.dns1),
            dns2: toDigits(ipv4.dns2),
          });
          setSeed((current) => current + 1);
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

  function patch(data: Partial<Draft>) {
    setDraft((current) => ({ ...current, ...data }));
    setApplied(false);
  }

  async function scan() {
    setScanning(true);
    setError(null);
    try {
      const { networks: found } = await scanNetworks();
      setNetworks(found.map((network) => network.ssid));
    } catch (failure) {
      setError(
        failure instanceof Error ? failure.message : "The scan failed",
      );
    }
    setScanning(false);
  }

  const static_ = draft.mode === "static";

  async function connect() {
    setConfirming(false);
    setSaving(true);
    setError(null);

    const body: NetworkWrite = {
      ssid: draft.ssid.trim(),
      ipv4: {
        mode: draft.mode,
        address: static_ ? toAddress(draft.address) : "",
        netmask: static_ ? toAddress(draft.netmask) : "",
        gateway: static_ ? toAddress(draft.gateway) : "",
        dns1: static_ ? toAddress(draft.dns1) : "",
        dns2: static_ ? toAddress(draft.dns2) : "",
      },
    };
    // Left out entirely while untouched — that is what keeps the saved
    // key, which is never sent back out to be shown here.
    if (draft.passphraseTouched) body.passphrase = draft.passphrase;

    try {
      await saveNetwork(body);
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

  // An address field is only in error once it holds something: a mask
  // reports its digits as they are typed, and "192.16" is not a mistake,
  // it is an address halfway in.
  const addressError = (digits: string, optional: boolean) => {
    if (!digits) return optional ? undefined : "Required";
    return toAddress(digits) ? undefined : "Incomplete address";
  };

  const netmaskError = (() => {
    const base = addressError(draft.netmask, false);
    if (base) return base;
    return isNetmask(toAddress(draft.netmask)) ? undefined : "Not a netmask";
  })();

  const passphraseError =
    draft.passphraseTouched &&
    draft.passphrase.length > 0 &&
    (draft.passphrase.length < PASSPHRASE_MIN ||
      draft.passphrase.length > PASSPHRASE_MAX)
      ? `Between ${PASSPHRASE_MIN} and ${PASSPHRASE_MAX} characters`
      : undefined;

  const staticErrors = static_
    ? [
        addressError(draft.address, false),
        netmaskError,
        addressError(draft.gateway, true),
        addressError(draft.dns1, true),
        addressError(draft.dns2, true),
      ]
    : [];

  const canConnect =
    draft.ssid.trim().length > 0 &&
    !passphraseError &&
    staticErrors.every((problem) => problem === undefined);

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
      <StateRow
        label="DNS"
        value={connectedTo?.ipv4.dns.join(", ") ?? ""}
      />

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
      <FieldRow label="Network (SSID)">
        <Group gap="xs" wrap="nowrap" w="100%">
          {/* An Autocomplete rather than a Select: a hidden network
              never turns up in a scan and still has to be typable. */}
          <Autocomplete
            style={{ flex: 1 }}
            aria-label="Network (SSID)"
            placeholder="Network name"
            data={networks}
            value={draft.ssid}
            maxLength={32}
            onChange={(value) => patch({ ssid: value })}
          />
          <Button
            color="gray"
            onClick={() => void scan()}
            loading={scanning}
            leftSection={<MdRefresh size={16} />}
          >
            Scan
          </Button>
        </Group>
      </FieldRow>
      <FieldRow label="Key">
        <PasswordInput
          w="100%"
          aria-label="Key"
          placeholder={
            status?.config.secured && !draft.passphraseTouched
              ? "Unchanged"
              : "Empty for an open network"
          }
          value={draft.passphrase}
          error={passphraseError}
          onChange={(event) =>
            patch({
              passphrase: event.currentTarget.value,
              passphraseTouched: true,
            })
          }
        />
      </FieldRow>
      <Text size="xs" c="dimmed">
        A saved key is never shown here. Leave the field alone to keep it,
        or type a new one to replace it — {PASSPHRASE_MIN} to{" "}
        {PASSPHRASE_MAX} characters, or empty for an open network.
      </Text>

      <Title order={4} mt="md">
        IPv4
      </Title>
      <FieldRow label="Addressing">
        <Select
          w="100%"
          aria-label="Addressing"
          allowDeselect={false}
          data={[
            { value: "dhcp", label: "DHCP" },
            { value: "static", label: "Static" },
          ]}
          value={draft.mode}
          onChange={(value) => {
            if (value === "dhcp" || value === "static") patch({ mode: value });
          }}
        />
      </FieldRow>

      {static_ && (
        <>
          <AddressField
            label="IP address"
            seed={seed}
            digits={draft.address}
            onChange={(digits) => patch({ address: digits })}
            error={addressError(draft.address, false)}
          />
          <AddressField
            label="Netmask"
            seed={seed}
            digits={draft.netmask}
            onChange={(digits) => patch({ netmask: digits })}
            error={netmaskError}
          />
          <AddressField
            label="Gateway"
            seed={seed}
            digits={draft.gateway}
            onChange={(digits) => patch({ gateway: digits })}
            error={addressError(draft.gateway, true)}
          />
          <AddressField
            label="DNS 1"
            seed={seed}
            digits={draft.dns1}
            onChange={(digits) => patch({ dns1: digits })}
            error={addressError(draft.dns1, true)}
          />
          <AddressField
            label="DNS 2"
            seed={seed}
            digits={draft.dns2}
            onChange={(digits) => patch({ dns2: digits })}
            error={addressError(draft.dns2, true)}
          />
          <Text size="xs" c="dimmed">
            Only the address and the netmask are required. Without a
            gateway the keyboard still answers on its own network, it
            just has no way out of it.
          </Text>
        </>
      )}

      <Group mt="md">
        <Button
          color="green"
          leftSection={<MdWifi size={16} />}
          disabled={!canConnect || saving}
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
          at{" "}
          <b>
            {static_ ? toAddress(draft.address) || "its new address" : "its new address"}
          </b>
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
