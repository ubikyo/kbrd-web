import { useEffect, useState } from "react";
import {
  Box,
  Button,
  FileButton,
  Group,
  Modal,
  Progress,
  ScrollArea,
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
  MdLan,
  MdLock,
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
import { CodeRefused, changePassword } from "../../api/auth";
import { getStorage, type StoragePartition } from "../../api/storage";
import type { LayoutSettings } from "../../types/layout";
import Confirmation from "./Confirmation";
import Code from "../settings/Code";
import {
  EMPTY_CODE_DRAFT,
  codeDraftReady,
  codeDraftTouched,
  type CodeDraft,
} from "../settings/codeDraft";
import FieldRow from "../settings/FieldRow";
import { NetworkIpv4Tab, NetworkWifiTab } from "../settings/Network";
import { useNetwork } from "../settings/useNetwork";
import ScreenPicker from "../../setup/ScreenPicker";
import {
  isScreenComplete,
  screenSize,
  type ScreenDraft,
} from "../../setup/screenDraft";
import type {
  ColorSchemePreference,
  PanelState,
  StartupMode,
} from "../../utils/preferences";

const DEVICE_POLL_INTERVAL_MS = 5000;
const MM_PER_INCH = 25.4;

// The title bar and the Cancel/Save bar are both lifted out of the flow
// and laid over the tab pages, so that a page's own scroll — the only
// one in this modal — runs the dialog's whole height and its scrollbar
// can be drawn on the right edge from top to bottom rather than on the
// stretch between the two bars. Everything under them is then held clear
// of them by padding instead, which is what these two are for.
//
// `HEADER_HEIGHT` is Mantine's own modal header height (its `min-height`
// with a single-line title); `FOOTER_HEIGHT` is the bar we draw below —
// an `md` padding either side of a default-size button (16 + 36 + 16).
const HEADER_HEIGHT = 60;
const FOOTER_HEIGHT = 68;

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

/** One tab's own page, and the only thing in this modal that scrolls.
 *
 * The panel takes the dialog's whole height and runs to its right edge —
 * the modal keeps no padding of its own on any of those three sides (see
 * the `Box` below) — so the scrollbar is a line on that edge, top to
 * bottom, rather than a bar floating on the stretch between the title
 * and the buttons. Mantine lifts a scrollbar inside a modal above the
 * header (z-index 1001 against its 1000), and the footer below is given
 * the header's own 1000, so the line crosses both.
 *
 * The margins the modal gave up are put back inside the scrolled content
 * — including the room the two bars take, which is what keeps the text
 * from running under them. */
function TabPage({
  value,
  children,
}: {
  value: string;
  children: React.ReactNode;
}) {
  return (
    <Tabs.Panel
      value={value}
      style={{ overflow: "hidden", padding: 0, paddingLeft: 40 }}
    >
      <ScrollArea
        h="100%"
        type="auto"
        scrollbarSize={2}
        // Mantine insets the thumb by a fifth of the scrollbar's size
        // and rounds both off; at 2px on the dialog's own edge neither
        // is a line any more — the inset leaves next to nothing to draw,
        // and the radius takes the ends off what is left.
        styles={{
          scrollbar: { padding: 0, borderRadius: 0 },
          thumb: { borderRadius: 0 },
        }}
      >
        <Box pt={HEADER_HEIGHT + 24} pb={FOOTER_HEIGHT + 40} pr={40}>
          {children}
        </Box>
      </ScrollArea>
    </Tabs.Panel>
  );
}

type Props = {
  opened: boolean;
  onClose: () => void;
  settings: LayoutSettings;
  /** Which screen the device says it is attached to, in the shape the
   * wizard's own picker edits (see `useDisplaySettings`). Settings asks
   * the same question off the same list, so the two share the draft. */
  screen: ScreenDraft;
  onSave: (settings: LayoutSettings, screen: ScreenDraft) => void;
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
  /** Whether the device has a layout at all (see `App`'s own
   * `hasLayout`). Everything on the Preferences tab says what the app
   * opens *on* — a mode that maps a layout's keys, two panels that only
   * appear once there is one — so with no layout the whole tab is greyed
   * out and Appearance is what the modal opens on instead. */
  hasLayout: boolean;
};

export default function Settings({
  opened,
  onClose,
  settings,
  screen,
  onSave,
  debug,
  onDebugChange,
  startupMode,
  onStartupModeChange,
  mediaPanel,
  onMediaPanelChange,
  inspectorPanel,
  onInspectorPanelChange,
  hasLayout,
}: Props) {
  const [tab, setTab] = useState<string | null>(
    hasLayout ? "preferences" : "appearance",
  );
  const [draft, setDraft] = useState<LayoutSettings>(settings);
  const [screenDraft, setScreenDraft] = useState<ScreenDraft>(screen);
  const [debugDraft, setDebugDraft] = useState(debug);
  const [startupModeDraft, setStartupModeDraft] =
    useState<StartupMode>(startupMode);
  const [mediaPanelDraft, setMediaPanelDraft] =
    useState<PanelState>(mediaPanel);
  const [inspectorPanelDraft, setInspectorPanelDraft] =
    useState<PanelState>(inspectorPanel);
  // The Password tab. Drafted like the fields above rather than written
  // as it is typed, so the modal's one Save is what changes a password
  // (see `settings/Code`) — which is also why the draft is held here
  // rather than in the tab, whose page is unmounted the moment another
  // tab is picked. Emptied on every open and on Cancel: a password half
  // typed and walked away from is not a thing to keep.
  const [codeDraft, setCodeDraft] = useState<CodeDraft>(EMPTY_CODE_DRAFT);
  const [codeError, setCodeError] = useState<string | null>(null);
  const [changingCode, setChangingCode] = useState(false);

  // The two network tabs, which are one form: the radio and the
  // addressing go to the device together, so they are drafted together
  // and Connect is on both (see `settings/useNetwork`). Polled — and the
  // draft kept — for as long as either of them is the tab on screen.
  const network = useNetwork(opened && (tab === "wifi" || tab === "network"));
  // Save asks before it takes the interface down, and the answer comes
  // back here rather than in either tab: it is the Save's question.
  const [confirmingNetwork, setConfirmingNetwork] = useState(false);

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
      setTab(hasLayout ? "preferences" : "appearance");
      setDraft(settings);
      setScreenDraft(screen);
      setDebugDraft(debug);
      setStartupModeDraft(startupMode);
      setMediaPanelDraft(mediaPanel);
      setInspectorPanelDraft(inspectorPanel);
      setColorSchemeAtOpen(colorScheme);
      setRestoreFile(null);
      setConfirmingRestore(false);
      setRestoreError(null);
      setCodeDraft(EMPTY_CODE_DRAFT);
      setCodeError(null);
      setConfirmingNetwork(false);
      network.reset();
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

  function cancel() {
    setDraft(settings);
    setScreenDraft(screen);
    setDebugDraft(debug);
    setStartupModeDraft(startupMode);
    setMediaPanelDraft(mediaPanel);
    setInspectorPanelDraft(inspectorPanel);
    setCodeDraft(EMPTY_CODE_DRAFT);
    setCodeError(null);
    setConfirmingNetwork(false);
    network.reset();
    // The one change already in force on screen — put the app back in
    // whatever it was wearing when this modal opened.
    setColorScheme(colorSchemeAtOpen);
    onClose();
  }

  /** Save, as far as the one question it may have to ask.
   *
   * A network changed on either of its two tabs is applied by this Save
   * and nothing else (see `settings/useNetwork`), and applying it drops
   * the connection this page is being read over — so it is confirmed
   * first, before anything at all has been written. A draft half filled
   * in is refused here rather than confirmed and then refused by the
   * device. */
  function save() {
    if (network.dirty) {
      if (!network.ready) {
        // Whichever half is short of an answer: no network to join at
        // all is the Wi-Fi tab's, and anything else is an address.
        const missingSsid = !network.draft.ssid.trim();
        setTab(missingSsid ? "wifi" : "network");
        network.setError(
          missingSsid
            ? "Pick a network to join, or leave the tab as you found it."
            : "The addressing is not one the keyboard could take.",
        );
        return;
      }
      setConfirmingNetwork(true);
      return;
    }
    void apply();
  }

  async function apply() {
    setConfirmingNetwork(false);

    // The password first, because it is the one thing here the device
    // can refuse outright: everything between it and the network is
    // local and cannot fail, and a modal that closed on a password the
    // device turned down would be saying it took it. An untouched form
    // is skipped — the usual case, and the reason Save is not held to
    // this tab being filled in.
    if (codeDraftTouched(codeDraft)) {
      if (!codeDraftReady(codeDraft)) {
        setTab("code");
        setCodeError(
          "Fill in all three fields — or clear them to leave the password alone.",
        );
        return;
      }
      setChangingCode(true);
      setCodeError(null);
      try {
        await changePassword(codeDraft.current, codeDraft.next);
      } catch (failure) {
        setChangingCode(false);
        setTab("code");
        if (failure instanceof CodeRefused) {
          setCodeError("Incorrect password");
          // The one that was wrong, and only that one: what was typed
          // for the new password is still what the user meant.
          setCodeDraft((current) => ({ ...current, current: "" }));
        } else {
          setCodeError(
            failure instanceof Error
              ? failure.message
              : "The password was refused",
          );
        }
        return;
      }
      setChangingCode(false);
    }

    onSave(draft, screenDraft);
    onDebugChange(debugDraft);
    onStartupModeChange(startupModeDraft);
    onMediaPanelChange(mediaPanelDraft);
    onInspectorPanelChange(inspectorPanelDraft);
    // Nothing to apply for Appearance — it went in as it was picked, and
    // Mantine has already stored it. Saving only makes that permanent by
    // *not* undoing it the way `cancel` does.

    // And the network last of all, because it is what ends the
    // conversation: the keyboard leaves the network this page is being
    // read over. Everything above had to be written before that.
    if (network.dirty) {
      await network.apply();
      // Left open on purpose. The tab now says where to find the
      // keyboard, which is the only thing still worth reading — closing
      // would put the app back up over a device that is no longer
      // answering it.
      setTab("wifi");
      return;
    }

    onClose();
  }

  // The size the screen picked on this tab comes to, which is what will
  // be written — the list's millimetres for a known panel, the two typed
  // fields for one described by hand (see `screenSize`). Falls back to
  // what is already stored while the picker has nothing complete in it,
  // so Resolution/DPI below keep reading rather than going blank between
  // a brand being opened and a model being chosen.
  const pickedSize = isScreenComplete(screenDraft)
    ? screenSize(screenDraft)
    : {
        widthMm: draft.physicalWidthMm,
        heightMm: draft.physicalHeightMm,
      };

  const hasValidPhysicalSize =
    pickedSize.widthMm > 0 && pickedSize.heightMm > 0;

  // Falls back to the same 1280×800 KBRD-DEV uses while no screen is
  // connected — see `Display` — so Resolution/DPI stay populated instead
  // of going blank.
  const resolutionWidth = device.connected ? device.width : FALLBACK_WIDTH;
  const resolutionHeight = device.connected ? device.height : FALLBACK_HEIGHT;
  const resolutionValue = `${resolutionWidth} × ${resolutionHeight} px`;
  const dpiValue = hasValidPhysicalSize
    ? `${Math.round(resolutionWidth / (pickedSize.widthMm / MM_PER_INCH))} × ${Math.round(
        resolutionHeight / (pickedSize.heightMm / MM_PER_INCH),
      )} dpi`
    : "—";

  return (
    <Modal
      opened={opened}
      onClose={cancel}
      title={<Text fw={700}>Settings</Text>}
      centered
      size={800}
      overlayProps={{ backgroundOpacity: 0.65, blur: 2 }}
      styles={{
        content: {
          display: "flex",
          flexDirection: "column",
          // A fixed size rather than a share of the window: the tab
          // list and the panels behind it are laid out for this one
          // shape. `maxHeight` keeps it inside a short screen, where
          // the panels scroll on their own.
          height: 750,
          maxHeight: "95vh",
          position: "relative",
          // Nothing but a tab page scrolls in here, and the corners clip
          // the scrollbar's own ends to the dialog's radius.
          overflow: "hidden",
        },
        // Out of the flow, over the pages (see `HEADER_HEIGHT`): the body
        // below is then the dialog's full height, and so is the scroll.
        header: {
          position: "absolute",
          top: 0,
          insetInline: 0,
          height: HEADER_HEIGHT,
        },
        body: {
          display: "flex",
          flexDirection: "column",
          flex: 1,
          minHeight: 0,
          padding: 0,
          position: "relative",
        },
      }}
    >
      <Box
        style={{
          flex: 1,
          minHeight: 0,
          overflow: "hidden",
          // No padding at all: a tab page is the dialog's full height
          // and reaches its right edge, and the margins live inside the
          // page and on the tab list instead (see `TabPage`).
          padding: 0,
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
          {/* Margins rather than padding: the rule this list draws down
              its right side is the border of its own box, so a margin is
              what keeps that rule to the stretch between the two bars
              instead of running the dialog's whole height the way the
              scroll beside it now does. */}
          <Tabs.List
            w={180}
            style={{
              flexShrink: 0,
              marginLeft: 40,
              marginTop: HEADER_HEIGHT + 24,
              marginBottom: FOOTER_HEIGHT + 40,
            }}
          >
            <Tabs.Tab
              value="preferences"
              leftSection={<MdTune size={16} />}
              disabled={!hasLayout}
            >
              Preferences
            </Tabs.Tab>
            <Tabs.Tab value="appearance" leftSection={<MdPalette size={16} />}>
              Appearance
            </Tabs.Tab>
            <Tabs.Tab value="display" leftSection={<MdStraighten size={16} />}>
              Display
            </Tabs.Tab>
            <Tabs.Tab value="wifi" leftSection={<MdWifi size={16} />}>
              Wi-Fi
            </Tabs.Tab>
            <Tabs.Tab value="network" leftSection={<MdLan size={16} />}>
              Network
            </Tabs.Tab>
            <Tabs.Tab value="code" leftSection={<MdLock size={16} />}>
              Password
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

          <TabPage value="preferences">
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
          </TabPage>

          <TabPage value="appearance">
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
                changes with it. The whole app turns over, the display preview
                included — note that the device itself always draws on black, so
                a light theme shows your layout on a ground the hardware doesn't
                have.
              </Text>
            </Stack>
          </TabPage>

          <TabPage value="display">
            <Stack gap="md">
              <Title order={4}>Display</Title>
              {/* The same picker the first run puts up, off the same
                  list (see `setup/ScreenPicker`) — a screen is declared
                  once and this is where it is declared again, so asking
                  it differently here would be two answers to one
                  question. The millimetres are no longer typed: a panel
                  off the list carries its own, and a screen described by
                  hand is what the fields under "Another model" are for.

                  Wrapped rather than dropped in bare: the picker was
                  written inside the wizard's page and takes a little of
                  what that page gave it (see `.settings-screen`). */}
              <Box className="settings-screen">
                <ScreenPicker
                  draft={screenDraft}
                  onChange={(next) =>
                    setScreenDraft((current) => ({ ...current, ...next }))
                  }
                  // What the screen picked on the left comes to on the
                  // device attached now, under the panel's own facts —
                  // the same column, because they answer the same
                  // question the choice above them asks.
                  facts={[
                    { label: "Resolution (px)", value: resolutionValue },
                    { label: "DPI (x / y)", value: dpiValue },
                  ]}
                />
              </Box>
            </Stack>
          </TabPage>

          {/* Which network, and how to address it on it: two tabs over
              one draft, the way a printer or a NAS splits Wireless from
              TCP/IP. The scan runs only while the Wi-Fi tab is the one
              on screen — it takes the radio for several seconds, and
              nothing about it belongs to a modal nobody is looking
              at. */}
          <TabPage value="wifi">
            <NetworkWifiTab
              network={network}
              active={opened && tab === "wifi"}
            />
          </TabPage>

          <TabPage value="network">
            <NetworkIpv4Tab network={network} />
          </TabPage>

          <TabPage value="code">
            {/* Drafted and applied by the modal's Save, like the fields
                on the tabs above — unlike Backup and Storage, which
                write straight through because neither has anything Save
                could hold. What is typed lives in `codeDraft` above, so
                this page can be unmounted with the tab and the password
                still be there when it comes back. */}
            {opened && tab === "code" && (
              <Code
                draft={codeDraft}
                onChange={(patch) => {
                  setCodeDraft((current) => ({ ...current, ...patch }));
                  if (codeError) setCodeError(null);
                }}
                error={codeError}
                busy={changingCode}
              />
            )}
          </TabPage>

          <TabPage value="storage">
            <Stack gap="md">
              <Title order={4}>Partitions</Title>
              <Text size="xs" c="dimmed">
                The card's own filesystems, read afresh every few seconds. Data
                is the one that moves: the media library, the fonts and the
                database all live on it.
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
          </TabPage>

          <TabPage value="backup">
            <Stack gap="md">
              <Title order={4}>Backup</Title>
              <Text size="xs" c="dimmed">
                Saves the whole device as one archive: the database — every
                layout, layer, key and plugin setting — and the media library's
                own images and videos.
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
                Puts a backup back, replacing everything on the device — layouts
                and medias alike — with what that archive holds. Anything done
                since it was taken is lost, and there is no undo: download a
                backup of what is here first if you want to be able to come back
                to it.
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
          </TabPage>

          <TabPage value="developer">
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
          </TabPage>
        </Tabs>
      </Box>

      {/* Over the pages rather than under them (see `HEADER_HEIGHT`), on
          the z-index Mantine gives the header — the scrollbar's own 1001
          then crosses this bar as well. */}
      <Group
        justify="flex-end"
        p="md"
        style={{
          position: "absolute",
          bottom: 0,
          insetInline: 0,
          height: FOOTER_HEIGHT,
          zIndex: 1000,
          backgroundColor: "var(--mantine-color-body)",
          borderTop: "1px solid var(--kbrd-border-color)",
        }}
      >
        <Button color="gray" onClick={cancel}>
          Cancel
        </Button>
        <Button
          color="green"
          onClick={save}
          loading={changingCode || network.saving}
          disabled={!hasValidPhysicalSize}
        >
          Save
        </Button>
      </Group>

      {confirmingNetwork && (
        <Confirmation
          title="Join this network?"
          message={
            <>
              The keyboard will join <b>{network.draft.ssid}</b>, with the
              addressing on the Network tab, and drop whatever it is on
              now — this page included. If it cannot, it comes back up as
              its own hotspot
              {network.hotspot?.ssid ? (
                <>
                  {" "}
                  — <b>{network.hotspot.ssid}</b>, at{" "}
                  <b>{network.hotspot.address}</b>
                </>
              ) : null}
              . Everything else on this dialog is saved either way.
            </>
          }
          onConfirm={() => void apply()}
          onCancel={() => setConfirmingNetwork(false)}
        />
      )}

      {confirmingRestore && restoreFile && (
        <Confirmation
          title="Restore this backup?"
          message={
            <>
              Everything on this device will be replaced with what{" "}
              <b>{restoreFile.name}</b> holds, and the app will reload. This
              cannot be undone.
            </>
          }
          onConfirm={() => void restore()}
          onCancel={() => setConfirmingRestore(false)}
        />
      )}
    </Modal>
  );
}
