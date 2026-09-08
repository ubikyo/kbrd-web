import { Box } from "@mantine/core";
import { useEffect, useState } from "react";
import type { DragEvent, MouseEvent as ReactMouseEvent } from "react";

import { addKeyPlugin } from "../api/layers";
import { FALLBACK_HEIGHT, FALLBACK_WIDTH } from "../api/device";
import { DEFAULT_STATE_NAME } from "../classes/inspectorHelpers";
import { useCellMove } from "../classes/useCellMove";
import { useCellResize } from "../classes/useCellResize";
import { useKeyDrag } from "../classes/useKeyDrag";
import type { KeyDragTarget } from "../classes/useKeyDrag";
import { useDevicePolling } from "../classes/useDevicePolling";
import { useElementSize } from "../classes/useElementSize";
import { isMappingTarget, isMappingVisible, pluginById } from "../plugins/registry";
import type { KeyPlugin, LayerData } from "../types/layer";
import {
  defaultGridCell,
  MIN_UNIT,
  type DivideGrid,
  type GridCell,
  type LayoutSettings,
  type MergeGroups,
} from "../types/layout";
import {
  gridSizeMm,
  groupOf,
  layoutRow,
  maxItems,
  mergedOutline,
  pitchMm,
  primaryOf,
  remainingUnitsInRow,
  type CellRect,
} from "../utils/layout";
import { randomId } from "../utils/id";
import { keyLook } from "../utils/keyProperties";
import type { KeyLook } from "../utils/keyProperties";
import LayoutCellDivision from "./LayoutCellDivision";
import LayoutCell, { ResizeGrip } from "./LayoutCell";

const PADDING = 60;
const PLUGIN_DRAG_TYPE = "application/kbrd-plugin";
// Same green `LayoutCell` uses for a selected cell.
const DISPLAY_SELECTED_STROKE = "#00ff00";

// What's currently under the drag cursor: an existing cell, a row's
// trailing empty space (see `remainingUnitsInRow`) — there's no "default
// cell" to drop onto until one of these creates one — or a division of a
// divided cell (see `GridCell.divide`).
type DropTarget =
  | { kind: "cell"; id: number }
  | { kind: "row"; row: number }
  | { kind: "division"; parentId: number; subId: number };

// Identifies one division of a divided cell — `parentId` is that cell's
// own (top-level) id, `subId` one of its `divide.cells` keys.
type DivisionRef = { parentId: number; subId: number };

// What a right-click landed on — see `onContextMenu`. Resolved the same
// way its equivalent left-click target is (a merged cell's own primary,
// a division's own primary), so `App` can select it and show its own
// context menu without re-deriving any of that itself.
export type ContextMenuTarget =
  | { kind: "cell"; id: number }
  | ({ kind: "division" } & DivisionRef)
  | { kind: "row"; row: number }
  | { kind: "display" };

type Props = LayoutSettings & {
  mode: "layout" | "mapping";
  // The display's full grid — see `gridRows`. A row starts with no cells at
  // all; `App` owns the actual list.
  rows: number[][];
  cells: Record<number, GridCell>;
  onCellsChange: (
    update: (current: Record<number, GridCell>) => Record<number, GridCell>,
  ) => void;
  // The current layer, and how to save a freshly-created `KeyPlugin` back
  // onto it — `null`/omitted-effect while there's no layer yet (nothing to
  // attach to, same as `isMappingTarget` already gating an untyped cell).
  // Only Mapping mode's own drop handling (`handleCellDrop`/
  // `handleDivisionDrop`) actually reads either of these.
  layer: LayerData | null;
  onChangePlugins: (plugins: KeyPlugin[]) => void;
  // Drops a freshly-typed cell onto the end of `row`'s empty space —
  // dropping a Layout plugin where there's no cell yet.
  onCreateCell: (row: number, cell: GridCell) => void;
  // Dropping a Layout plugin (Key/Space) onto an *existing* cell/division
  // instead — sets its kind, confirming first if it already has content
  // a kind change would discard (see `useDisplayGrid`'s own
  // `assignLayoutPlugin`/`assignLayoutPluginToDivision`).
  onAssignLayoutPlugin: (
    index: number,
    pluginId: string,
    defaultConfig: Record<string, unknown>,
  ) => void;
  onAssignLayoutPluginToDivision: (
    parentId: number,
    subId: number,
    pluginId: string,
    defaultConfig: Record<string, unknown>,
  ) => void;
  // Drags a plain, unmerged cell to reposition it — same row (reorder)
  // or a different one entirely — right before `beforeId` (`null` for
  // the row's own end). No-ops in `App` if it doesn't actually fit
  // there — see `handleCellDragOver`'s own insertion-point math and
  // `onMoveCell`'s Unit-budget check.
  onMoveCell: (id: number, targetRow: number, beforeId: number | null) => void;
  // Dragging a Key cell with Mapping content onto another Key cell moves
  // all of it there (in place of the old "Move to" menu item) — see
  // `useKeyDrag`. Only wired up (and only ever called) in Mapping mode.
  onMoveKey: (sourceKeyRef: string, destKeyRef: string) => void;
  mergeGroups: MergeGroups;
  // Every currently-selected top-level cell's own primary id — plain
  // click replaces this with a singleton (or empty, toggling the sole
  // member off); Cmd/Ctrl+click toggles one in or out of it instead, for
  // the multi-select Merge/Delete now live in `App`'s context menu (see
  // its own `contextMenu`) rather than the old click-an-adjacent-cell
  // flow.
  selectedCellIndices: number[];
  onSelectCell: (index: number | null) => void;
  // "Make this the selection", with none of `onSelectCell`'s own
  // click-to-toggle — what a drop, and a drag on its way to one, wants:
  // see `focusCell` in `useDisplayGrid`.
  onFocusCell: (index: number) => void;
  onToggleCell: (index: number) => void;
  // A row's trailing empty space (or a fully empty row), selected instead
  // of a real cell — mutually exclusive with `selectedCellIndices`. Lets a
  // copied plugin be pasted straight into space nothing has claimed yet.
  selectedEmptyRow: number | null;
  onSelectEmpty: (row: number) => void;
  // Which divisions of `selectedCellIndices`' sole cell (if it's divided)
  // are the real focus, instead of the divided cell as a whole — see
  // `GridCell.divide`. Empty while a plain, undivided cell (or nothing)
  // is selected. Same plain-click-replaces / Cmd-click-toggles rule as
  // `selectedCellIndices`, just scoped to this one cell's own divisions.
  selectedDivisionIndices: number[];
  onSelectDivision: (ref: DivisionRef) => void;
  // `onFocusCell` for one division of a divided cell.
  onFocusDivision: (ref: DivisionRef) => void;
  onToggleDivision: (ref: DivisionRef) => void;
  // The physical screen itself (the white outline) selected as its own
  // target — mutually exclusive with a cell — for `App`'s Layout/Layer
  // context menu, the same way selecting a cell shows its own.
  isDisplaySelected: boolean;
  onSelectDisplay: () => void;
  // Right-click, anywhere on the display — reports the client-space
  // coordinates to open `App`'s context menu at, and what was actually
  // under the cursor (already selected the same way its left-click
  // equivalent would be, by the time this fires — see `handleClick` and
  // friends). Layout-only for a cell/division/row: in Mapping mode
  // there's nothing of the sort to act on, so the browser's own context
  // menu is left alone instead.
  onContextMenu: (x: number, y: number, target: ContextMenuTarget) => void;
  // "Resize" in the Actions menu — while off, no cell's grip renders (see
  // `pendingGrips`) and dragging one to resize is impossible, not just
  // harder to reach.
  resizeEnabled: boolean;
  // The current layout's own Max width (1U) override (see the Layout
  // editor's Geometry tab), clamped below to whatever still fits — `null`
  // means no override, i.e. use the full computed width. Max height (1U)
  // needs no equivalent prop: `App` already bakes it into `rows`' own
  // length (see `gridItemsY`), so `itemsY` below just reads that back.
  maxColumns: number | null;
};

