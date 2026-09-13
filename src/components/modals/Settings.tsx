import { useEffect, useState } from "react";
import {
  Box,
  Button,
  FileButton,
  Group,
  Modal,
  NumberInput,
  Progress,
  Select,
  Stack,
  Switch,
  Tabs,
  Text,
  Title,
  useMantineColorScheme,
} from "@mantine/core";
import {
  MdCode,
  MdDownload,
  MdPalette,
  MdSdStorage,
  MdStorage,
  MdStraighten,
  MdTune,
  MdUpload,
  MdWifi,
} from "react-icons/md";

import {
  FALLBACK_HEIGHT,
  FALLBACK_WIDTH,
  getDevice,
  type DeviceStatus,
} from "../../api/device";
import { BACKUP_DOWNLOAD_URL, restoreBackup } from "../../api/backup";
import { getStorage, type StoragePartition } from "../../api/storage";
import type { LayoutSettings } from "../../types/layout";
import Confirmation from "./Confirmation";
import FieldRow from "../settings/FieldRow";
import Network from "../settings/Network";
import type {
  ColorSchemePreference,
  PanelState,
  StartupMode,
} from "../../utils/preferences";

const DEVICE_POLL_INTERVAL_MS = 5000;
const MM_PER_INCH = 25.4;

// A partition is worth a second look before it is actually full: at 75%
// the bar goes amber, at 90% red. `/data` is the one that moves — it is
// where media, fonts and the database all land.
const STORAGE_WARN_PERCENT = 75;
const STORAGE_FULL_PERCENT = 90;

/** The Appearance tab's own three answers. "System" is Mantine's own
 * `auto` — the value follows the OS rather than naming a palette, which
 * is why it can't just be a third theme. */
const COLOR_SCHEMES: { value: ColorSchemePreference; label: string }[] = [
  { value: "auto", label: "System" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];

const isColorScheme = (value: string | null): value is ColorSchemePreference =>
  COLOR_SCHEMES.some((option) => option.value === value);

/** One side panel's own "starts open or closed" row — the Media and
 * Inspector panels take the same control (see `PanelState`). */
function PanelRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: PanelState;
  onChange: (state: PanelState) => void;
}) {
  return (
    <FieldRow label={label}>
      <Select
        w="100%"
        aria-label={label}
        allowDeselect={false}
        data={[
          { value: "open", label: "Open" },
          { value: "close", label: "Close" },
        ]}
        value={value}
        onChange={(next) => {
          if (next === "open" || next === "close") onChange(next);
        }}
      />
    </FieldRow>
  );
}

/** Binary units under decimal names, which is what the Media panel's own
 * "200 MB" limit means too — the two numbers are read against each other,
 * so they are counted the same way. */
