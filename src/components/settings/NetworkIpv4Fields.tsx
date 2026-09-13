import { Select, Stack, Text, TextInput } from "@mantine/core";

import FieldRow from "./FieldRow";
import { networkDraftErrors, type NetworkDraft } from "./networkDraft";

/** One IPv4 field. Plain text, checked against `ipv4.ts` as it is typed —
 * so what is shown is what was written, dots and all. */
function AddressField({
  label,
  value,
  onChange,
  error,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
}) {
  return (
    <FieldRow label={label}>
      <TextInput
        w="100%"
        aria-label={label}
        inputMode="decimal"
        maxLength={15}
        value={value}
        onChange={(event) => onChange(event.currentTarget.value)}
        error={error}
      />
    </FieldRow>
  );
}

type Props = {
  draft: NetworkDraft;
  onChange: (patch: Partial<NetworkDraft>) => void;
};

/**
 * How the keyboard addresses itself on the network it joins: DHCP, or a
 * static address with its netmask, gateway and two DNS servers.
 *
 * The other half of a Wi-Fi setting — which network, and its key — is
 * `NetworkWifiFields`. Settings' Network tab shows both together; the
 * first-run wizard asks them as two steps and lays this one out in two
 * columns of its own (see `setup/Ipv4Picker`).
 */
export default function NetworkIpv4Fields({ draft, onChange }: Props) {
  const errors = networkDraftErrors(draft);

  return (
    <Stack gap="md">
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
            if (value === "dhcp" || value === "static") onChange({ mode: value });
          }}
        />
      </FieldRow>

      {draft.mode === "static" && (
        <>
          <AddressField
            label="IP address"
            value={draft.address}
            onChange={(value) => onChange({ address: value })}
            error={errors.address}
          />
          <AddressField
            label="Netmask"
            value={draft.netmask}
            onChange={(value) => onChange({ netmask: value })}
            error={errors.netmask}
          />
          <AddressField
            label="Gateway"
            value={draft.gateway}
            onChange={(value) => onChange({ gateway: value })}
            error={errors.gateway}
          />
          <AddressField
            label="DNS 1"
            value={draft.dns1}
            onChange={(value) => onChange({ dns1: value })}
            error={errors.dns1}
          />
          <AddressField
            label="DNS 2"
            value={draft.dns2}
            onChange={(value) => onChange({ dns2: value })}
            error={errors.dns2}
          />
          <Text size="xs" c="dimmed">
            Only the address and the netmask are required. Without a
            gateway the keyboard still answers on its own network, it just
            has no way out of it.
          </Text>
        </>
      )}
    </Stack>
  );
}
