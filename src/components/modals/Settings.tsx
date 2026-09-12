import { useEffect, useState } from "react";
import {
  Box,
  Button,
  Group,
  Modal,
  NumberInput,
  Select,
  Stack,
  Switch,
  Tabs,
  Text,
  Title,
  useMantineColorScheme,
} from "@mantine/core";
import { MdCode, MdPalette, MdStraighten, MdTune } from "react-icons/md";

import {
  FALLBACK_HEIGHT,
  FALLBACK_WIDTH,
  getDevice,
  type DeviceStatus,
} from "../../api/device";
import type { LayoutSettings } from "../../types/layout";
import type {
  ColorSchemePreference,
  PanelState,
  StartupMode,
} from "../../utils/preferences";

const DEVICE_POLL_INTERVAL_MS = 5000;
const MM_PER_INCH = 25.4;

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

type FieldRowProps = {
  label: string;
  children: React.ReactNode;
};

/** Same 40/60 label/control split for every field in this modal. */
function FieldRow({ label, children }: FieldRowProps) {
  return (
    <Box
      style={{
        display: "grid",
        gridTemplateColumns: "minmax(0, 4fr) minmax(0, 6fr)",
        columnGap: "var(--mantine-spacing-md)",
        alignItems: "center",
      }}
    >
      <Text size="sm">{label}</Text>
      {children}
    </Box>
  );
}

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
    }
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
                    { value: "mapping", label: "Mapping" },
                  ]}
                  value={startupModeDraft}
                  onChange={(value) => {
                    if (value === "layout" || value === "mapping")
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
            value="developer"
            style={{ overflowY: "auto", padding: 0, paddingLeft: 40 }}
          >
            <Stack gap="md">
              <Title order={4}>Developer</Title>
              <FieldRow label="Enable debug">
                <Switch
                  aria-label="Enable debug"
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
    </Modal>
  );
}
