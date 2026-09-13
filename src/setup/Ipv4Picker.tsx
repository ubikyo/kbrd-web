import {
  Box,
  Group,
  Input,
  Select,
  Stack,
  Text,
  TextInput,
} from "@mantine/core";
import { MdError } from "react-icons/md";

import { gatewayFor } from "../components/settings/ipv4";
import {
  ipv4Problems,
  type NetworkDraft,
} from "../components/settings/networkDraft";

/** The one field that is worth filling in the moment Static is picked:
 * the mask a home network is almost always on, as a shape to type over.
 * It counts as unfilled until it is changed (see `ipv4Problems`), so it
 * doesn't pretend the step is done.
 *
 * The address is not guessed at — `0.0.0.0` said nothing the empty box
 * doesn't. The gateway fills itself in as soon as the two above it say
 * something, and the resolvers have nothing to be read off. */
const DEFAULT_NETMASK = "255.255.255.0";

type Props = {
  draft: NetworkDraft;
  onChange: (patch: Partial<NetworkDraft>) => void;
};

/** How much of each field its name takes. A fixed width rather than one
 * per label, so five stacked fields read as one column rather than five
 * indents — "Netmask" is the long one and sets it. */
const PREFIX_WIDTH = 85;

/** The mark a field in error carries, and the one the message below the
 * fields repeats — the same glyph in both places, so the line and the
 * rows it is about are read as one thing. */
function ErrorMark() {
  return <MdError size={16} color="var(--mantine-color-red-6)" />;
}

/** One IPv4 field, named inside itself rather than above: five of these
 * stack, and a heading apiece would double the height of the column.
 *
 * Plain text, checked against `ipv4.ts` as it is typed — so what is shown
 * is what was written, rather than a fixed run of slots that pads `0` out
 * to `000`. */
function AddressField({
  label,
  value,
  onChange,
  invalid,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  /** Still to be filled in, or filled in with something that isn't an
   * address. Marked at the end of the row rather than by colouring
   * anything: these fields are joined into one frame, and a red middle
   * would cut it in half. */
  invalid?: boolean;
}) {
  return (
    <TextInput
      // The prefix is decoration, so the field keeps a name of its own.
      aria-label={label}
      leftSection={
        <Text size="sm" c="dimmed">
          {label}
        </Text>
      }
      leftSectionWidth={PREFIX_WIDTH}
      // Mantine centres a section in its own width; these read as labels,
      // so they start where a label would.
      leftSectionProps={{
        style: { justifyContent: "flex-start", paddingLeft: 12 },
      }}
      rightSection={invalid ? <ErrorMark /> : undefined}
      rightSectionPointerEvents="none"
      inputMode="decimal"
      maxLength={15}
      value={value}
      onChange={(event) => onChange(event.currentTarget.value)}
    />
  );
}

/**
 * The wizard's addressing step: how the keyboard takes an address on the
 * network picked before it.
 *
 * The choice on the left, what it asks for on the right — so turning
 * Static on fills the column opposite rather than growing the page. The
 * same question in Settings is a stack of rows in a modal (see
 * `NetworkIpv4Fields`), which is the right shape there.
 */
export default function Ipv4Picker({ draft, onChange }: Props) {
  const problems = new Set(ipv4Problems(draft));

  /** The address and the mask are what a gateway is read off, so a change
   * to either carries it along — until the two say something a router
   * could be on, the field is left as it is. */
  function changeNetwork(patch: Partial<NetworkDraft>) {
    const address = patch.address ?? draft.address;
    const netmask = patch.netmask ?? draft.netmask;
    const gateway = gatewayFor(address, netmask);
    onChange(gateway ? { ...patch, gateway } : patch);
  }

  return (
    <Box className="setup-columns">
      <Select
        label="Addressing"
        aria-label="Addressing"
        allowDeselect={false}
        data={[
          { value: "dhcp", label: "DHCP" },
          { value: "static", label: "Static" },
        ]}
        value={draft.mode}
        onChange={(value) => {
          if (value === "dhcp") onChange({ mode: "dhcp" });
          if (value === "static")
            onChange({
              mode: "static",
              netmask: draft.netmask || DEFAULT_NETMASK,
            });
        }}
      />

      {draft.mode === "static" && (
        <Box>
          {/* Outside the stack below, which would put its own `md`
              between this and the first field: a heading stands the same
              2px off what it heads as every other label in the wizard. */}
          <Input.Label>IP address</Input.Label>
          <Stack gap="md">
            {/* The three that describe one network, as one frame. */}
            <Box className="setup-joined">
              <AddressField
                label="Address"
                value={draft.address}
                onChange={(value) => changeNetwork({ address: value })}
                invalid={problems.has("address")}
              />
              <AddressField
                label="Netmask"
                value={draft.netmask}
                onChange={(value) => changeNetwork({ netmask: value })}
                invalid={problems.has("netmask")}
              />
              <AddressField
                label="Gateway"
                value={draft.gateway}
                onChange={(value) => onChange({ gateway: value })}
                invalid={problems.has("gateway")}
              />
            </Box>

            {/* And the two resolvers, as another, under a heading of
                their own. A margin rather than the padding it looks
                like: a label is held to a fixed height here (see
                `--setup-label-height`), and padding would come out of
                that height rather than sit above it. */}
            <Box>
              <Input.Label mt={20}>DNS</Input.Label>
              <Box className="setup-joined">
                <AddressField
                  label="DNS 1"
                  value={draft.dns1}
                  onChange={(value) => onChange({ dns1: value })}
                  invalid={problems.has("dns1")}
                />
                <AddressField
                  label="DNS 2"
                  value={draft.dns2}
                  onChange={(value) => onChange({ dns2: value })}
                  invalid={problems.has("dns2")}
                />
              </Box>
            </Box>

            {/* The fields say which of them they are; this says what to
                do about it, under the same mark they carry. */}
            {problems.size > 0 && (
              <Group gap={6} align="center" wrap="nowrap">
                <ErrorMark />
                <Text size="sm" c="red">
                  Please correct the above settings.
                </Text>
              </Group>
            )}
          </Stack>
        </Box>
      )}
    </Box>
  );
}
