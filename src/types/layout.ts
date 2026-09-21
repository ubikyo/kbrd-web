import { randomId } from "../utils/id";

export type LayoutData = {
  id: number;
  name: string;
  description: string;
  author: string;
  unit: "px" | "mm";
  created_at: string;
  // Caps size / Gap size (see `LayoutSettings`) — per-layout, persisted
  // on the layout itself so they survive a reload or a switch back to
  // this layout — snake_case straight from KBRD-API, like `LayerData`'s
  // own fields. The physical screen's width/height are *not* here: see
  // `DisplayData` — they're the same for every layout.
  unit_mm: number;
  gap_mm: number;
  // How many 1U reference items this layout uses, in each direction —
  // `null` means "as many as Caps size / Gap size / the display's own
  // physical size allow" (see `maxItems`); otherwise a ceiling *below*
  // that, never above it (see `Display`'s `maxColumns` and `App`'s
  // `gridItemsY`, both of which still clamp to the computed max in case
  // Caps/Gap/the display changed since this was set).
  max_columns: number | null;
  max_rows: number | null;
};

export type LayoutPayload = Pick<
  LayoutData,
  | "name"
  | "description"
  | "author"
  | "unit"
  | "unit_mm"
  | "gap_mm"
  | "max_columns"
  | "max_rows"
>;

/** The physical screen's own width/height (see KBRD-API's `display`) — one
 * value for the whole device, shared by every layout: switching layouts
 * must never resize this, unlike Caps size / Gap size (`LayoutData`'s own
 * `unit_mm`/`gap_mm`), which are per-layout. */
export type DisplayData = {
  physical_width_mm: number;
  physical_height_mm: number;
  /** Which screen this is. Written first by the wizard and changed
   * whenever Settings picks a different panel off the same list (see
   * `setup/panels`). Empty on a device that has never been set up;
   * `brand`/`model` are also empty for a screen described by hand,
   * which has no entry on the list to point back at. */
  name: string;
  brand: string;
  model: string;
};

/** What a write to `/api/display` may carry. The screen's name travels
 * with its size or not at all — a row naming one panel at another's
 * millimetres describes no screen that exists — and left out entirely it
 * is left alone, which is what keeps a size nudged by hand from quietly
 * unnaming the panel it belongs to. */
export type DisplayWrite = {
  physical_width_mm: number;
  physical_height_mm: number;
  name?: string;
  brand?: string;
  model?: string;
};

/** Physical grid settings edited across Settings (physical width/height)
 * and the Layout editor (Caps size / Gap size), shared with `Display` (the
 * preview grid) as one bag of numbers regardless of where each one is
 * actually edited or persisted — the camelCase, form-friendly shape of
 * `LayoutData`/`DisplayData`'s own `*_mm` fields. */
export type LayoutSettings = {
  unitMm: number;
  physicalWidthMm: number;
  physicalHeightMm: number;
  gapMm: number;
};

/** Seeds a brand-new layout (Caps size / Gap size), or `App` before the
 * display/layout have loaded, until the real numbers are confirmed in
 * Settings / the Layout editor. `physicalWidthMm`/`physicalHeightMm`
 * still match KBRD-DEV's reference panel (see kbrd_dev/config.py's
 * calibration comment); `unitMm` matches KBRD's own 16mm keycaps instead. */
export const DEFAULT_LAYOUT_SETTINGS: LayoutSettings = {
  unitMm: 16,
  physicalWidthMm: 216,
  physicalHeightMm: 135,
  gapMm: 3,
};

/** The Unit slider's own step and floor — a cell's width is always a
 * multiple of this, from `MIN_UNIT` up to whatever its row has left of
 * its budget (see `maxUnitForCell`). */
export const MIN_UNIT = 0.25;
export const UNIT_STEP = 0.25;

/**
 * One cell in `<Display>`'s grid: a plugin dropped on the display. Synthetic
 * and local for now — see the TODO on `Display` — identified by its own
 * stable id (see `nextCellId`). There is no "default" cell: a row starts
 * with none at all, and one only exists once a Layout plugin
 * (kbrd.layout-key / kbrd.layout-space) is actually dropped on the display
 * — see `rows` in `App`.
 */
