import { useState } from "react";
import {
  Autocomplete,
  Button,
  Group,
  PasswordInput,
  Stack,
  Text,
} from "@mantine/core";
import { MdRefresh } from "react-icons/md";

import { scanNetworks } from "../../api/network";
import FieldRow from "./FieldRow";
import { networkDraftErrors, type NetworkDraft } from "./networkDraft";

type Props = {
  draft: NetworkDraft;
  onChange: (patch: Partial<NetworkDraft>) => void;
  /** Whether a key is already stored for the saved network — what turns
   * the key field's placeholder into "Unchanged", and the only case with
   * anything worth explaining underneath it. */
  secured: boolean;
  /** A scan that failed, so the caller can show it wherever it shows its
   * own errors. */
  onScanError?: (message: string) => void;
};

/**
 * Which network to join, and its key — the half of a Wi-Fi setting that
 * is about the radio rather than about addressing (see
 * `NetworkIpv4Fields` for the other).
 *
 * Settings' Network tab shows the two together, one after the other; the
 * first-run wizard asks them as two steps and draws its own, roomier
 * picker for this one (see `setup/WifiPicker`).
 */
export default function NetworkWifiFields({
  draft,
  onChange,
  secured,
  onScanError,
}: Props) {
  const [networks, setNetworks] = useState<string[]>([]);
  const [scanning, setScanning] = useState(false);

  const errors = networkDraftErrors(draft);

  async function scan() {
    setScanning(true);
    try {
      const { networks: found } = await scanNetworks();
      setNetworks(found.map((network) => network.ssid));
    } catch (failure) {
      onScanError?.(
        failure instanceof Error ? failure.message : "The scan failed",
      );
    }
    setScanning(false);
  }

  return (
    <Stack gap="md">
      <FieldRow label="Network (SSID)">
        <Group gap="xs" wrap="nowrap" w="100%">
          {/* An Autocomplete rather than a Select: a hidden network never
              turns up in a scan and still has to be typable. */}
          <Autocomplete
            style={{ flex: 1 }}
            aria-label="Network (SSID)"
            placeholder="Network name"
            data={networks}
            value={draft.ssid}
            maxLength={32}
            onChange={(value) => onChange({ ssid: value })}
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
            secured && !draft.passphraseTouched
              ? "Unchanged"
              : "Empty for an open network"
          }
          value={draft.passphrase}
          error={errors.passphrase}
          onChange={(event) =>
            onChange({
              passphrase: event.currentTarget.value,
              passphraseTouched: true,
            })
          }
        />
      </FieldRow>

      {/* Only where there is a stored key, which is the only case that
          needs explaining: an untouched field keeps it rather than
          clearing it. Nothing is stored on a first run, so the wizard
          shows no such line. */}
      {secured && (
        <Text size="xs" c="dimmed">
          A saved key is never shown here. Leave the field alone to keep
          it, or type a new one to replace it.
        </Text>
      )}
    </Stack>
  );
}