function formatBytes(bytes: number) {
  const units = ["B", "kB", "MB", "GB", "TB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  // Whole bytes and kilobytes have no decimal worth showing; a size in MB
  // or above does, and one digit is enough to see a partition move.
  const digits = unit < 2 ? 0 : 1;
  return `${value.toFixed(digits)} ${units[unit]}`;
}

/** One partition's own bar, over what it holds and what is left. */
function PartitionRow({ partition }: { partition: StoragePartition }) {
  const percent = (partition.used / partition.total) * 100;
  const color =
    percent >= STORAGE_FULL_PERCENT
      ? "red"
      : percent >= STORAGE_WARN_PERCENT
        ? "yellow"
        : "green";
  return (
    <Stack gap={4}>
      <Group justify="space-between" gap="xs" wrap="nowrap">
        <Text size="sm">
          {partition.name}{" "}
          <Text span size="xs" c="dimmed">
            {partition.mount}
          </Text>
        </Text>
        <Text size="sm" fw={700} c={color}>
          {Math.round(percent)}%
        </Text>
      </Group>
      <Progress
        value={percent}
        color={color}
        aria-label={`${partition.name} usage`}
      />
      <Text size="xs" c="dimmed">
        {formatBytes(partition.used)} used of {formatBytes(partition.total)} —{" "}
        {formatBytes(partition.free)} free
      </Text>
    </Stack>
  );
}

function DisplayRow({ label, value }: { label: string; value: string }) {
  return (
    <FieldRow label={label}>
      <Text size="sm" c="dimmed">
        {value}
      </Text>
    </FieldRow>
  );
}

type Props = {
  opened: boolean;
  onClose: () => void;
  settings: LayoutSettings;
  onSave: (settings: LayoutSettings) => void;
  // The Developer tab's "Enable debug" — app-level rather than part of
  // `LayoutSettings` (nothing about it is persisted with a layout), so
  // `App` holds it and applies it (see its own `contextmenu` handler and
  // the `debug` body class).
  debug: boolean;
  onDebugChange: (debug: boolean) => void;
  // The "On open" tab — app-level too (see `debug`), but persisted on
  // its own (see `utils/preferences`) since these only mean anything
  // across a reload. Each says what the app starts as, not what it is
  // now: opening a panel from its own tab doesn't come through here.
  startupMode: StartupMode;
  onStartupModeChange: (mode: StartupMode) => void;
  mediaPanel: PanelState;
  onMediaPanelChange: (state: PanelState) => void;
  inspectorPanel: PanelState;
  onInspectorPanelChange: (state: PanelState) => void;
};

export default function Settings({
  opened,
  onClose,
  settings,
  onSave,
  debug,
  onDebugChange,
  startupMode,
  onStartupModeChange,
  mediaPanel,
  onMediaPanelChange,
  inspectorPanel,
  onInspectorPanelChange,
}: Props) {
  const [tab, setTab] = useState<string | null>("preferences");
  const [draft, setDraft] = useState<LayoutSettings>(settings);
  const [debugDraft, setDebugDraft] = useState(debug);
  const [startupModeDraft, setStartupModeDraft] =
    useState<StartupMode>(startupMode);
  const [mediaPanelDraft, setMediaPanelDraft] = useState<PanelState>(mediaPanel);
  const [inspectorPanelDraft, setInspectorPanelDraft] =
    useState<PanelState>(inspectorPanel);
  const [device, setDevice] = useState<DeviceStatus>({ connected: false });
  // The Storage tab, polled on the same interval as the device: it is a
  // reading of the filesystems as they are, not a setting, so there is
  // nothing here for Save or Cancel to do.
  const [partitions, setPartitions] = useState<StoragePartition[] | null>(null);

  // The Backup tab. Nothing here is drafted the way the fields above are:
  // a download is a download, and a restore replaces the database the
  // moment it is confirmed — neither has anything for Save to apply, and
  // Cancel can't put a restored database back. `restoreFile` is only the
  // file picked so far; it isn't sent until the confirmation says so.
  const [restoreFile, setRestoreFile] = useState<File | null>(null);
  const [confirmingRestore, setConfirmingRestore] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [restoreError, setRestoreError] = useState<string | null>(null);

  // The Appearance tab. Unlike every other control in this modal, the
  // colour scheme is *not* drafted: a theme that only arrived on Save
  // would be picked blind, so it's applied the moment it's chosen and
  // the whole app repaints underneath the modal. Cancel still has to
  // mean cancel, though — hence the value as it stood when the modal
  // opened, which is what a cancel puts back.
  //
  // Mantine owns the value itself (and its persistence, see
  // `ColorSchemePreference`); nothing is mirrored into local state here,
  // so there is no second copy to keep in step.
  const { colorScheme, setColorScheme } = useMantineColorScheme();
  const [colorSchemeAtOpen, setColorSchemeAtOpen] = useState(colorScheme);

  // Reset the draft to the last saved values whenever the modal opens back up.
  const [wasOpened, setWasOpened] = useState(opened);
  if (opened !== wasOpened) {
    setWasOpened(opened);
    if (opened) {
      setTab("preferences");
      setDraft(settings);
      setDebugDraft(debug);
      setStartupModeDraft(startupMode);
      setMediaPanelDraft(mediaPanel);
      setInspectorPanelDraft(inspectorPanel);
      setColorSchemeAtOpen(colorScheme);
      setRestoreFile(null);
      setConfirmingRestore(false);
      setRestoreError(null);
    }
  }

  async function restore() {
    if (!restoreFile) return;
    setConfirmingRestore(false);
    setRestoring(true);
    setRestoreError(null);
    try {
      await restoreBackup(restoreFile);
    } catch (error) {
      setRestoring(false);
      setRestoreError(
        error instanceof Error ? error.message : "The restore failed",
      );
      return;
    }
    // Every layout, layer and key on screen came from the database that
    // has just been replaced, and the panels hold their own copies of it
    // — reloading is what puts the app back in step with what is now
    // there, and it is quicker than re-fetching each of them by hand.
    window.location.reload();
  }

  useEffect(() => {
    if (!opened) return;
    let cancelled = false;
    function poll() {
      getDevice().then(
        (status) => {
          if (!cancelled) setDevice(status);
        },
        () => {},
      );
      getStorage().then(
        (status) => {
          if (!cancelled) setPartitions(status.partitions);
        },
        () => {
          if (!cancelled) setPartitions([]);
        },
      );
    }
    poll();
    const timer = window.setInterval(poll, DEVICE_POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [opened]);

  function patch(data: Partial<LayoutSettings>) {
    setDraft((current) => ({ ...current, ...data }));
  }

  function cancel() {
    setDraft(settings);
    setDebugDraft(debug);
    setStartupModeDraft(startupMode);
    setMediaPanelDraft(mediaPanel);
    setInspectorPanelDraft(inspectorPanel);
    // The one change already in force on screen — put the app back in
    // whatever it was wearing when this modal opened.
    setColorScheme(colorSchemeAtOpen);
    onClose();
  }

  function save() {
    onSave(draft);
    onDebugChange(debugDraft);
    onStartupModeChange(startupModeDraft);
    onMediaPanelChange(mediaPanelDraft);
    onInspectorPanelChange(inspectorPanelDraft);
    // Nothing to apply for Appearance — it went in as it was picked, and
    // Mantine has already stored it. Saving only makes that permanent by
    // *not* undoing it the way `cancel` does.
    onClose();
  }

  const hasValidPhysicalSize =
    draft.physicalWidthMm > 0 && draft.physicalHeightMm > 0;

  // Falls back to the same 1280×800 KBRD-DEV uses while no screen is
  // connected — see `Display` — so Resolution/DPI stay populated instead
  // of going blank.
  const resolutionWidth = device.connected ? device.width : FALLBACK_WIDTH;
  const resolutionHeight = device.connected ? device.height : FALLBACK_HEIGHT;
  const resolutionValue = `${resolutionWidth} × ${resolutionHeight} px`;
  const dpiValue = hasValidPhysicalSize
    ? `${Math.round(resolutionWidth / (draft.physicalWidthMm / MM_PER_INCH))} × ${Math.round(
        resolutionHeight / (draft.physicalHeightMm / MM_PER_INCH),
      )} dpi`
    : "—";

  return (
    <Modal
      opened={opened}
      onClose={cancel}
      title={<Text fw={700}>Settings</Text>}
      centered
      // "lg" (620px) + 50px.
      size={670}
      overlayProps={{ backgroundOpacity: 0.65, blur: 2 }}
      styles={{
        content: {
          display: "flex",
          flexDirection: "column",
          // +50px on top of the usual 70vh.
          height: "calc(70vh + 50px)",
        },
        body: { display: "flex", flexDirection: "column", flex: 1, minHeight: 0, padding: 0 },
      }}
    >
      <Box
        style={{
          flex: 1,
          minHeight: 0,
          overflow: "hidden",
          padding: "24px 40px 40px",
        }}
      >
        <Tabs
          value={tab}
          onChange={setTab}
          orientation="vertical"
          variant="outline"
          style={
            {
              height: "100%",
              "--tab-border-color": "var(--kbrd-border-color)",
            } as React.CSSProperties
          }
          styles={{
            // Mantine centers a tab's label by default; this one reads
            // left to right like the rest of the modal's labels.
            tabLabel: { textAlign: "left" },
          }}
        >
          <Tabs.List w={180} style={{ flexShrink: 0 }}>
            <Tabs.Tab value="preferences" leftSection={<MdTune size={16} />}>
              Preferences
            </Tabs.Tab>
            <Tabs.Tab value="appearance" leftSection={<MdPalette size={16} />}>
              Appearance
            </Tabs.Tab>
            <Tabs.Tab value="display" leftSection={<MdStraighten size={16} />}>
              Display
            </Tabs.Tab>
            <Tabs.Tab value="network" leftSection={<MdWifi size={16} />}>
              Network
            </Tabs.Tab>
            <Tabs.Tab value="storage" leftSection={<MdSdStorage size={16} />}>
              Storage
            </Tabs.Tab>
            <Tabs.Tab value="backup" leftSection={<MdStorage size={16} />}>
              Backup
            </Tabs.Tab>
            <Tabs.Tab value="developer" leftSection={<MdCode size={16} />}>
              Developer
            </Tabs.Tab>
          </Tabs.List>

          <Tabs.Panel
            value="preferences"
            style={{ overflowY: "auto", padding: 0, paddingLeft: 40 }}
          >
            <Stack gap="md">
              <Title order={4}>On open</Title>
              <FieldRow label="Set mode to">
                <Select
                  w="100%"
                  aria-label="Set mode to"
                  allowDeselect={false}
                  data={[
                    { value: "layout", label: "Layout" },
                    { value: "layer", label: "Layer" },
                  ]}
                  value={startupModeDraft}
                  onChange={(value) => {
                    if (value === "layout" || value === "layer")
                      setStartupModeDraft(value);
                  }}
                />
              </FieldRow>
              <PanelRow
                label="Panel media"
                value={mediaPanelDraft}
                onChange={setMediaPanelDraft}
              />
              <PanelRow
                label="Panel inspector"
                value={inspectorPanelDraft}
                onChange={setInspectorPanelDraft}
              />
            </Stack>
          </Tabs.Panel>

          <Tabs.Panel
            value="appearance"
            style={{ overflowY: "auto", padding: 0, paddingLeft: 40 }}
          >
            <Stack gap="md">
              <Title order={4}>Theme</Title>
              <FieldRow label="Color scheme">
                <Select
                  w="100%"
                  aria-label="Color scheme"
                  allowDeselect={false}
                  data={COLOR_SCHEMES}
                  value={colorScheme}
                  onChange={(value) => {
                    if (isColorScheme(value)) setColorScheme(value);
                  }}
                />
              </FieldRow>
              <Text size="xs" c="dimmed">
                System follows this machine's own light/dark setting, and
                changes with it. The whole app turns over, the display
                preview included — note that the device itself always
                draws on black, so a light theme shows your layout on a
                ground the hardware doesn't have.
              </Text>
            </Stack>
          </Tabs.Panel>

          <Tabs.Panel
            value="display"
            style={{ overflowY: "auto", padding: 0, paddingLeft: 40 }}
          >
            <Stack gap="md">
              <Title order={4}>Geometry</Title>
              <FieldRow label="Physical width (mm)">
                <NumberInput
                  w="100%"
                  aria-label="Physical width (mm)"
                  suffix=" mm"
                  min={1}
                  step={1}
                  required
                  value={draft.physicalWidthMm}
                  error={draft.physicalWidthMm > 0 ? undefined : "Required"}
                  success={draft.physicalWidthMm > 0}
                  onChange={(value) =>
                    patch({
                      physicalWidthMm: typeof value === "number" ? value : 0,
                    })
                  }
                />
              </FieldRow>
              <FieldRow label="Physical height (mm)">
                <NumberInput
                  w="100%"
                  aria-label="Physical height (mm)"
                  suffix=" mm"
                  min={1}
                  step={1}
                  required
                  value={draft.physicalHeightMm}
                  error={draft.physicalHeightMm > 0 ? undefined : "Required"}
                  success={draft.physicalHeightMm > 0}
                  onChange={(value) =>
                    patch({
                      physicalHeightMm: typeof value === "number" ? value : 0,
                    })
                  }
                />
              </FieldRow>

              <Title order={4} mt="md">Information</Title>
              <FieldRow label="State">
                <Text size="sm" fw={700} c={device.connected ? "green" : "red"}>
                  {device.connected ? "Connected" : "Disconnected"}
                </Text>
              </FieldRow>
              <DisplayRow label="Resolution (px)" value={resolutionValue} />
              <DisplayRow label="DPI (x / y)" value={dpiValue} />
            </Stack>
          </Tabs.Panel>

          <Tabs.Panel
            value="network"
            style={{ overflowY: "auto", padding: 0, paddingLeft: 40 }}
          >
            {/* Polls, scans and applies only while it is the tab on
                screen — a scan takes the radio for several seconds, and
                nothing about it belongs to a modal nobody is looking
                at. */}
            <Network active={opened && tab === "network"} />
          </Tabs.Panel>

          <Tabs.Panel
            value="storage"
            style={{ overflowY: "auto", padding: 0, paddingLeft: 40 }}
          >
            <Stack gap="md">
              <Title order={4}>Partitions</Title>
              <Text size="xs" c="dimmed">
                The card's own filesystems, read afresh every few seconds.
                Data is the one that moves: the media library, the fonts
                and the database all live on it.
              </Text>
              {partitions === null ? (
                <Text size="sm" c="dimmed">
                  Reading…
                </Text>
              ) : partitions.length === 0 ? (
                <Text size="sm" c="dimmed">
                  No filesystem reported.
                </Text>
              ) : (
                <Stack gap="lg">
                  {partitions.map((partition) => (
                    <PartitionRow key={partition.mount} partition={partition} />
                  ))}
                </Stack>
              )}
            </Stack>
          </Tabs.Panel>

          <Tabs.Panel
            value="backup"
            style={{ overflowY: "auto", padding: 0, paddingLeft: 40 }}
          >
            <Stack gap="md">
              <Title order={4}>Backup</Title>
              <Text size="xs" c="dimmed">
                Saves the whole device as one archive: the database —
                every layout, layer, key and plugin setting — and the media
                library's own images and videos.
              </Text>
              <Group>
                <Button
                  component="a"
                  href={BACKUP_DOWNLOAD_URL}
                  download
                  color="gray"
                  leftSection={<MdDownload size={16} />}
                >
                  Download backup
                </Button>
              </Group>

              <Title order={4} mt="md">
                Restore
              </Title>
              <Text size="xs" c="dimmed">
                Puts a backup back, replacing everything on the device —
                layouts and medias alike — with what that archive holds.
                Anything done since it was taken is lost, and there is no
                undo: download a backup of what is here first if you want
                to be able to come back to it.
              </Text>
              <Group gap="sm">
                {/* Neither of these goes through Save: a restore takes
                    effect when it is confirmed, not when the modal is
                    closed (see `restore`). */}
                <FileButton
                  onChange={(file) => {
                    setRestoreFile(file);
                    setRestoreError(null);
                  }}
                  accept=".zip,application/zip"
                >
                  {(props) => (
                    <Button
                      {...props}
                      color="gray"
                      leftSection={<MdUpload size={16} />}
                      disabled={restoring}
                    >
                      Choose a backup
                    </Button>
                  )}
                </FileButton>
                <Button
                  color="red"
                  disabled={!restoreFile || restoring}
                  loading={restoring}
                  onClick={() => setConfirmingRestore(true)}
                >
                  Restore
                </Button>
              </Group>
              {restoreFile && (
                <Text size="xs" c="dimmed">
                  {restoreFile.name}
                </Text>
              )}
              {restoreError && (
                <Text size="xs" c="red">
                  {restoreError}
                </Text>
              )}
            </Stack>
          </Tabs.Panel>

          <Tabs.Panel
            value="developer"
            style={{ overflowY: "auto", padding: 0, paddingLeft: 40 }}
          >
            <Stack gap="md">
              <Title order={4}>Developer</Title>
              <FieldRow label="Enable debug">
                <Switch
                  aria-label="Enable debug"
                  color="green"
                  checked={debugDraft}
                  onChange={(event) =>
                    setDebugDraft(event.currentTarget.checked)
                  }
                />
              </FieldRow>
            </Stack>
          </Tabs.Panel>
        </Tabs>
      </Box>

      <Group
        justify="flex-end"
        p="md"
        style={{
          flexShrink: 0,
          borderTop: "1px solid var(--kbrd-border-color)",
        }}
      >
        <Button color="gray" onClick={cancel}>Cancel</Button>
        <Button color="green" onClick={save} disabled={!hasValidPhysicalSize}>
          Save
        </Button>
      </Group>

      {confirmingRestore && restoreFile && (
        <Confirmation
          title="Restore this backup?"
          message={
            <>
              Everything on this device will be replaced with what{" "}
              <b>{restoreFile.name}</b> holds, and the app will reload.
              This cannot be undone.
            </>
          }
          onConfirm={() => void restore()}
          onCancel={() => setConfirmingRestore(false)}
        />
      )}
    </Modal>
  );
}