export type GridCell = {
  // Plugin id of the attached kbrd.layout-key / kbrd.layout-space instance.
  typeId: string | null;
  // That plugin instance's own config (e.g. LayoutKey's `keyMode`).
  typeConfig: Record<string, unknown>;
  // Invoke/Display plugins attached in Layer mode.
  pluginIds: string[];
  // This cell's own stable reference for the real `KeyPlugin` records a
  // Render/Invoke plugin dropped onto it in Layer mode attaches to (see
  // `KeyPlugin.key_ref`) — unrelated to `id`/`nextCellId`, which is only
  // this synthetic grid's own bookkeeping and can be reused once a cell is
  // deleted. Generated fresh (`randomId()`) the moment a Layout
  // plugin is first assigned to this cell, and again whenever its kind
  // changes to a different Layout plugin — `null` until then, since there's
  // nothing yet for a dropped plugin to attach to. Not preserved across
  // Divide/Merge: each resulting cell/division gets its own fresh one
  // rather than inheriting the original's, so a stale reference never
  // silently keeps pointing at plugins that no longer make sense for the
  // new shape.
  keyRef: string | null;
  // Keycap width, as a multiple of the display's Unit — any multiple of
  // `UNIT_STEP` from `MIN_UNIT` up.
  unit: number;
  // Present once this (unmerged) cell has been split into a gap-less
  // internal grid — "Divide" in the Actions menu — see `DivideGrid`.
  // Mutually exclusive with actually being merged: a merge only ever
  // shows/edits its primary's own `GridCell`, so a member past the first
  // never has its own `divide` consulted for anything.
  divide?: DivideGrid;
};

export function defaultGridCell(unit = MIN_UNIT): GridCell {
  return {
    typeId: null,
    typeConfig: {},
    pluginIds: [],
    keyRef: null,
    unit,
  };
}

// A division has no `unit` of its own (it's an even fraction of its
// parent's rect, not a Unit-budgeted row cell) and can't be divided again
// (see `DivideGrid`) — otherwise the same shape as `GridCell`, so the same
// Properties editor (`LayoutCellProperties`) works for either.
export type DivisionCell = {
  typeId: string | null;
  typeConfig: Record<string, unknown>;
  pluginIds: string[];
  // Same role as `GridCell.keyRef`, scoped to this division — see there.
  keyRef: string | null;
};

export function defaultDivisionCell(): DivisionCell {
  return { typeId: null, typeConfig: {}, pluginIds: [], keyRef: null };
}

/**
 * A cell split into `cols` × `rows` equal-share divisions with no gap
 * between them (unlike ordinary same-row cells, always `gapMm` apart) —
 * "Divide" in a cell's context menu. Divisions are real, independently
 * selectable/editable cells (ids `0` to `cols * rows - 1`, row-major:
 * `id = row * cols + col`), starting out unmerged — see `createDivideGrid`.
 * `mergeGroups` is scoped to just these divisions and shares its shape
 * with the display's own top-level one (`MergeGroups`) — and the same
 * `addMerge`/`removeMerge`/`groupOf`/`primaryOf` utilities — so
 * "Merge"/"Unmerge" on a division is the same action as on any other
 * cell, just working over this smaller, nested group instead.
 */
export type DivideGrid = {
  cols: number;
  rows: number;
  cells: Record<number, DivisionCell>;
  mergeGroups: MergeGroups;
};

/** A fresh `cols` × `rows` division grid, unmerged so it shows up right
 * away as `cols * rows` separate cells (no Unmerge needed first to
 * reveal them). Division `0` inherits `original`'s own plugin/config —
 * the cell being divided already had one (every top-level cell gets a
 * `typeId` the moment it's created, by dropping a Layout plugin) — so
 * dividing doesn't just discard it; every other division starts blank,
 * assigned individually the same way a brand-new top-level cell is, by
 * dropping a plugin from the Plugins tab. Cloned rather than reused
 * as-is, so later edits to one don't reach back into the other. */
export function createDivideGrid(
  cols: number,
  rows: number,
  original: DivisionCell,
): DivideGrid {
  const count = cols * rows;
  const cells: Record<number, DivisionCell> = { 0: cloneDivisionCell(original) };
  for (let id = 1; id < count; id++) cells[id] = defaultDivisionCell();
  return { cols, rows, cells, mergeGroups: [] };
}

// Division `0`'s own `keyRef` is deliberately NOT copied from `original` —
// see `GridCell.keyRef`'s docblock on why Divide always mints a fresh one
// instead, even for the one division that otherwise inherits everything
// else about the cell being divided.
function cloneDivisionCell(cell: DivisionCell): DivisionCell {
  return {
    typeId: cell.typeId,
    typeConfig: { ...cell.typeConfig },
    pluginIds: [...cell.pluginIds],
    keyRef: cell.typeId ? randomId() : null,
  };
}

/**
 * Groups of grid indices merged into one key — replaces colspan/rowspan.
 * Each group is sorted; a cell not listed in any group is its own,
 * unmerged singleton. The group's *primary* (its smallest index) is the
 * one whose `GridCell` (type, config, Layer plugins) the whole merged
 * shape shows and edits — see `primaryOf`/`groupOf` in `utils/layout`.
 */
export type MergeGroups = number[][];

/**
 * `<Display>`'s full grid disposition, as saved onto the current
 * `LayerData` (see `factory_layout`) — each layer keeps its own,
 * loaded back whenever the user switches to it. Everything `App` otherwise
 * keeps as local-only state: which cell ids populate each row
 * (`rowOverrides`, fed to `gridRows`), each cell's own data, and which
 * cells are merged.
 */
export type FactoryLayout = {
  rowOverrides: Record<number, number[]>;
  cells: Record<number, GridCell>;
  mergeGroups: MergeGroups;
};