/**
 * The physical screen itself — a rectangle standing in for KBRD-DEV's
 * physical screen, sized to that screen's aspect ratio (fetched from
 * KBRD-API, which KBRD-DEV keeps up to date) and fit to the available
 * surface — plus its whole cell grid, drawn as part of the same SVG
 * rather than a separate bordered box around it, so both share one
 * coordinate system and stay centered together. SVG (rather than a CSS
 * grid) is what lets a merged group's shape become a stepped outline (an
 * ISO Enter key) instead of a plain rectangle. Purely a controlled
 * renderer: every mode-level chrome around it (the Layout/Mapping switch,
 * Resize, the context menu, Divide) lives in `<Composer>`, one level up.
 *
 * Each row is laid out as an actual flow (`layoutRow`): a 1.25U key really
 * spans 1.25 pitches of row space (see `cellSizeMm`), everything after it
 * shifts over. A row holds no cells at
 * all until something's actually dropped on it — whatever's left of its
 * Unit budget (`remainingUnitsInRow`) renders as one trailing, dashed drop
 * target rather than a pre-existing "default" cell.
 *
 * Every cell — and a row's trailing empty space — is a drop target for
 * the plugins dragged from `<Inspector>`'s Plugins tab: a Layout plugin
 * (kbrd.layout-key / kbrd.layout-space) sets a cell's kind while in Layout
 * mode (dropping on empty space creates a brand new cell there instead,
 * minting it a fresh `keyRef` — see `GridCell.keyRef`), and, once a cell
 * is a Key, a Render/Invoke plugin can be dropped onto it while in
 * Mapping mode — a real `KeyPlugin`, attached to that cell's own `keyRef`
 * (see `keyPluginsFor`/`attachMappingPlugin`), whose content then draws
 * right inside the cell's own shape (see `LayoutCell`'s own `keyPlugins`).
 * Adjacent cells can also be merged into one (see the Actions menu in
 * Layout mode) — including a row's still-empty space, which becomes a
 * brand-new, plugin-less cell as part of the merge rather than needing
 * one typed first; every member of a merge shows and edits the same
 * `GridCell`, the group's smallest index (`primaryOf`).
 * Dropping a plugin selects the cell; clicking one does too (and clicking
 * a row's empty space selects *that*, so a copied plugin can be pasted
 * straight onto it), unless a merge is in progress, in which case clicking
 * a valid neighbour — cell or empty space alike — completes it.
 * The grid's own disposition — cells, their merges, which populate each
 * row — is autosaved onto the current layer's own `factory_layout` (see
 * the effect in `App`) and reloaded whenever the user switches layer, as
 * one opaque JSON blob rather than per-key rows: each cell/division's own
 * `typeId`/`typeConfig`/`unit`/`keyRef` lives there. The real `KeyPlugin`
 * records a `keyRef` points at are separate — ordinary per-layer rows,
 * saved (and reloaded) the usual way, same as any other plugin instance.
 */
