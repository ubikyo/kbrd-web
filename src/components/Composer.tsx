import {
  Box,
  Group,
  HoverCard,
  Kbd,
  Menu,
  SegmentedControl,
  Stack,
  Switch,
  Text,
  UnstyledButton,
} from "@mantine/core";
import {
  MdAdd,
  MdCallMerge,
  MdCallSplit,
  MdContentCopy,
  MdContentPaste,
  MdDelete,
  MdEdit,
  MdFindReplace,
  MdGridOn,
  MdHelp,
} from "react-icons/md";
import { useEffect, useState } from "react";
import type { RefObject } from "react";

import { clearKey, duplicateKeyPlugins, moveKey } from "../api/layers";
import type { DisplayGridApi } from "../classes/useDisplayGrid";
import type { EntityEditorsApi } from "../classes/useEntityEditors";
import type { KeyDragTarget } from "../classes/useKeyDrag";
import { useLayoutShortcuts } from "../classes/useLayoutShortcuts";
import { useUndoHistory } from "../classes/useUndoHistory";
import { isMappingTarget, isMappingVisible } from "../plugins/registry";
import type { KeyPlugin, KeyProperty, LayerData } from "../types/layer";
import type { LayoutData, LayoutSettings } from "../types/layout";
import { randomId } from "../utils/id";
import Display from "./Display";
import type { ContextMenuTarget } from "./Display";
import Layer from "./menu/Layer";
import type { LayerMenuHandle } from "./menu/Layer";
import Confirmation from "./modals/Confirmation";
import Divide from "./modals/Divide";

// The Actions menu's own shortcuts are shown next to their label in
// whichever form this platform actually uses — ⌘ on macOS, Ctrl+
// elsewhere (both are accepted either way, see `useLayoutShortcuts`).
const IS_MAC =
  typeof navigator !== "undefined" && /Mac|iPhone|iPod|iPad/.test(navigator.userAgent);
const MOD_KEY_LABEL = IS_MAC ? "⌘" : "Ctrl+";

function ShortcutHint({ children }: { children: React.ReactNode }) {
  return (
    <Text size="xs" c="dimmed">
      {children}
    </Text>
  );
}

// The "?" help button's own reference card — every global keyboard
// shortcut the *current* mode actually responds to (see
// `useLayoutShortcuts` and Composer's own Tab handler below), not the
// context menu's per-selection ones above: Copy/Paste/Delete only fire in
// Layout mode (Mapping has no grid structure of its own left to act on —
// same reasoning as the Resize shortcut beside it), while Undo and the
// mode switch itself are global.
const LAYOUT_SHORTCUTS = [
  { label: "Copy cell", keys: `${MOD_KEY_LABEL}C` },
  { label: "Paste", keys: `${MOD_KEY_LABEL}V` },
  { label: "Delete selection", keys: "⌫" },
  { label: "Move selection", keys: "← →" },
  { label: "Toggle Resize", keys: `${MOD_KEY_LABEL}Tab` },
  { label: "Undo", keys: `${MOD_KEY_LABEL}Z` },
  { label: "Switch mode", keys: "Tab" },
];
const MAPPING_SHORTCUTS = [
  { label: "Move selection", keys: "← →" },
  { label: "Undo", keys: `${MOD_KEY_LABEL}Z` },
  { label: "Switch mode", keys: "Tab" },
];

type Props = {
  layoutSettings: LayoutSettings;
  mode: "layout" | "mapping";
  onModeChange: (mode: "layout" | "mapping") => void;
  layout: LayoutData | null;
  layer: LayerData | null;
  grid: DisplayGridApi;
  entityEditors: EntityEditorsApi;
  // Gates `useLayoutShortcuts`'s own shortcuts while Settings has its own
  // fields to type/tab through instead — `entityEditors` already carries
  // the equivalent flags for the Layout/Layer editors and the delete
  // confirmation, all three owned by `App` alongside Settings.
  settingsOpened: boolean;
  // Saves a freshly-created `KeyPlugin`, or a batch change to `key_properties`,
  // back onto the layer — see `Display`'s own docblock on
  // `layer`/`onChangePlugins`, and this file's own Mapping Copy/Paste/
  // Delete/Move operations below (the other source of both).
  onChangePlugins: (plugins: KeyPlugin[]) => void;
  onChangeKeyProperties: (keyProperties: KeyProperty[]) => void;
  // The Layer picker (top-right of the display, Mapping-mode only — see
  // `<Layer>`'s own `hidden`) lives here instead of `App`'s header now,
  // right beside the content it actually governs. Passed as its own prop
  // rather than read off `entityEditors` in here — accessing a ref held
  // inside another object, mid-render, trips `react-hooks/refs` for
  // every other property read off that same object in this component.
  layerMenuRef: RefObject<LayerMenuHandle | null>;
  onChangeLayer: (layer: LayerData | null) => void;
  onLayerItemsChange: (items: LayerData[]) => void;
};

/**
 * The display pane's own mode switch, plus `<Display>` itself and every
 * bit of chrome around it (Resize, the right-click context menu, Divide,
 * the grid-editing keyboard shortcuts/undo history). Both modes share the
 * exact same `<Display>` — its synthetic Unit grid *is* "the layout": a
 * Key cell/division is where a Render/Invoke plugin actually gets dropped
 * in Mapping mode too (see `Display`'s own `keyPluginsFor`/
 * `handleCellDrop`), not a separate real-geometry view. Resize and Divide
 * stay Layout-only chrome (there's no grid structure left to act on in
 * Mapping mode); the context menu and Copy/Paste/Delete now work in
 * *either* mode, each on its own kind of content — geometry in Layout,
 * a key's Mapping content (its attached plugins/properties) in Mapping.
 */
export default function Composer({
  layoutSettings,
  mode,
  onModeChange,
  layout,
  layer,
  grid,
  entityEditors,
  settingsOpened,
  onChangePlugins,
  onChangeKeyProperties,
  layerMenuRef,
  onChangeLayer,
  onLayerItemsChange,
}: Props) {
  const [divideModalOpened, setDivideModalOpened] = useState(false);
  // The display's own right-click context menu — replaces the old floating
  // "Actions" button. `Display` reports where the cursor was and what it
  // landed on (already selected the same way a left click would by the
  // time this fires); only the position and which content to show
  // (`kind`) need to live here, since `grid`'s own selection state is
  // already the source of truth for *which* cell, division, row or the
  // display itself is the real target.
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    kind: ContextMenuTarget["kind"];
  } | null>(null);

  const { undo } = useUndoHistory({
    cells: grid.cells,
    rowOverrides: grid.rowOverrides,
    mergeGroups: grid.mergeGroups,
    skipAutosaveRef: grid.skipAutosaveRef,
    setCells: grid.setCells,
    setRowOverrides: grid.setRowOverrides,
    setMergeGroups: grid.setMergeGroups,
    clearCellSelection: grid.clearCellSelection,
  });

  // --- Mapping mode's own Copy/Paste/Delete/Move ---------------------
  //
  // Mapping content (a key's attached `KeyPlugin`s/`KeyProperty`) lives on
  // `layer`, which `useDisplayGrid` knows nothing about — so unlike
  // Layout's geometry operations (owned by `grid`), these live here,
  // calling `api/layers.ts` directly and pushing results back up via
  // `onChangePlugins`/`onChangeKeyProperties`, the same pattern `Display`'s
  // own `attachMappingPlugin` already uses for a plugin dropped from the
  // Inspector.
  const [copiedKeyRef, setCopiedKeyRef] = useState<string | null>(null);
  const [pendingMappingOverwrite, setPendingMappingOverwrite] = useState<
    KeyDragTarget[] | null
  >(null);
  const [pendingMappingDelete, setPendingMappingDelete] = useState<
    string[] | null
  >(null);
  const [pendingMove, setPendingMove] = useState<
    { source: string; dest: string } | null
  >(null);

  function hasMappingContent(keyRef: string | null | undefined): boolean {
    return Boolean(keyRef && layer?.plugins.some((plugin) => plugin.key_ref === keyRef));
  }

  // A target's own *current* `keyRef` — `null`/`undefined` for a Key
  // cell/division that's never had one minted yet (see `GridCell.keyRef`'s
  // own docblock) — read-only, unlike `resolveKeyRef` below.
  function existingKeyRefFor(target: KeyDragTarget): string | null | undefined {
    return target.kind === "cell"
      ? grid.cells[target.id]?.keyRef
      : grid.cells[target.parentId]?.divide?.cells[target.subId]?.keyRef;
  }

  // Mints and persists a fresh `keyRef` for `target` if it doesn't already
  // have one — called only from an actual Paste, never just to check
  // whether a target is selectable, so an empty Key cell/division that's
  // simply never needed one yet still works as a paste destination.
  function resolveKeyRef(target: KeyDragTarget): string {
    const existing = existingKeyRefFor(target);
    if (existing) return existing;
    const keyRef = randomId();
    if (target.kind === "cell") grid.changeCell(target.id, { keyRef });
    else grid.changeDivisionCell(target.parentId, target.subId, { keyRef });
    return keyRef;
  }

  // Every selected Key cell/division — one top-level cell, or every
  // selected division of the same parent (mirrors `grid`'s own
  // cell-vs-division selection split) — regardless of whether it already
  // has a `keyRef` (see `resolveKeyRef`) or any content: the same rule
  // Display's own plugin-drop already uses (`isMappingTarget`), not
  // "already has a keyRef", which excluded a perfectly valid empty target.
  function selectedMappingTargets(): KeyDragTarget[] {
    if (grid.selectedCellIndices.length === 1 && grid.selectedDivisionIndices.length > 0) {
      const parentId = grid.selectedCellIndices[0];
      const parent = grid.cells[parentId];
      return grid.selectedDivisionIndices
        .filter((subId) => isMappingTarget(parent?.divide?.cells[subId]?.typeId))
        .map((subId) => ({ kind: "division" as const, parentId, subId }));
    }
    return grid.selectedCellIndices
      .filter((id) => isMappingTarget(grid.cells[id]?.typeId))
      .map((id) => ({ kind: "cell" as const, id }));
  }

  // "Copy" only for a single selected key that actually has content — same
  // rule as Layout's own `canCopySelection`.
  const mappingSelection = selectedMappingTargets();
  const mappingSelectionKeyRef =
    mappingSelection.length === 1 ? existingKeyRefFor(mappingSelection[0]) : null;
  const canCopyMapping = hasMappingContent(mappingSelectionKeyRef);
  const mappingPasteTargets = copiedKeyRef
    ? mappingSelection.filter((target) => existingKeyRefFor(target) !== copiedKeyRef)
    : [];
  const canPasteMapping = mappingPasteTargets.length > 0;

  function copyMappingSelection() {
    if (mappingSelectionKeyRef) setCopiedKeyRef(mappingSelectionKeyRef);
  }

  // Duplicates the copied key's plugins (and mirrors its own `KeyProperty`,
  // since `duplicate-from` only ever returns the plugin list — see
  // `kbrd-api`'s own `duplicate_plugins`) onto every target, clearing
  // first whichever ones already had content. Each target's `keyRef` is
  // resolved (minting one if needed) right before it's used — safe here
  // since this only ever runs from an actual Paste, never during render.
  async function applyMappingPaste(targets: KeyDragTarget[]) {
    if (!layer || !copiedKeyRef) return;
    const sourceProperty =
      layer.key_properties.find((item) => item.key_ref === copiedKeyRef) ?? null;
    let plugins = layer.plugins;
    let keyProperties = layer.key_properties;
    for (const target of targets) {
      const targetKeyRef = resolveKeyRef(target);
      if (hasMappingContent(targetKeyRef)) {
        const cleared = await clearKey(layer.id, targetKeyRef);
        plugins = cleared.plugins;
        keyProperties = cleared.key_properties;
      }
      plugins = await duplicateKeyPlugins(layer.id, targetKeyRef, copiedKeyRef);
      if (sourceProperty) {
        keyProperties = [
          ...keyProperties.filter((item) => item.key_ref !== targetKeyRef),
          { key_ref: targetKeyRef, config: sourceProperty.config },
        ];
      }
    }
    onChangePlugins(plugins);
    onChangeKeyProperties(keyProperties);
  }

  function pasteMappingSelection() {
    if (mappingPasteTargets.length === 0) return;
    if (mappingPasteTargets.some((target) => hasMappingContent(existingKeyRefFor(target)))) {
      setPendingMappingOverwrite(mappingPasteTargets);
    } else {
      void applyMappingPaste(mappingPasteTargets);
    }
  }

  function requestDeleteMappingSelection() {
    const targets = mappingSelection
      .map(existingKeyRefFor)
      .filter((ref): ref is string => hasMappingContent(ref));
    if (targets.length > 0) setPendingMappingDelete(targets);
  }

  async function confirmMappingDelete() {
    const targets = pendingMappingDelete;
    setPendingMappingDelete(null);
    if (!layer || !targets) return;
    let current = layer;
    for (const target of targets) {
      current = await clearKey(current.id, target);
    }
    onChangePlugins(current.plugins);
    onChangeKeyProperties(current.key_properties);
  }

  // Dragging a key with content onto another key (`Display`'s own
  // `useKeyDrag`) — replaces the old "Move to" menu item. Confirms first
  // if the destination isn't blank, same as a Paste would.
  async function applyMoveKey(source: string, dest: string) {
    if (!layer) return;
    const current = hasMappingContent(dest) ? await clearKey(layer.id, dest) : layer;
    const updated = await moveKey(current.id, source, dest);
    onChangePlugins(updated.plugins);
    onChangeKeyProperties(updated.key_properties);
  }

  function handleMoveKey(source: string, dest: string) {
    if (hasMappingContent(dest)) {
      setPendingMove({ source, dest });
    } else {
      void applyMoveKey(source, dest);
    }
  }

  const { resizeEnabled, setResizeEnabled } = useLayoutShortcuts({
    mode,
    settingsOpened,
    layoutEditorOpened: entityEditors.layoutEditorOpened,
    layerEditorOpened: entityEditors.layerEditorOpened,
    confirmDeleteOpen: Boolean(entityEditors.confirmDelete),
    divideModalOpened,
    hasCellSelection: grid.hasCellSelection,
    hasDivisionSelection: grid.hasDivisionSelection,
    canCopySelection: mode === "layout" ? grid.canCopySelection : canCopyMapping,
    emptySelection: mode === "layout" ? grid.emptySelection : null,
    canPaste: mode === "layout" ? grid.canPaste : canPasteMapping,
    undo,
    requestDeleteCells:
      mode === "layout" ? grid.requestDeleteCells : requestDeleteMappingSelection,
    requestDeleteDivisions:
      mode === "layout" ? grid.requestDeleteDivisions : requestDeleteMappingSelection,
    copySelectedCell: mode === "layout" ? grid.copySelectedCell : copyMappingSelection,
    pasteToEmptyRow: mode === "layout" ? grid.pasteToEmptyRow : pasteMappingSelection,
    // The arrows move the selection around the grid's own geometry, which
    // both modes share — so no Mapping counterpart to swap in, just a
    // narrower idea of what's there to land on: Mapping renders nothing
    // at all for a Space cell/division (`isMappingVisible`), so the
    // arrows skip straight past those rather than moving the selection
    // somewhere invisible.
    selectAdjacent: (direction: -1 | 1) =>
      grid.selectAdjacent(
        direction,
        mode === "layout" ? undefined : isMappingVisible,
      ),
  });

  // Plain Tab toggles Layout/Mapping — Cmd/Ctrl+Tab is Resize's own
  // shortcut instead (see `useLayoutShortcuts`), and both stay out of the
  // way of a modal's own fields, or typing in a text field, where Tab
  // must keep doing its normal job.
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (
        event.key !== "Tab" ||
        event.altKey ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        settingsOpened ||
        entityEditors.layoutEditorOpened ||
        entityEditors.layerEditorOpened ||
        Boolean(entityEditors.confirmDelete) ||
        divideModalOpened
      ) {
        return;
      }
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return;
      }
      event.preventDefault();
      onModeChange(mode === "layout" ? "mapping" : "layout");
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    mode,
    onModeChange,
    settingsOpened,
    entityEditors.layoutEditorOpened,
    entityEditors.layerEditorOpened,
    entityEditors.confirmDelete,
    divideModalOpened,
  ]);

  // `Display`'s `onContextMenu` — a right-click anywhere on the display.
  // `Display` has already made whatever selection this right-click
  // implies by the time this fires (preserving a multi-selection the
  // clicked cell/division was already part of, rather than always
  // collapsing it to just that one — see its own context-menu handlers),
  // so this only needs to open the menu itself, at the click. Fires in
  // either mode now (a cell/division's own menu content differs — see
  // `renderMappingMenuItems` below for Mapping's).
  function handleContextMenu(x: number, y: number, target: ContextMenuTarget) {
    setContextMenu({ x, y, kind: target.kind });
  }

  // Mapping mode's own cell/division context menu content — Copy/Paste/
  // Delete on the selection's Mapping content, in place of the old
  // Inspector "Actions" menu (Duplicate from/to, Move to, Clear all).
  // Shared between the "cell" and "division" branches below since the
  // logic (`selectedMappingKeyRefs`, etc.) already covers both.
  function renderMappingMenuItems() {
    return (
      <>
        <Menu.Item
          leftSection={<MdContentCopy />}
          rightSection={<ShortcutHint>{MOD_KEY_LABEL}C</ShortcutHint>}
          disabled={!canCopyMapping}
          onClick={copyMappingSelection}
        >
          Copy
        </Menu.Item>
        <Menu.Item
          leftSection={<MdContentPaste />}
          rightSection={<ShortcutHint>{MOD_KEY_LABEL}V</ShortcutHint>}
          disabled={!canPasteMapping}
          onClick={pasteMappingSelection}
        >
          Paste
        </Menu.Item>
        <Menu.Item
          color="red"
          leftSection={<MdDelete />}
          rightSection={<ShortcutHint>⌫</ShortcutHint>}
          disabled={
            !mappingSelection.some((target) => hasMappingContent(existingKeyRefFor(target)))
          }
          onClick={requestDeleteMappingSelection}
        >
          Delete
        </Menu.Item>
      </>
    );
  }

  return (
    <Box h="100%" style={{ position: "relative", overflow: "hidden" }}>
      <Display
        {...layoutSettings}
        mode={mode}
        rows={grid.rows}
        cells={grid.cells}
        onCellsChange={grid.setCells}
        layer={layer}
        onChangePlugins={onChangePlugins}
        onCreateCell={grid.createCell}
        onAssignLayoutPlugin={grid.assignLayoutPlugin}
        onAssignLayoutPluginToDivision={grid.assignLayoutPluginToDivision}
        onMoveCell={grid.moveCell}
        onMoveKey={handleMoveKey}
        mergeGroups={grid.mergeGroups}
        selectedCellIndices={grid.selectedCellIndices}
        onSelectCell={grid.selectCell}
        onFocusCell={grid.focusCell}
        onToggleCell={grid.toggleCellSelection}
        selectedEmptyRow={grid.selectedEmptyRow}
        onSelectEmpty={grid.selectEmptyRow}
        selectedDivisionIndices={grid.selectedDivisionIndices}
        onSelectDivision={grid.selectDivision}
        onFocusDivision={grid.focusDivision}
        onToggleDivision={grid.toggleDivisionSelection}
        isDisplaySelected={grid.displaySelected}
        onSelectDisplay={grid.selectDisplay}
        onContextMenu={handleContextMenu}
        resizeEnabled={resizeEnabled}
        maxColumns={layout?.max_columns ?? null}
      />

      {layout && (
        <Box
          style={{
            position: "absolute",
            top: 20,
            // Clear of the Inspector's own tab, which reaches into this
            // area from the right edge while the panel is open (see
            // `.inspector-tab` in App.css).
            right: 40,
            zIndex: 20,
          }}
        >
          <Layer
            key={layout.id}
            ref={layerMenuRef}
            layoutId={layout.id}
            onChange={onChangeLayer}
            onAdd={entityEditors.openAddLayer}
            onItemsChange={onLayerItemsChange}
            // Layer only matters in Mapping mode — see `Layer`'s own
            // docblock on `hidden`.
            hidden={mode !== "mapping"}
          />
        </Box>
      )}

      <SegmentedControl
        value={mode}
        onChange={(value) => onModeChange(value === "mapping" ? "mapping" : "layout")}
        data={[
          { label: "Layout", value: "layout" },
          { label: "Mapping", value: "mapping" },
        ]}
        color="green"
        size="xs"
        style={{
          position: "absolute",
          left: 20,
          bottom: 20,
          zIndex: 20,
        }}
      />

      <Group
        gap="md"
        wrap="nowrap"
        style={{
          position: "absolute",
          right: 20,
          bottom: 20,
          zIndex: 20,
        }}
      >
        {/* Layout-only — Mapping mode hides it (see `Display`'s own
            `mode` check for the grip itself) since there's no grid
            structure left to resize there, only plugin content. Also
            toggled by Tab (see `useLayoutShortcuts`). */}
        {mode === "layout" && (
          <Switch
            label="Resize"
            size="xs"
            color="green"
            checked={resizeEnabled}
            onChange={(event) => setResizeEnabled(event.currentTarget.checked)}
          />
        )}

        {/* Shown in both modes, always to the right of Resize — a quick
            reference for whichever shortcuts the *current* mode actually
            responds to (see `LAYOUT_SHORTCUTS`/`MAPPING_SHORTCUTS` above),
            since Layout and Mapping each wire up their own, not shared. */}
        <HoverCard width={240} shadow="md" position="top-end" withArrow offset={12}>
          <HoverCard.Target>
            <UnstyledButton
              aria-label="Keyboard shortcuts"
              style={{ display: "flex", color: "var(--mantine-color-white)" }}
            >
              <MdHelp size={22} />
            </UnstyledButton>
          </HoverCard.Target>
          <HoverCard.Dropdown>
            <Stack gap={6}>
              {(mode === "layout" ? LAYOUT_SHORTCUTS : MAPPING_SHORTCUTS).map((shortcut) => (
                <Group key={shortcut.label} justify="space-between" wrap="nowrap" gap="md">
                  <Text size="xs">{shortcut.label}</Text>
                  <Kbd>{shortcut.keys}</Kbd>
                </Group>
              ))}
            </Stack>
          </HoverCard.Dropdown>
        </HoverCard>
      </Group>

      {/* One shared right-click context menu (see `Display`'s
          `onContextMenu` and `handleContextMenu` above) — its content
          switches on `contextMenu.kind`, reading whichever selection
          `grid` already made for it the same way each used to feed its
          own floating "Actions" button. Anchored to an invisible,
          zero-size target positioned at the click itself instead of a
          fixed on-screen spot, so it opens right where the cursor was. */}
      {contextMenu && (
        <Menu
          opened
          onChange={(opened) => {
            if (!opened) setContextMenu(null);
          }}
          position="bottom-start"
          offset={0}
          width={200}
          styles={{ item: { padding: "4px var(--mantine-spacing-sm)" } }}
        >
          <Menu.Target>
            <div
              style={{
                position: "fixed",
                left: contextMenu.x,
                top: contextMenu.y,
                width: 0,
                height: 0,
              }}
            />
          </Menu.Target>
          <Menu.Dropdown>
            {contextMenu.kind === "cell" && grid.selectedCellIndices.length > 0 && (
              <>
                {mode === "layout" && (
                  <>
                    {grid.selectedCellIndices.length === 1 &&
                      grid.layoutSelection && (
                        <>
                          {grid.layoutSelection.isMerged && (
                            <Menu.Item leftSection={<MdCallSplit />} onClick={grid.unmerge}>
                              Unmerge
                            </Menu.Item>
                          )}
                          {!grid.layoutSelection.isMerged &&
                            !grid.layoutSelection.cell.divide && (
                              <Menu.Item
                                leftSection={<MdGridOn />}
                                onClick={() => setDivideModalOpened(true)}
                              >
                                Divide
                              </Menu.Item>
                            )}
                          <Menu.Divider />
                          <Menu.Item
                            leftSection={<MdContentCopy />}
                            rightSection={<ShortcutHint>{MOD_KEY_LABEL}C</ShortcutHint>}
                            onClick={grid.copySelectedCell}
                          >
                            Copy
                          </Menu.Item>
                          {/* Applies onto this same cell — see
                              `canPaste`/`pasteToEmptyRow`: since it's the
                              exact cell just copied, that's never a
                              meaningful overwrite, so this lands a new
                              sibling in its row's own trailing empty space
                              instead, without first re-selecting that space
                              explicitly. A *different*, non-empty cell
                              would instead ask before overwriting it — see
                              `Confirmation` below. */}
                          <Menu.Item
                            leftSection={<MdContentPaste />}
                            rightSection={<ShortcutHint>{MOD_KEY_LABEL}V</ShortcutHint>}
                            disabled={!grid.canPaste}
                            onClick={grid.pasteToEmptyRow}
                          >
                            Paste
                          </Menu.Item>
                          {grid.layoutSelection.canRemove && (
                            <Menu.Item
                              color="red"
                              leftSection={<MdDelete />}
                              rightSection={<ShortcutHint>⌫</ShortcutHint>}
                              onClick={() => grid.removeCell(grid.layoutSelection!.index)}
                            >
                              Delete
                            </Menu.Item>
                          )}
                        </>
                      )}
                    {grid.selectedCellIndices.length > 1 &&
                      grid.isCellSelectionContiguous && (
                        <>
                          <Menu.Item leftSection={<MdCallMerge />} onClick={grid.mergeSelectedCells}>
                            Merge
                          </Menu.Item>
                          <Menu.Item
                            color="red"
                            leftSection={<MdDelete />}
                            rightSection={<ShortcutHint>⌫</ShortcutHint>}
                            onClick={grid.requestDeleteCells}
                          >
                            Delete
                          </Menu.Item>
                        </>
                      )}
                    {grid.selectedCellIndices.length > 1 &&
                      !grid.isCellSelectionContiguous && (
                        <Menu.Item
                          color="red"
                          leftSection={<MdDelete />}
                          rightSection={<ShortcutHint>⌫</ShortcutHint>}
                          onClick={grid.requestDeleteCells}
                        >
                          Delete
                        </Menu.Item>
                      )}
                    {/* A multi-selection with room to Paste onto every
                        target at once (see `useDisplayGrid`'s own
                        multi-target `pasteToEmptyRow`) — kept separate
                        from the single-cell Paste above since that one's
                        "land in this row" convenience only ever applies
                        to a lone target. */}
                    {grid.selectedCellIndices.length > 1 && grid.canPaste && (
                      <Menu.Item
                        leftSection={<MdContentPaste />}
                        rightSection={<ShortcutHint>{MOD_KEY_LABEL}V</ShortcutHint>}
                        onClick={grid.pasteToEmptyRow}
                      >
                        Paste
                      </Menu.Item>
                    )}
                  </>
                )}
                {mode === "mapping" && renderMappingMenuItems()}
              </>
            )}

            {contextMenu.kind === "division" &&
              grid.selectedDivisionIndices.length > 0 && (
                <>
                  {mode === "layout" && (
                    <>
                      {grid.selectedDivisionIndices.length === 1 &&
                        grid.divisionSelection && (
                          <>
                            {grid.divisionSelection.isMerged && (
                              <Menu.Item leftSection={<MdCallSplit />} onClick={grid.unmergeDivision}>
                                Unmerge
                              </Menu.Item>
                            )}
                            {/* Applies directly onto this division — see
                                `canPaste`/`pasteToEmptyRow` — confirming
                                first (`pendingOverwrite`) if it isn't
                                already blank; divisions have no row of their
                                own to fall back to instead. */}
                            <Menu.Item
                              leftSection={<MdContentPaste />}
                              rightSection={<ShortcutHint>{MOD_KEY_LABEL}V</ShortcutHint>}
                              disabled={!grid.canPaste}
                              onClick={grid.pasteToEmptyRow}
                            >
                              Paste
                            </Menu.Item>
                            {grid.divisionSelection.cell.typeId && (
                              <Menu.Item
                                color="red"
                                leftSection={<MdDelete />}
                                rightSection={<ShortcutHint>⌫</ShortcutHint>}
                                onClick={grid.requestDeleteDivisions}
                              >
                                Delete
                              </Menu.Item>
                            )}
                          </>
                        )}
                      {grid.selectedDivisionIndices.length > 1 &&
                        grid.isDivisionSelectionContiguous && (
                          <>
                            <Menu.Item
                              leftSection={<MdCallMerge />}
                              onClick={grid.mergeSelectedDivisions}
                            >
                              Merge
                            </Menu.Item>
                            <Menu.Item
                              color="red"
                              leftSection={<MdDelete />}
                              rightSection={<ShortcutHint>⌫</ShortcutHint>}
                              onClick={grid.requestDeleteDivisions}
                            >
                              Delete
                            </Menu.Item>
                          </>
                        )}
                      {grid.selectedDivisionIndices.length > 1 &&
                        !grid.isDivisionSelectionContiguous && (
                          <Menu.Item
                            color="red"
                            leftSection={<MdDelete />}
                            rightSection={<ShortcutHint>⌫</ShortcutHint>}
                            onClick={grid.requestDeleteDivisions}
                          >
                            Delete
                          </Menu.Item>
                        )}
                      {grid.selectedDivisionIndices.length > 1 && grid.canPaste && (
                        <Menu.Item
                          leftSection={<MdContentPaste />}
                          rightSection={<ShortcutHint>{MOD_KEY_LABEL}V</ShortcutHint>}
                          onClick={grid.pasteToEmptyRow}
                        >
                          Paste
                        </Menu.Item>
                      )}
                    </>
                  )}
                  {mode === "mapping" && renderMappingMenuItems()}
                </>
              )}

            {contextMenu.kind === "row" && grid.emptySelection && (
              <Menu.Item
                leftSection={<MdContentPaste />}
                rightSection={<ShortcutHint>{MOD_KEY_LABEL}V</ShortcutHint>}
                disabled={!grid.emptySelection.canPaste}
                onClick={grid.pasteToEmptyRow}
              >
                Paste
              </Menu.Item>
            )}

            {contextMenu.kind === "display" && (
              <>
                <Menu.Label>Layout</Menu.Label>
                <Menu.Item leftSection={<MdAdd />} onClick={entityEditors.openAddLayout}>
                  Add
                </Menu.Item>
                <Menu.Item
                  leftSection={<MdEdit />}
                  disabled={!layout}
                  onClick={entityEditors.openEditLayout}
                >
                  Edit
                </Menu.Item>
                <Menu.Item
                  leftSection={<MdContentCopy />}
                  disabled={!layout}
                  onClick={entityEditors.openDuplicateLayout}
                >
                  Duplicate
                </Menu.Item>
                <Menu.Item
                  leftSection={<MdFindReplace />}
                  disabled={!layout || entityEditors.layoutItems.length < 2}
                  onClick={entityEditors.openReplaceLayout}
                >
                  Replace…
                </Menu.Item>
                <Menu.Item
                  color="red"
                  leftSection={<MdDelete />}
                  disabled={!layout}
                  onClick={entityEditors.requestDeleteLayout}
                >
                  Delete
                </Menu.Item>
                {/* Layer only matters in Mapping mode — Render/Invoke
                    plugins attach to it, Layout plugins attach to the
                    Layout itself (see `Layer`'s own `hidden` prop, hiding
                    its picker in the header the same way). */}
                {mode === "mapping" && (
                  <>
                    <Menu.Divider />
                    <Menu.Label>Layer</Menu.Label>
                    <Menu.Item
                      leftSection={<MdAdd />}
                      disabled={!layout}
                      onClick={entityEditors.openAddLayer}
                    >
                      Add
                    </Menu.Item>
                    <Menu.Item
                      leftSection={<MdEdit />}
                      disabled={!layer}
                      onClick={entityEditors.openEditLayer}
                    >
                      Edit
                    </Menu.Item>
                    <Menu.Item
                      leftSection={<MdContentCopy />}
                      disabled={!layer}
                      onClick={entityEditors.openDuplicateLayer}
                    >
                      Duplicate
                    </Menu.Item>
                    <Menu.Item
                      leftSection={<MdFindReplace />}
                      disabled={!layer || entityEditors.layerItems.length < 2}
                      onClick={entityEditors.openReplaceLayer}
                    >
                      Replace…
                    </Menu.Item>
                    <Menu.Item
                      color="red"
                      leftSection={<MdDelete />}
                      // A layout must always keep at least one layer — see
                      // `kbrd-api`'s own `delete_layer`, which rejects this
                      // same case server-side too.
                      disabled={!layer || entityEditors.layerItems.length <= 1}
                      onClick={entityEditors.requestDeleteLayer}
                    >
                      Delete
                    </Menu.Item>
                  </>
                )}
              </>
            )}
          </Menu.Dropdown>
        </Menu>
      )}

      {divideModalOpened && grid.layoutSelection && (
        <Divide
          onClose={() => setDivideModalOpened(false)}
          onDivide={(cols, rows) => {
            grid.divideSelectedCell(cols, rows);
            setDivideModalOpened(false);
          }}
        />
      )}

      {/* Pasting, or dropping a Layout plugin, onto a cell/division that
          already has content asks first — see
          `pendingOverwrite`/`confirmOverwrite` in `useDisplayGrid`. */}
      {grid.pendingOverwrite && (
        <Confirmation
          title="Overwrite"
          message={
            grid.pendingOverwrite.source === "paste" &&
            grid.pendingOverwrite.targets.length > 1
              ? `Overwrite content on ${grid.pendingOverwrite.targets.length} cells?`
              : "Overwrite the current content?"
          }
          onConfirm={grid.confirmOverwrite}
          onCancel={grid.cancelOverwrite}
        />
      )}

      {/* Backspace, or the context menu's "Delete", on a cell/division
          selection — see `pendingDelete`/`confirmDelete` in
          `useDisplayGrid`. */}
      {grid.pendingDelete && (
        <Confirmation
          title="Delete"
          message="Delete the selected content?"
          onConfirm={grid.confirmDelete}
          onCancel={grid.cancelDelete}
        />
      )}

      {/* Mapping's own equivalents — see the Copy/Paste/Delete/Move
          functions above. */}
      {pendingMappingOverwrite && (
        <Confirmation
          title="Overwrite"
          message={`Overwrite Mapping content on ${pendingMappingOverwrite.length} key${pendingMappingOverwrite.length > 1 ? "s" : ""}?`}
          onConfirm={() => {
            const targets = pendingMappingOverwrite;
            setPendingMappingOverwrite(null);
            if (targets) void applyMappingPaste(targets);
          }}
          onCancel={() => setPendingMappingOverwrite(null)}
        />
      )}
      {pendingMappingDelete && (
        <Confirmation
          title="Delete"
          message={
            pendingMappingDelete.length > 1
              ? `Delete the content of these ${pendingMappingDelete.length} elements?`
              : "Delete the content of this element?"
          }
          onConfirm={() => void confirmMappingDelete()}
          onCancel={() => setPendingMappingDelete(null)}
        />
      )}
      {pendingMove && (
        <Confirmation
          title="Move"
          message="Move will overwrite existing content on this key. Continue?"
          onConfirm={() => {
            const target = pendingMove;
            setPendingMove(null);
            if (target) void applyMoveKey(target.source, target.dest);
          }}
          onCancel={() => setPendingMove(null)}
        />
      )}
    </Box>
  );
}