export default function Display({
  unitMm,
  physicalWidthMm,
  physicalHeightMm,
  gapMm,
  mode,
  rows,
  cells,
  onCellsChange,
  layer,
  onChangePlugins,
  onCreateCell,
  onAssignLayoutPlugin,
  onAssignLayoutPluginToDivision,
  onMoveCell,
  onMoveKey,
  mergeGroups,
  selectedCellIndices,
  onSelectCell,
  onFocusCell,
  onToggleCell,
  selectedEmptyRow,
  onSelectEmpty,
  selectedDivisionIndices,
  onSelectDivision,
  onFocusDivision,
  onToggleDivision,
  isDisplaySelected,
  onSelectDisplay,
  onContextMenu,
  resizeEnabled,
  maxColumns,
}: Props) {
  const { ref: viewportRef, size: viewport } = useElementSize<HTMLDivElement>();
  const device = useDevicePolling();
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null);

  const ratio = device.connected
    ? device.width / device.height
    : FALLBACK_WIDTH / FALLBACK_HEIGHT;

  const display = (() => {
    if (viewport.width <= 0 || viewport.height <= 0) return null;

    let width = viewport.width;
    let height = width / ratio;
    if (height > viewport.height) {
      height = viewport.height;
      width = height * ratio;
    }
    return { width, height };
  })();
  // The SVG's own scale — real screen pixels per mm of `viewBox` — used to
  // convert a fixed-pixel size (the resize grip, see `LayoutCell`) into
  // this SVG's mm-space, and pixel drag deltas back into mm below.
  const pxPerMm = (() => {
    if (!display || physicalWidthMm <= 0) return 0;
    return display.width / physicalWidthMm;
  })();

  // `App` already clamped any Max height (1U) override into `rows`' own
  // length before it ever reaches here — see `gridItemsY`.
  const itemsY = rows.length;
  const computedItemsX = maxItems(physicalWidthMm, unitMm, gapMm);
  const itemsX =
    maxColumns != null ? Math.min(maxColumns, computedItemsX) : computedItemsX;
  const rowPitch = pitchMm(unitMm, gapMm);
  // Rows, as a block, are centered both ways: their own reference
  // footprint (itemsY rows tall, itemsX 1U cells wide) is often slightly
  // smaller than the physical display on each axis (maxItems floors
  // down), so the leftover margin is split evenly on every side rather
  // than left pinned to the top-left corner.
  const gridOffsetY =
    (physicalHeightMm - gridSizeMm(itemsY, unitMm, gapMm)) / 2;
  const referenceRowWidthMm = gridSizeMm(itemsX, unitMm, gapMm);
  const gridOffsetX = (physicalWidthMm - referenceRowWidthMm) / 2;

  const { handleResizeStart } = useCellResize({
    rows,
    cells,
    physicalWidthMm,
    unitMm,
    gapMm,
    display,
    pxPerMm,
    onCellsChange,
  });

  const cellMove = useCellMove({
    rows,
    cells,
    unitMm,
    gapMm,
    display,
    pxPerMm,
    gridOffsetX,
    gridOffsetY,
    itemsY,
    rowPitch,
    onMoveCell,
  });
  const {
    svgRef,
    moveDropTarget,
    suppressClickRef,
    handleCellPointerDown,
  } = cellMove;

  // A drag target's own current `keyRef` — `undefined`/`null` for a Key
  // cell/division that's never had one minted yet (see `GridCell.keyRef`'s
  // own docblock) — and, for `onMoveKey` below, minting (and persisting)
  // a fresh one on demand for whichever end doesn't have one, the same
  // way `handleCellDrop`/`handleDivisionDrop` already do for a plugin
  // dropped from the Inspector.
  function keyRefFor(target: KeyDragTarget): string | null | undefined {
    return target.kind === "cell"
      ? cells[target.id]?.keyRef
      : cells[target.parentId]?.divide?.cells[target.subId]?.keyRef;
  }

  function ensureKeyRef(target: KeyDragTarget): string {
    const existing = keyRefFor(target);
    if (existing) return existing;
    const keyRef = randomId();
    if (target.kind === "cell") {
      onCellsChange((current) => {
        const cell = current[target.id];
        if (!cell) return current;
        return { ...current, [target.id]: { ...cell, keyRef } };
      });
    } else {
      onCellsChange((current) => {
        const parent = current[target.parentId];
        const existingDivision = parent?.divide?.cells[target.subId];
        if (!parent?.divide || !existingDivision) return current;
        return {
          ...current,
          [target.parentId]: {
            ...parent,
            divide: {
              ...parent.divide,
              cells: {
                ...parent.divide.cells,
                [target.subId]: { ...existingDivision, keyRef },
              },
            },
          },
        };
      });
    }
    return keyRef;
  }

  const keyDrag = useKeyDrag({
    rows,
    cells,
    mergeGroups,
    unitMm,
    gapMm,
    display,
    pxPerMm,
    gridOffsetX,
    gridOffsetY,
    itemsY,
    rowPitch,
    svgRef,
    hasContent: (target) => hasMappingContent(keyRefFor(target)),
    pluginCount: (target) => pluginCountFor(keyRefFor(target)),
    onSelectStart: (target) => {
      if (isSelectedTarget(target)) return;
      if (target.kind === "cell") onFocusCell(target.id);
      else onFocusDivision({ parentId: target.parentId, subId: target.subId });
    },
    onMoveKey: (source, dest) => {
      const sourceKeyRef = ensureKeyRef(source);
      const destKeyRef = ensureKeyRef(dest);
      onMoveKey(sourceKeyRef, destKeyRef);
      // The destination becomes the selection, same as dropping a plugin
      // from the Inspector onto a cell/division already does (see
      // `handleCellDrop`/`handleDivisionDrop`'s own `onSelectCell`/
      // `onSelectDivision` calls) — not the source, which just lost its
      // content.
      if (dest.kind === "cell") onFocusCell(dest.id);
      else onFocusDivision({ parentId: dest.parentId, subId: dest.subId });
    },
  });

  // A native HTML5 drag ending any way at all (dropped, or cancelled with
  // Escape) must never leave a stale drop-target highlight behind — the
  // element it was over doesn't always get its own `dragleave` first.
  useEffect(() => {
    const clearDropTarget = () => {
      setDropTarget(null);
      cellMove.clearMoveDropTarget();
    };
    window.addEventListener("dragend", clearDropTarget);
    window.addEventListener("drop", clearDropTarget);
    return () => {
      window.removeEventListener("dragend", clearDropTarget);
      window.removeEventListener("drop", clearDropTarget);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // This cell/division's own attached Render/Invoke plugins (see
  // `GridCell.keyRef`), resolved from the current layer's real
  // `plugins` — same `enabled`/`position` convention `<Preview>` already
  // reads them by. `keyRef` is `undefined`/`null` for a cell that's
  // never had a Layout plugin assigned since this field existed (or has
  // none at all), which trivially has nothing attached either way.
  function keyPluginsFor(keyRef: string | null | undefined): KeyPlugin[] {
    if (!keyRef || !layer) return [];
    return layer.plugins
      .filter((instance) => instance.enabled && instance.key_ref === keyRef)
      .sort((a, b) => a.position - b.position);
  }

  // This cell/division's own look for its resting state: the Background
  // and Border groups of its `kbrd.render-key` row in the Properties tab
  // (see `keyLook`), which is what the key is actually painted with.
  // Mapping mode only — Layout mode is about the grid's own disposition,
  // and already shows neither a key's content nor its paint.
  function keyLookFor(keyRef: string | null | undefined): KeyLook | undefined {
    if (mode === "layout" || !layer) return undefined;
    return keyLook(layer.key_properties, keyRef) ?? undefined;
  }

  // Whether `keyRef` has *any* Mapping content at all — including a
  // disabled plugin, unlike `keyPluginsFor` above (which only resolves
  // the ones actually drawn). Used to decide whether a key is worth
  // dragging (`useKeyDrag`'s own `hasContent`), the same "any plugin
  // counts" rule Composer's own Copy/Paste/Delete already use
  // (`hasMappingContent`) — a key whose only plugin happens to be
  // disabled was otherwise silently undraggable.
  function hasMappingContent(keyRef: string | null | undefined): boolean {
    return Boolean(keyRef && layer?.plugins.some((instance) => instance.key_ref === keyRef));
  }

  // How many plugins `keyRef` carries — same "any plugin counts" rule as
  // `hasMappingContent` above, shown on the key-move drag ghost once it
  // grows (see `useKeyDrag`'s own `pluginCount`).
  function pluginCountFor(keyRef: string | null | undefined): number {
    if (!keyRef || !layer) return 0;
    return layer.plugins.filter((instance) => instance.key_ref === keyRef).length;
  }

  // Whether `target` is already the sole selection — guards `onSelectStart`
  // above so re-confirming a drag on whatever's already selected doesn't
  // also run through `onSelectCell`/`onSelectDivision`'s own toggle-off-if-
  // already-sole-selection logic and deselect it instead.
  function isSelectedTarget(target: KeyDragTarget): boolean {
    return target.kind === "cell"
      ? selectedCellIndices.length === 1 &&
          selectedCellIndices[0] === target.id &&
          selectedDivisionIndices.length === 0
      : selectedCellIndices.length === 1 &&
          selectedCellIndices[0] === target.parentId &&
          selectedDivisionIndices.length === 1 &&
          selectedDivisionIndices[0] === target.subId;
  }

  // Actually creates the real `KeyPlugin` record a Render/Invoke plugin
  // dropped onto a Key cell/division in Mapping mode attaches to — see
  // `handleCellDrop`/`handleDivisionDrop`. `keyRef` is whatever the target
  // cell already has, or a freshly minted one passed down from there for
  // a cell that predates this field (saved before `GridCell.keyRef`
  // existed, or one long-lived enough that this is somehow still unset).
  async function attachMappingPlugin(keyRef: string, pluginId: string) {
    if (!layer) return;
    const plugin = pluginById(pluginId);
    if (!plugin) return;
    const created = await addKeyPlugin(
      layer.id,
      keyRef,
      plugin.id,
      plugin.version,
      // Nothing stored yet: every field falls back to the plugin's own
      // `defaultConfig` for rendering (see `LayoutCell`), which is what
      // leaves each optional property group closed until the Inspector's
      // own `+` actually sets it (see `PropertyGroup`).
      { states: { [DEFAULT_STATE_NAME]: {} } },
    );
    onChangePlugins([...layer.plugins, created]);
  }

  // Whether `index` (optionally one of its divisions) is *already* the
  // whole selection — see the two `dragover` handlers below.
  function isFocused(index: number, subId?: number): boolean {
    if (selectedCellIndices.length !== 1 || selectedCellIndices[0] !== index) {
      return false;
    }
    return subId === undefined
      ? selectedDivisionIndices.length === 0
      : selectedDivisionIndices.length === 1 &&
          selectedDivisionIndices[0] === subId;
  }

  function handleCellDragOver(id: number, event: DragEvent<SVGGElement>) {
    if (!event.dataTransfer.types.includes(PLUGIN_DRAG_TYPE)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    setDropTarget({ kind: "cell", id });
    // Whatever is in hand is about to land here, so the Inspector should
    // already be showing this cell rather than only catching up on the
    // drop — dragging over a cell *is* aiming at it. `onFocusCell`, not
    // `onSelectCell`: dragging onto the cell that happens to be selected
    // already must not toggle it off (see `focusCell`).
    //
    // Guarded because `dragover` keeps firing for as long as the pointer
    // sits there, and each write would be a fresh selection array — one
    // re-render per event, all the way through the drag.
    const primary = primaryOf(id, mergeGroups);
    if (!isFocused(primary)) onFocusCell(primary);
  }

  function sameDropTarget(a: DropTarget, b: DropTarget): boolean {
    if (a.kind !== b.kind) return false;
    if (a.kind === "cell" && b.kind === "cell") return a.id === b.id;
    if (a.kind === "row" && b.kind === "row") return a.row === b.row;
    if (a.kind === "division" && b.kind === "division") {
      return a.parentId === b.parentId && a.subId === b.subId;
    }
    return false;
  }

  function handleDragLeave(target: DropTarget) {
    setDropTarget((current) =>
      current && sameDropTarget(current, target) ? null : current,
    );
  }

  function handleClick(event: ReactMouseEvent<SVGGElement>, index: number) {
    // A cell click is never also a click on the display behind it — see
    // `handleSelectDisplay`, bound on the `<svg>` itself.
    event.stopPropagation();
    // The browser still fires a `click` right after the `pointerup` that
    // ends an actual move-drag (see the pointer effect above) — without
    // this, dropping a cell elsewhere would also re-select/toggle it. Same
    // deal for `keyDrag`'s own Mapping-mode drag, a separate hook/ref.
    if (suppressClickRef.current || keyDrag.suppressClickRef.current) {
      suppressClickRef.current = false;
      keyDrag.suppressClickRef.current = false;
      return;
    }
    const primary = primaryOf(index, mergeGroups);
    if (event.metaKey || event.ctrlKey) {
      onToggleCell(primary);
      return;
    }
    const isSoleSelection =
      selectedCellIndices.length === 1 && selectedCellIndices[0] === primary;
    onSelectCell(isSoleSelection ? null : primary);
  }

  function handleEmptyClick(
    row: number,
    event: ReactMouseEvent<SVGGElement>,
  ) {
    // Same as `handleClick` — never also a click on the display behind it.
    event.stopPropagation();
    onSelectEmpty(row);
  }

  function handleCellDrop(index: number, event: DragEvent<SVGGElement>) {
    const pluginId = event.dataTransfer.getData(PLUGIN_DRAG_TYPE);
    const plugin = pluginById(pluginId);
    if (!plugin) return;
    event.preventDefault();
    setDropTarget(null);
    const primary = primaryOf(index, mergeGroups);

    if (mode === "layout") {
      if (plugin.category !== "Layout") return;
      // Confirms first if this would discard an existing, different kind
      // (its own config, or whatever Mapping-mode plugins were attached)
      // — see `useDisplayGrid`'s own `assignLayoutPlugin`.
      onAssignLayoutPlugin(primary, plugin.id, plugin.defaultConfig);
      return;
    }

    const cell = cells[primary];
    // Nothing about a key limits it to one instance per plugin: two
    // labels, a label over three rectangles — each drop is its own
    // instance, stacked by `position` (see `keyPluginsFor`).
    if (plugin.category === "Layout" || !isMappingTarget(cell?.typeId)) {
      return;
    }
    // A cell saved before `GridCell.keyRef` existed has none yet — mint
    // one now rather than losing the drop, so there's still something
    // real for the `KeyPlugin` below to attach to.
    const keyRef = cell.keyRef ?? randomId();
    onCellsChange((current) => ({
      ...current,
      [primary]: {
        ...cell,
        keyRef,
        // Which kinds of plugin this cell has, not how many of each: the
        // real instances (and their count) live in `layer.plugins`.
        pluginIds: cell.pluginIds.includes(plugin.id)
          ? cell.pluginIds
          : [...cell.pluginIds, plugin.id],
      },
    }));
    onFocusCell(primary);
    void attachMappingPlugin(keyRef, plugin.id);
  }

  function handleRowDragOver(row: number, event: DragEvent<SVGGElement>) {
    if (
      mode !== "layout" ||
      !event.dataTransfer.types.includes(PLUGIN_DRAG_TYPE)
    ) {
      return;
    }
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    setDropTarget({ kind: "row", row });
  }

  function handleRowDrop(row: number, event: DragEvent<SVGGElement>) {
    if (mode !== "layout") return;
    const pluginId = event.dataTransfer.getData(PLUGIN_DRAG_TYPE);
    const plugin = pluginById(pluginId);
    if (!plugin || plugin.category !== "Layout") return;
    const remaining = remainingUnitsInRow(
      row,
      rows,
      cells,
      physicalWidthMm,
      unitMm,
      gapMm,
    );
    if (remaining < MIN_UNIT) return;
    event.preventDefault();
    setDropTarget(null);
    onCreateCell(row, {
      ...defaultGridCell(Math.min(1, remaining)),
      typeId: plugin.id,
      typeConfig: { ...plugin.defaultConfig },
      keyRef: randomId(),
    });
  }

  // Same idea as `handleClick`, scoped to one cell's own divisions
  // (`divide.mergeGroups`) instead of the display's top-level `mergeGroups`
  // — completes a division-scoped merge in progress, or just selects the
  // division clicked. `parentRect` is that cell's own rect, already
  // computed once per row by the caller (see the render loop below).
  function handleDivisionClick(
    parentId: number,
    divide: DivideGrid,
    subId: number,
    event: ReactMouseEvent<SVGGElement>,
  ) {
    event.stopPropagation();
    // Same deal as `handleClick`'s own check — the `click` right after a
    // `keyDrag` move's `pointerup` (see `useKeyDrag`) must not also
    // select/toggle the division it just landed on.
    if (suppressClickRef.current || keyDrag.suppressClickRef.current) {
      suppressClickRef.current = false;
      keyDrag.suppressClickRef.current = false;
      return;
    }
    const primary = primaryOf(subId, divide.mergeGroups);
    if (event.metaKey || event.ctrlKey) {
      onToggleDivision({ parentId, subId: primary });
      return;
    }
    const isSoleSelection =
      selectedCellIndices.length === 1 &&
      selectedCellIndices[0] === parentId &&
      selectedDivisionIndices.length === 1 &&
      selectedDivisionIndices[0] === primary;
    if (isSoleSelection) {
      onSelectCell(null);
      return;
    }
    onSelectDivision({ parentId, subId: primary });
  }

  function handleDivisionDragOver(
    parentId: number,
    subId: number,
    event: DragEvent<SVGGElement>,
  ) {
    if (!event.dataTransfer.types.includes(PLUGIN_DRAG_TYPE)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    setDropTarget({ kind: "division", parentId, subId });
    // Same as `handleCellDragOver` — the division being aimed at becomes
    // the selection on the way in, and only when it isn't already.
    if (!isFocused(parentId, subId)) onFocusDivision({ parentId, subId });
  }

  // Same idea as `handleCellDrop`, but writing into `cells[parentId]`'s
  // own nested `divide.cells` instead of the top-level `cells` map.
  function handleDivisionDrop(
    parentId: number,
    divide: DivideGrid,
    subId: number,
    event: DragEvent<SVGGElement>,
  ) {
    const pluginId = event.dataTransfer.getData(PLUGIN_DRAG_TYPE);
    const plugin = pluginById(pluginId);
    if (!plugin) return;
    event.preventDefault();
    setDropTarget(null);
    const primary = primaryOf(subId, divide.mergeGroups);

    if (mode === "layout") {
      if (plugin.category !== "Layout") return;
      // Confirms first if this would discard an existing, different kind
      // — see `useDisplayGrid`'s own `assignLayoutPluginToDivision`.
      onAssignLayoutPluginToDivision(parentId, primary, plugin.id, plugin.defaultConfig);
      return;
    }

    const divCell = divide.cells[primary];
    if (plugin.category === "Layout" || !isMappingTarget(divCell?.typeId)) {
      return;
    }
    const keyRef = divCell.keyRef ?? randomId();
    onCellsChange((current) => {
      const parent = current[parentId];
      const existing = parent?.divide?.cells[primary];
      if (!parent?.divide || !existing) return current;
      return {
        ...current,
        [parentId]: {
          ...parent,
          divide: {
            ...parent.divide,
            cells: {
              ...parent.divide.cells,
              [primary]: {
                ...existing,
                keyRef,
                // See `handleCellDrop` — kinds present, not a count.
                pluginIds: existing.pluginIds.includes(plugin.id)
                  ? existing.pluginIds
                  : [...existing.pluginIds, plugin.id],
              },
            },
          },
        },
      };
    });
    onFocusDivision({ parentId, subId: primary });
    void attachMappingPlugin(keyRef, plugin.id);
  }

  // Right-click handlers — select the target (mirrors the equivalent
  // left-click handler above, minus its merge-in-progress branch: a
  // context menu request is never itself the neighbour that completes a
  // merge) and report it to `App`, which opens its own context menu
  // there. A cell/division's own menu fires in either mode now — its
  // content differs (geometry actions in Layout, Mapping-content actions
  // in Mapping — see `Composer`); only the empty row's menu below stays
  // Layout-only, since Mapping has no equivalent to act on there.
  function handleCellContextMenu(index: number, event: ReactMouseEvent<SVGGElement>) {
    event.preventDefault();
    event.stopPropagation();
    const primary = primaryOf(index, mergeGroups);
    // Right-clicking a cell that's already part of the current
    // multi-selection opens the menu for that whole selection (standard
    // desktop convention); right-clicking outside it replaces the
    // selection with just this one cell, same as a plain click would.
    if (!selectedCellIndices.includes(primary)) onSelectCell(primary);
    onContextMenu(event.clientX, event.clientY, { kind: "cell", id: primary });
  }

  function handleDivisionContextMenu(
    parentId: number,
    divide: DivideGrid,
    subId: number,
    event: ReactMouseEvent<SVGGElement>,
  ) {
    event.preventDefault();
    event.stopPropagation();
    const primary = primaryOf(subId, divide.mergeGroups);
    const alreadyFocused =
      selectedCellIndices.length === 1 &&
      selectedCellIndices[0] === parentId &&
      selectedDivisionIndices.includes(primary);
    if (!alreadyFocused) onSelectDivision({ parentId, subId: primary });
    onContextMenu(event.clientX, event.clientY, { kind: "division", parentId, subId: primary });
  }

  function handleEmptyContextMenu(row: number, event: ReactMouseEvent<SVGGElement>) {
    if (mode !== "layout") return;
    event.preventDefault();
    event.stopPropagation();
    onSelectEmpty(row);
    onContextMenu(event.clientX, event.clientY, { kind: "row", row });
  }

  function handleDisplayContextMenu(event: ReactMouseEvent<SVGSVGElement>) {
    event.preventDefault();
    onSelectDisplay();
    onContextMenu(event.clientX, event.clientY, { kind: "display" });
  }

  // Collected while laying out each row's cells below, then rendered as
  // their own pass *after* every row — see `ResizeGrip` for why a grip
  // can't just render inline as part of its own cell.
  const pendingGrips: { id: number; bounds: CellRect; unit: number }[] = [];

  return (
    <Box
      ref={viewportRef}
      w="100%"
      h="100%"
      p={PADDING}
      style={{
        boxSizing: "border-box",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {display && (
        <svg
          ref={svgRef}
          className="factory-display"
          aria-label="Display"
          width={display.width}
          height={display.height}
          viewBox={`0 0 ${physicalWidthMm} ${physicalHeightMm}`}
          // Any click that isn't on a cell — including the frame itself —
          // bubbles up here and selects the display instead; cells stop
          // their own click from reaching this (see `handleClick`). Also
          // the final backstop for `suppressClickRef`/`keyDrag`'s own —
          // the state update a drag's `pointerup` triggers (a fresh
          // selection, a moved plugin…) can get the dragged cell/division
          // reconciled to a new DOM node before the browser's trailing
          // `click` fires, letting it bubble straight past every `<g>`'s
          // own `stopPropagation()` up to here instead.
          onClick={() => {
            if (suppressClickRef.current || keyDrag.suppressClickRef.current) {
              suppressClickRef.current = false;
              keyDrag.suppressClickRef.current = false;
              return;
            }
            onSelectDisplay();
          }}
          onContextMenu={handleDisplayContextMenu}
          style={{ flexShrink: 0, cursor: "pointer" }}
        >
          <rect
            x={0}
            y={0}
            width={physicalWidthMm}
            height={physicalHeightMm}
            fill="transparent"
            stroke={isDisplaySelected ? DISPLAY_SELECTED_STROKE : "var(--kbrd-border-alt)"}
            strokeWidth={isDisplaySelected ? 2 : 1}
            vectorEffect="non-scaling-stroke"
          />
          {physicalWidthMm > 0 && itemsY > 0 && (
            <g transform={`translate(${gridOffsetX}, ${gridOffsetY})`}>
              {rows.map((cellIds, row) => {
                const slots = layoutRow(cellIds, cells, unitMm, gapMm);
                const cellItems = slots.map((slot) => {
                  const group = groupOf(slot.id, mergeGroups);
                  const primary = Math.min(...group);
                  // A merged cell only renders once, from its primary —
                  // its other members are covered by the merge's own shape.
                  if (primary !== slot.id) return null;

                  const cell = cells[primary];
                  // A cell always gets a `typeId` the instant it's
                  // created (dropping a Layout plugin is what creates it
                  // in the first place) — except a cell that used to be
                  // divided, all of whose divisions were merged back
                  // into one that happened to still be blank (see
                  // `App`'s `mergeDivisionWith`): render that one exactly
                  // like the row's own trailing empty space, no text and
                  // staying dashed even once selected, rather than
                  // showing a stray size label on a cell with nothing
                  // really assigned to it.
                  const hasContent = Boolean(cell?.typeId);
                  const merged =
                    group.length > 1
                      ? mergedOutline(group, rows, cells, unitMm, gapMm)
                      : null;
                  const bounds = merged?.bounds ?? {
                    x: slot.x,
                    y: row * rowPitch,
                    width: slot.width,
                    height: unitMm,
                  };

                  // Only a single, unmerged cell has one well-defined right
                  // edge to drag — a merge's shape (and its Unit) comes
                  // from all of its members together. Queued for its own
                  // pass below rather than rendered here — see
                  // `pendingGrips` — and skipped entirely while "Resize" is
                  // off (Layout mode only: Mapping mode hides the switch
                  // and never shows a grip regardless of what it was left
                  // at), so there's nothing to show *or* drag.
                  if (mode === "layout" && resizeEnabled && group.length === 1 && cell) {
                    pendingGrips.push({ id: primary, bounds, unit: cell.unit });
                  }

                  // A divided (and, by construction, still unmerged at
                  // the top level — see `GridCell.divide`) cell renders
                  // its own division grid instead of one plain shape; the
                  // resize grip above still targets its own outer `unit`.
                  if (group.length === 1 && cell?.divide) {
                    return (
                      <LayoutCellDivision
                        key={primary}
                        mode={mode}
                        parentId={primary}
                        divide={cell.divide}
                        parentRect={bounds}
                        parentUnit={cell.unit}
                        selectedCellIndices={selectedCellIndices}
                        selectedDivisionIndices={selectedDivisionIndices}
                        isDropTarget={(subId) =>
                          dropTarget?.kind === "division" &&
                          dropTarget.parentId === primary &&
                          dropTarget.subId === subId
                        }
                        isMoveTarget={(subId) =>
                          keyDrag.dragTarget?.kind === "division" &&
                          keyDrag.dragTarget.parentId === primary &&
                          keyDrag.dragTarget.subId === subId
                        }
                        onDivisionClick={handleDivisionClick}
                        onDivisionContextMenu={handleDivisionContextMenu}
                        onDivisionDragOver={handleDivisionDragOver}
                        onDivisionDragLeave={(parentId, subId) =>
                          handleDragLeave({ kind: "division", parentId, subId })
                        }
                        onDivisionDrop={handleDivisionDrop}
                        onDivisionPointerDown={(parentId, subId, event) =>
                          keyDrag.handleKeyPointerDown(
                            { kind: "division", parentId, subId },
                            event,
                          )
                        }
                        keyPluginsFor={keyPluginsFor}
                        keyLookFor={keyLookFor}
                      />
                    );
                  }

                  // Mapping mode only ever shows a cell whose own Layout
                  // plugin opts into it (`mapping-visible` — Key does,
                  // Space doesn't) — an invisible one still keeps its row
                  // slot (nothing here changes `layoutRow`'s own math),
                  // just nothing renders there: no shape, no text, and
                  // (having no element at all) no longer clickable either.
                  if (mode !== "layout" && !isMappingVisible(cell?.typeId)) {
                    return null;
                  }

                  return (
                    <LayoutCell
                      key={primary}
                      bounds={bounds}
                      path={merged?.path}
                      labelBounds={merged?.labelBounds}
                      typeId={cell?.typeId}
                      keyPlugins={keyPluginsFor(cell?.keyRef)}
                      look={keyLookFor(cell?.keyRef)}
                      unit={hasContent ? cell?.unit : undefined}
                      isEmpty={!hasContent}
                      isSelected={selectedCellIndices.includes(primary)}
                      isDropTarget={
                        dropTarget?.kind === "cell" && dropTarget.id === primary
                      }
                      isMoveTarget={
                        keyDrag.dragTarget?.kind === "cell" &&
                        keyDrag.dragTarget.id === primary
                      }
                      // Layout-only: Mapping mode shows the shape (once
                      // `mapping-visible`) with no size/type caption under
                      // it — see `LayoutCell`'s own `showText`.
                      showText={mode === "layout"}
                      onClick={(event) => handleClick(event, primary)}
                      onContextMenu={(event) => handleCellContextMenu(primary, event)}
                      onDragOver={(event) => handleCellDragOver(primary, event)}
                      onDragLeave={() =>
                        handleDragLeave({ kind: "cell", id: primary })
                      }
                      onDrop={(event) => handleCellDrop(primary, event)}
                      // Layout: only a single, unmerged cell has one
                      // well-defined place to drag *from* — same
                      // restriction the resize grip already has (see
                      // `pendingGrips` above). Mapping: any Key cell that
                      // actually has content — dragging it moves that
                      // content onto whatever key it's dropped on (see
                      // `useKeyDrag`), in place of the old "Move to" menu
                      // item; an empty key has nothing to drag.
                      onPointerDown={
                        mode === "layout"
                          ? group.length === 1
                            ? (event) => handleCellPointerDown(primary, event)
                            : undefined
                          : (event) =>
                              keyDrag.handleKeyPointerDown({ kind: "cell", id: primary }, event)
                      }
                    />
                  );
                });

                const remaining = remainingUnitsInRow(
                  row,
                  rows,
                  cells,
                  physicalWidthMm,
                  unitMm,
                  gapMm,
                );
                // A row's own trailing empty space (its dashed drop
                // target) is a Layout-only concept — there's nothing to
                // drop there in Mapping mode, and the row itself isn't a
                // selectable target either.
                if (mode !== "layout" || remaining <= 0) return cellItems;

                const last = slots[slots.length - 1];
                // An empty row's drop zone picks up right where the last
                // real cell left off — or at the row's own flush origin
                // (see `layoutRow`) if there isn't one yet.
                const emptyX = last ? last.x + last.width + gapMm : 0;
                // Reaches all the way to the row's reference right edge
                // (`referenceRowWidthMm`, the same footprint `gridOffsetX`
                // centers), not just `remaining * unitMm` — a lone big
                // cell's Unit budget doesn't spend the gaps a full row of
                // 1U cells would have, so stopping at the raw Unit width
                // alone would leave the drop zone short of the physical
                // edge and the whole row looking off-center.
                const emptyWidth = Math.max(referenceRowWidthMm - emptyX, 0);
                return [
                  ...cellItems,
                  <LayoutCell
                    key={`row-${row}-empty`}
                    bounds={{
                      x: emptyX,
                      y: row * rowPitch,
                      width: emptyWidth,
                      height: unitMm,
                    }}
                    isEmpty
                    isSelected={selectedEmptyRow === row}
                    isDropTarget={
                      dropTarget?.kind === "row" && dropTarget.row === row
                    }
                    onClick={(event) => handleEmptyClick(row, event)}
                    onContextMenu={(event) => handleEmptyContextMenu(row, event)}
                    onDragOver={(event) => handleRowDragOver(row, event)}
                    onDragLeave={() =>
                      handleDragLeave({ kind: "row", row })
                    }
                    onDrop={(event) => handleRowDrop(row, event)}
                  />,
                ];
              })}
              {pendingGrips.map((grip) => (
                <ResizeGrip
                  key={grip.id}
                  bounds={grip.bounds}
                  pxPerMm={pxPerMm}
                  onResizeStart={(event) =>
                    handleResizeStart(grip.id, grip.unit, event)
                  }
                />
              ))}
              {moveDropTarget && (
                <line
                  x1={moveDropTarget.xMm}
                  x2={moveDropTarget.xMm}
                  y1={moveDropTarget.row * rowPitch}
                  y2={moveDropTarget.row * rowPitch + unitMm}
                  stroke="#00ff00"
                  strokeWidth={2}
                  vectorEffect="non-scaling-stroke"
                  style={{ pointerEvents: "none" }}
                />
              )}
            </g>
          )}
        </svg>
      )}
    </Box>
  );
}
