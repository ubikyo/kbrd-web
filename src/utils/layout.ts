import {
  defaultGridCell,
  type DivideGrid,
  type GridCell,
  type LayoutData,
  type MergeGroups,
} from "../types/layout";

export function defaultLayout(items: LayoutData[]) {
  return items.find((item) => item.name.toLowerCase() === "default") ?? items[0];
}

/** Centre-to-centre spacing between two adjacent items. */
export function pitchMm(unitMm: number, gapMm: number) {
  return unitMm + gapMm;
}

/**
 * How many `unitMm`-sized items fit along `physicalMm`, spaced `gapMm`
 * apart. `n` items take `n * unitMm + (n - 1) * gapMm` — solving for the
 * largest `n` that still fits gives `floor((physicalMm + gapMm) / pitch)`.
 */
export function maxItems(physicalMm: number, unitMm: number, gapMm: number) {
  const pitch = pitchMm(unitMm, gapMm);
  if (pitch <= 0 || physicalMm <= 0) return 0;
  return Math.max(0, Math.floor((physicalMm + gapMm) / pitch));
}

/** Reference footprint of `items` 1U slots laid out with `gapMm` between
 * them — the same total width/height `maxItems` fits within `physicalMm`.
 * Used to center the display's rows within its own physical size, both
 * vertically (its row count) and horizontally (its column count) — see
 * `gridOffsetY`/`gridOffsetX` in `Display`. */
export function gridSizeMm(items: number, unitMm: number, gapMm: number) {
  return items > 0 ? items * unitMm + (items - 1) * gapMm : 0;
}

/**
 * A cell's own physical footprint. `unitMm` is a keycap's own size (not
 * its pitch — the space between two keycaps' centres is `unitMm + gapMm`,
 * see `pitchMm`): a plain 1U key is `unitMm` wide, but a wider one spanning
 * `cell.unit` pitches isn't simply `cell.unit * unitMm` — it eats that
 * many pitches of row space, plastic and gap alike, except for the one
 * trailing gap it doesn't need past its own last pitch. Height is always
 * the display's base cap size (a row's height doesn't depend on Unit).
 */
export function cellSizeMm(cell: GridCell, unitMm: number, gapMm: number) {
  return {
    width: cell.unit * pitchMm(unitMm, gapMm) - gapMm,
    height: unitMm,
  };
}

/**
 * `cellSizeMm`'s width, read backwards: how many Units wide a footprint
 * of `widthMm` is.
 *
 * What a merge's own size label is worked out from (see `Display`). A
 * merge has no `unit` of its own — each member carries only its own
 * share, and a group stacked across rows would add up to a number
 * describing its height as much as its width — so the shape it actually
 * occupies is asked instead, along the one axis a Unit means anything
 * on. A group spanning several rows measures the widest of them, that
 * being what its bounding box is.
 *
 * The `+ gapMm` is the trailing gap `cellSizeMm` leaves off: two 1U
 * cells merged side by side span both keycaps *and* the gap that used to
 * run between them, which is exactly 2 Units of row and comes back as 2.
 *
 * Rounded to the hundredth, the same place `useCellResize` snaps a Unit
 * to, so a merge of quarter-Unit cells reads "0.75U" rather than a
 * repeating decimal.
 */
export function unitsAcross(widthMm: number, unitMm: number, gapMm: number) {
  const pitch = pitchMm(unitMm, gapMm);
  if (pitch <= 0 || widthMm <= 0) return 0;
  return Math.round(((widthMm + gapMm) / pitch) * 100) / 100;
}

/**
 * The display's full grid: `itemsY` rows, each an ordered list of cell ids
 * — empty until a plugin is actually dropped on that row (there is no
 * "default cell"; see `GridCell`'s docstring). `rowOverrides` holds
 * whatever rows have at least one cell.
 */
export function gridRows(
  itemsY: number,
  rowOverrides: Record<number, number[]>,
): number[][] {
  return Array.from({ length: itemsY }, (_, row) => rowOverrides[row] ?? []);
}

/** Which row of `rows` holds cell `id`, or -1 if none does. */
export function rowOf(id: number, rows: number[][]): number {
  return rows.findIndex((cellIds) => cellIds.includes(id));
}

/** A fresh id guaranteed not to collide with any id already in `rows`. */
export function nextCellId(rows: number[][]): number {
  return 1 + rows.reduce((max, cellIds) => Math.max(max, ...cellIds, -1), -1);
}

/** Appends a fresh cell to the end of `row` — dropping a Layout plugin on
 * a row's empty space. Returns both the updated grid and the new cell's
 * id, so the caller can give that id a real `GridCell` (its plugin type)
 * in the same stroke. */
export function addCellToRow(
  rows: number[][],
  row: number,
): { rows: number[][]; id: number } {
  const id = nextCellId(rows);
  return {
    rows: rows.map((cellIds, r) => (r === row ? [...cellIds, id] : cellIds)),
    id,
  };
}

/** Inserts a fresh cell into `row` right after `afterId` — "Paste" in the
 * Actions menu, landing next to the cell it was invoked from rather than
 * at the row's end (see `addCellToRow` for that). Falls back to the row's
 * end if `afterId` isn't actually in it. Returns both the updated grid
 * and the new cell's id, so the caller can give it a real `GridCell` in
 * the same stroke. */
export function insertCellAfter(
  rows: number[][],
  row: number,
  afterId: number,
): { rows: number[][]; id: number } {
  const id = nextCellId(rows);
  return {
    rows: rows.map((cellIds, r) => {
      if (r !== row) return cellIds;
      const at = cellIds.indexOf(afterId);
      if (at === -1) return [...cellIds, id];
      return [...cellIds.slice(0, at + 1), id, ...cellIds.slice(at + 1)];
    }),
    id,
  };
}

/** Whether `id` could be removed from the row it's in — a merged cell has
 * to be unmerged first, since removing one member out from under a merge
 * would leave the others pointing at a group member that no longer
 * exists. Unlike a cell's Unit, a row's cell *count* has no floor: a row
 * can go all the way back down to empty. */
export function canRemoveCell(
  id: number,
  rows: number[][],
  mergeGroups: MergeGroups,
): boolean {
  const row = rowOf(id, rows);
  if (row === -1) return false;
  return groupOf(id, mergeGroups).length === 1;
}

/** Removes `id` from `row`'s cell list — the inverse of `addCellToRow`. */
export function removeCellFromRow(
  rows: number[][],
  row: number,
  id: number,
): number[][] {
  return rows.map((cellIds, r) =>
    r === row ? cellIds.filter((cellId) => cellId !== id) : cellIds,
  );
}

/** One rendered slot in a row laid out by `layoutRow`. */
export type RowSlot = {
  id: number;
  x: number;
  width: number;
};

/**
 * Lays a row's actual cells out left to right as a plain flow, starting
 * flush at the row's own local origin (`x = 0`) — a gap only sits
 * *between* two consecutive cells, not before the first or after the
 * last, matching `maxItems`'s own `n * unitMm + (n - 1) * gapMm` budget.
 * Each cell's own physical width comes from `cellSizeMm` (its Unit is a
 * pitch count, not a raw mm scale — see that function), and the next
 * cell sits right after its edge plus one more `gapMm`. Nothing is
 * rescaled or stretched to hit any particular total. Whatever margin the
 * row ends up with on screen comes from centering the whole grid as a
 * block (`gridOffsetX` in `Display`), not from a margin baked in here. A
 * row with no cells (or fewer/smaller ones than its full Unit budget)
 * simply ends early; see `Display`'s trailing drop target for the budget
 * it has left (`maxUnitForCell`).
 */
export function layoutRow(
  cellIds: number[],
  cells: Record<number, GridCell>,
  unitMm: number,
  gapMm: number,
): RowSlot[] {
  const slots: RowSlot[] = [];
  let x = 0;

  for (const id of cellIds) {
    const { width } = cellSizeMm(cells[id] ?? defaultGridCell(), unitMm, gapMm);
    if (slots.length > 0) x += gapMm;
    slots.push({ id, x, width });
    x += width;
  }

  return slots;
}

/**
 * A row's total Unit budget: the same flat count `maxItems` gives for the
 * horizontal axis (and shown in Settings as "Max items") — how many 1U
 * items fit across `physicalWidthMm`. That number is the cap on the *sum*
 * of a row's cell Units, however many cells make it up: 1×9U, 18×0.5U,
 * 36×0.25U or any other split that adds up to it are all equally valid.
 * Gaps between cells are rendered (see `layoutRow`) but don't themselves
 * count against this budget.
 */
function rowUnitCapacity(
  physicalWidthMm: number,
  unitMm: number,
  gapMm: number,
): number {
  return maxItems(physicalWidthMm, unitMm, gapMm);
}

/**
 * The largest Unit `id` could take without pushing its row's Unit sum
 * past its flat budget — see `rowUnitCapacity`. Used as the Unit slider's
 * `max` (`LayoutCellProperties`).
 */
export function maxUnitForCell(
  id: number,
  rows: number[][],
  cells: Record<number, GridCell>,
  physicalWidthMm: number,
  unitMm: number,
  gapMm: number,
): number {
  const row = rowOf(id, rows);
  const capacity = rowUnitCapacity(physicalWidthMm, unitMm, gapMm);
  if (row === -1) return capacity;
  const cellIds = rows[row];
  const otherUnits = cellIds.reduce(
    (sum, cellId) =>
      cellId === id ? sum : sum + (cells[cellId] ?? defaultGridCell()).unit,
    0,
  );
  return Math.max(capacity - otherUnits, 0);
}

/** How much Unit budget a row has left for a brand new cell — the width
 * of `Display`'s trailing "drop a plugin here" zone — see
 * `rowUnitCapacity`. */
export function remainingUnitsInRow(
  row: number,
  rows: number[][],
  cells: Record<number, GridCell>,
  physicalWidthMm: number,
  unitMm: number,
  gapMm: number,
): number {
  const cellIds = rows[row] ?? [];
  const usedUnits = cellIds.reduce(
    (sum, id) => sum + (cells[id] ?? defaultGridCell()).unit,
    0,
  );
  const capacity = rowUnitCapacity(physicalWidthMm, unitMm, gapMm);
  return Math.max(capacity - usedUnits, 0);
}

/** A cell's absolute rectangle: `x`/`width` from its own row's flow,
 * `y`/`height` from the display's fixed row pitch. */
export type CellRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export function cellRect(
  id: number,
  rows: number[][],
  cells: Record<number, GridCell>,
  unitMm: number,
  gapMm: number,
): CellRect {
  const row = rowOf(id, rows);
  const slot = layoutRow(rows[row] ?? [], cells, unitMm, gapMm).find(
    (candidate) => candidate.id === id,
  );
  return {
    x: slot?.x ?? 0,
    y: Math.max(row, 0) * pitchMm(unitMm, gapMm),
    width: slot?.width ?? unitMm,
    height: unitMm,
  };
}

/** The merge group `index` belongs to, or the singleton `[index]` if it
 * hasn't been merged with anything. */
export function groupOf(index: number, groups: MergeGroups): number[] {
  return groups.find((group) => group.includes(index)) ?? [index];
}

/** The index whose `GridCell` a merged group is shown and edited through
 * — its smallest member, so it's stable regardless of merge order. */
export function primaryOf(index: number, groups: MergeGroups): number {
  return Math.min(...groupOf(index, groups));
}

/** Merges `a` and `b`'s groups (each possibly already a merge of several
 * cells) into one, replacing both in `groups`. */
export function addMerge(
  groups: MergeGroups,
  a: number,
  b: number,
): MergeGroups {
  const groupA = groupOf(a, groups);
  const groupB = groupOf(b, groups);
  const merged = [...new Set([...groupA, ...groupB])].sort((x, y) => x - y);
  const rest = groups.filter((group) => group !== groupA && group !== groupB);
  return [...rest, merged];
}

/** Undoes `index`'s merge, splitting its group back into standalone cells
 * — the inverse of `addMerge`. A no-op if `index` isn't merged. */
export function removeMerge(groups: MergeGroups, index: number): MergeGroups {
  const group = groupOf(index, groups);
  return groups.filter((candidate) => candidate !== group);
}

/** Two rects "share a common edge" when they sit right against each
 * other — horizontally on the same row, or vertically across the gap
 * between two rows — with some overlap along the touching side. */
export function shareEdge(a: CellRect, b: CellRect, gapMm: number) {
  const eps = 1e-6;
  const horizontallyTouching =
    Math.abs(a.y - b.y) < eps &&
    Math.abs(a.height - b.height) < eps &&
    (Math.abs(a.x + a.width + gapMm - b.x) < eps ||
      Math.abs(b.x + b.width + gapMm - a.x) < eps);
  const verticallyTouching =
    (Math.abs(a.y + a.height + gapMm - b.y) < eps ||
      Math.abs(b.y + b.height + gapMm - a.y) < eps) &&
    a.x < b.x + b.width - eps &&
    b.x < a.x + a.width - eps;
  return horizontallyTouching || verticallyTouching;
}

/** Whether any cell of `groupA` shares a common edge with any cell of
 * `groupB` — the condition for the two groups to be merge-able. */
export function groupsShareEdge(
  groupA: number[],
  groupB: number[],
  rows: number[][],
  cells: Record<number, GridCell>,
  unitMm: number,
  gapMm: number,
) {
  const rectsA = groupA.map((id) => cellRect(id, rows, cells, unitMm, gapMm));
  const rectsB = groupB.map((id) => cellRect(id, rows, cells, unitMm, gapMm));
  return rectsA.some((a) => rectsB.some((b) => shareEdge(a, b, gapMm)));
}

/**
 * Whether every id in `ids` is reachable from every other by a chain of
 * `shareEdge` adjacency — the condition for treating an arbitrary,
 * multi-selected set of cells as one mergeable region, rather than
 * building a merge up one adjacent click at a time. `rectOf` abstracts
 * over what's actually being checked (a row's cells via `cellRect`, a
 * division grid's own cells via `divisionCellRect`), so this one
 * traversal serves both. A single id (or none) is trivially contiguous.
 */
export function cellsAreContiguous(
  ids: number[],
  rectOf: (id: number) => CellRect,
  gapMm: number,
): boolean {
  if (ids.length <= 1) return true;
  const remaining = new Set(ids);
  const start = ids[0];
  remaining.delete(start);
  const stack = [start];
  while (stack.length > 0) {
    const current = stack.pop() as number;
    for (const other of remaining) {
      if (shareEdge(rectOf(current), rectOf(other), gapMm)) {
        remaining.delete(other);
        stack.push(other);
      }
    }
  }
  return remaining.size === 0;
}

/** Same idea as `cellsAreContiguous`, but for a division grid's own
 * uniform `cols` × `rows` layout — adjacency there is plain row/column
 * arithmetic (row-major ids, see `DivideGrid`), so it doesn't need any
 * rect (or `parentRect`) at all. */
export function divisionsAreContiguous(ids: number[], cols: number): boolean {
  if (ids.length <= 1) return true;
  const adjacent = (a: number, b: number) => {
    const colA = a % cols;
    const rowA = Math.floor(a / cols);
    const colB = b % cols;
    const rowB = Math.floor(b / cols);
    return (
      (colA === colB && Math.abs(rowA - rowB) === 1) ||
      (rowA === rowB && Math.abs(colA - colB) === 1)
    );
  };
  const remaining = new Set(ids);
  const start = ids[0];
  remaining.delete(start);
  const stack = [start];
  while (stack.length > 0) {
    const current = stack.pop() as number;
    for (const other of remaining) {
      if (adjacent(current, other)) {
        remaining.delete(other);
        stack.push(other);
      }
    }
  }
  return remaining.size === 0;
}

/** Whatever the arrow keys can move the selection onto: a top-level cell
 * (always a merge group's own primary, the id a selection ever carries —
 * see `primaryOf`) or one division of a divided one. */
export type SelectionRef =
  | { kind: "cell"; id: number }
  | { kind: "division"; parentId: number; subId: number };

/** Whether a cell/division with this Layout plugin can be selected at all
 * right now — everything, in Layout mode; only what Layer actually
 * renders (`isLayerVisible`, i.e. not a Space), there. Passed in rather
 * than read off the plugin registry so this file stays pure geometry. */
type NavigablePredicate = (typeId: string | null | undefined) => boolean;

function isSameStop(a: SelectionRef, b: SelectionRef): boolean {
  return a.kind === "cell"
    ? b.kind === "cell" && a.id === b.id
    : b.kind === "division" &&
        a.parentId === b.parentId &&
        a.subId === b.subId;
}

/**
 * Every place an arrow key can land, in reading order: left to right
 * within a row, then row by row down the display — a divided cell
 * contributing its own divisions (row-major, the order `DivideGrid` lays
 * them out in) in its place, since a divided cell is never selectable as
 * a whole by clicking either (see `Display`'s `handleDivisionClick`).
 *
 * Merge groups, at either level, appear exactly once — as their primary,
 * at their first member's place — so a merged cell is one stop, not one
 * per member, and stepping through the list can never bounce backwards
 * onto a primary that sits behind the group's later members.
 */
function selectionStops(
  rows: number[][],
  cells: Record<number, GridCell>,
  mergeGroups: MergeGroups,
  isNavigable: NavigablePredicate,
): SelectionRef[] {
  const stops: SelectionRef[] = [];
  const seen = new Set<number>();
  for (const rowCells of rows) {
    for (const id of rowCells) {
      const primary = primaryOf(id, mergeGroups);
      if (seen.has(primary)) continue;
      seen.add(primary);
      const divide = cells[primary]?.divide;
      if (!divide) {
        if (isNavigable(cells[primary]?.typeId)) {
          stops.push({ kind: "cell", id: primary });
        }
        continue;
      }
      const seenDivisions = new Set<number>();
      for (let subId = 0; subId < divide.cols * divide.rows; subId += 1) {
        const subPrimary = primaryOf(subId, divide.mergeGroups);
        if (seenDivisions.has(subPrimary)) continue;
        seenDivisions.add(subPrimary);
        if (isNavigable(divide.cells[subPrimary]?.typeId)) {
          stops.push({ kind: "division", parentId: primary, subId: subPrimary });
        }
      }
    }
  }
  return stops;
}

/**
 * Where ← / → move the selection from `from` — the next stop over in
 * reading order (see `selectionStops`), or `null` at the display's very
 * first/last one, where the selection just stays put.
 *
 * One flat sequence rather than one row at a time, at either level: past
 * a row's last cell comes the next row's first, and past a divided cell's
 * last division of one internal row comes the first of the row below it,
 * so no cell or division is ever unreachable from the keyboard — a 1×2
 * divided cell's bottom half included.
 */
export function adjacentSelection(
  from: SelectionRef,
  direction: -1 | 1,
  rows: number[][],
  cells: Record<number, GridCell>,
  mergeGroups: MergeGroups,
  isNavigable: NavigablePredicate = () => true,
): SelectionRef | null {
  const stops = selectionStops(rows, cells, mergeGroups, isNavigable);
  const at = stops.findIndex((stop) => isSameStop(stop, from));
  if (at !== -1) return stops[at + direction] ?? null;

  // `from` isn't a stop of its own — a divided cell selected as a whole
  // (a drag can leave it that way, unlike a click), or one whose own
  // divisions are all that's left navigable. Step into it rather than
  // going nowhere: the first of its stops going right, the last going
  // left, exactly where an arrow arriving from that side would land.
  const parentId = from.kind === "cell" ? from.id : from.parentId;
  const own = stops.filter(
    (stop) => (stop.kind === "cell" ? stop.id : stop.parentId) === parentId,
  );
  if (own.length === 0) return null;
  return direction === 1 ? own[0] : own[own.length - 1];
}

/** A point in the mm-space `mergedOutline` traces its shape in. */
type Point = { x: number; y: number };

const OUTLINE_EPS = 1e-6;

function near(a: number, b: number): boolean {
  return Math.abs(a - b) < OUTLINE_EPS;
}

/** Collapses one row's cells into a rect per maximal run of *consecutive*
 * group members — members with nothing, group or not, between them in the
 * row's own left-to-right order. A run's rect bridges the real `gapMm`
 * gaps *within* it, so a merge reads as one seamless keycap rather than
 * several with slivers of display showing through — but a cell that's
 * *not* in the group breaks the run right there: merging a row's outer
 * cells without its middle one, say, leaves the gaps on either side of
 * that untouched cell open rather than bridging across it.
 */
function rowSpans(
  cellIds: number[],
  group: Set<number>,
  cells: Record<number, GridCell>,
  unitMm: number,
  gapMm: number,
  y: number,
  height: number,
): CellRect[] {
  const spans: CellRect[] = [];
  let runStart: number | null = null;
  let runEnd = 0;
  for (const slot of layoutRow(cellIds, cells, unitMm, gapMm)) {
    if (group.has(slot.id)) {
      if (runStart === null) runStart = slot.x;
      runEnd = slot.x + slot.width;
    } else if (runStart !== null) {
      spans.push({ x: runStart, y, width: runEnd - runStart, height });
      runStart = null;
    }
  }
  if (runStart !== null) spans.push({ x: runStart, y, width: runEnd - runStart, height });
  return spans;
}

function boundingBox(rects: CellRect[]): CellRect {
  const x = Math.min(...rects.map((r) => r.x));
  const y = Math.min(...rects.map((r) => r.y));
  const right = Math.max(...rects.map((r) => r.x + r.width));
  const bottom = Math.max(...rects.map((r) => r.y + r.height));
  return { x, y, width: right - x, height: bottom - y };
}

/** The single largest of the group's own real row spans (before any
 * vertical bridging) — the safest place to anchor a merged cell's label
 * (see `mergedOutline`'s `labelBounds`), since it's guaranteed to be
 * solid keycap area rather than the shape's bounding box, which a
 * concave merge can leave empty at its exact centre (wrapped around a
 * cell that wasn't merged in, or simply two differently-sized rows
 * stacked so their shared centreline falls in the gap between them). */
function largestSpan(rects: CellRect[]): CellRect {
  return rects.reduce((largest, rect) =>
    rect.width * rect.height > largest.width * largest.height ? rect : largest,
  );
}

/** The shared tail of `mergedOutline` and `divisionOutline`: once a
 * group's own rects (its real spans, plus any bridges closing the gaps
 * between them) are worked out, tracing the outline and picking a label
 * anchor are the same for either. */
function outlineOfRects(
  spans: CellRect[],
  rects: CellRect[],
): { path: string; bounds: CellRect; labelBounds: CellRect } {
  const bounds = boundingBox(rects);
  // `largestSpan` exists to dodge a notch a stepped/concave merge leaves
  // empty at its centre (see its own docstring) — but when `rects` (which
  // never overlap each other) already add up to the *entire* bounding
  // box, the merge is just a plain, solid rectangle with nothing to
  // dodge, and centring on one arbitrary span instead of the whole shape
  // is wrong: for equal-sized rects (any merge of a division grid's own
  // uniform cells, the common case), several are tied for "largest",
  // so the tie-break would arbitrarily anchor the label on only one of
  // them — off-centre in the merged shape as a whole.
  const coveredArea = rects.reduce((sum, r) => sum + r.width * r.height, 0);
  const boundsArea = bounds.width * bounds.height;
  const isSolidRect = Math.abs(coveredArea - boundsArea) < 1e-6 * Math.max(1, boundsArea);
  return {
    path: tracePolygon(rects),
    bounds,
    labelBounds: isSolidRect ? bounds : largestSpan(spans),
  };
}

/**
 * Traces the outline of the union of `rects` as one or more closed SVG
 * subpaths, by rasterising the elementary cells their edges cut the plane
 * into: an elementary cell counts as covered when some rect contains its
 * centre, and a boundary edge survives wherever a covered cell borders an
 * uncovered one (or the plane's edge). Walking each covered cell's
 * surviving edges clockwise and chaining them end to end copes with
 * whatever shape `rects` happens to form — a plain rectangle, a stepped
 * ISO-Enter-style L, or a concave shape wrapped around a cell that wasn't
 * merged in — rather than assuming one span per row the way tracing the
 * rows directly would.
 */
function tracePolygon(rects: CellRect[]): string {
  if (rects.length === 0) return "";

  const xs = [...new Set(rects.flatMap((r) => [r.x, r.x + r.width]))].sort(
    (a, b) => a - b,
  );
  const ys = [...new Set(rects.flatMap((r) => [r.y, r.y + r.height]))].sort(
    (a, b) => a - b,
  );
  const cols = xs.length - 1;
  const rowCount = ys.length - 1;

  const covered = (midX: number, midY: number) =>
    rects.some(
      (r) => r.x < midX && midX < r.x + r.width && r.y < midY && midY < r.y + r.height,
    );
  const filled: boolean[][] = Array.from({ length: rowCount }, (_, j) =>
    Array.from({ length: cols }, (_, i) =>
      covered((xs[i] + xs[i + 1]) / 2, (ys[j] + ys[j + 1]) / 2),
    ),
  );
  const isFilled = (j: number, i: number) =>
    j >= 0 && j < rowCount && i >= 0 && i < cols && filled[j][i];

  const edges: [Point, Point][] = [];
  for (let j = 0; j < rowCount; j++) {
    for (let i = 0; i < cols; i++) {
      if (!filled[j][i]) continue;
      const [x0, x1, y0, y1] = [xs[i], xs[i + 1], ys[j], ys[j + 1]];
      if (!isFilled(j - 1, i)) edges.push([{ x: x0, y: y0 }, { x: x1, y: y0 }]);
      if (!isFilled(j, i + 1)) edges.push([{ x: x1, y: y0 }, { x: x1, y: y1 }]);
      if (!isFilled(j + 1, i)) edges.push([{ x: x1, y: y1 }, { x: x0, y: y1 }]);
      if (!isFilled(j, i - 1)) edges.push([{ x: x0, y: y1 }, { x: x0, y: y0 }]);
    }
  }

  const key = (p: Point) => `${p.x},${p.y}`;
  const byStart = new Map<string, [Point, Point][]>();
  for (const edge of edges) {
    const list = byStart.get(key(edge[0]));
    if (list) list.push(edge);
    else byStart.set(key(edge[0]), [edge]);
  }

  const used = new Set<[Point, Point]>();
  const loops: Point[][] = [];
  for (const start of edges) {
    if (used.has(start)) continue;
    const loop: Point[] = [];
    let current = start;
    for (;;) {
      used.add(current);
      loop.push(current[0]);
      const next = (byStart.get(key(current[1])) ?? []).find((e) => !used.has(e));
      if (!next) break;
      current = next;
    }
    loops.push(loop);
  }

  // Holes (a fully-enclosed unmerged cell, say) come out wound the
  // opposite way from the outer loop for free — nothing extra to do here,
  // as long as the caller fills with the `evenodd` rule (see `LayoutCell`).
  return loops.map(pathFromLoop).join(" ");
}

/** Drops every point along a closed `loop` that doesn't actually turn a
 * corner (i.e. is collinear with its neighbours — the raster in
 * `tracePolygon` walks one elementary cell at a time, so a straight run
 * of several is chopped into that many collinear points), then emits the
 * remaining corners as one SVG subpath — `H`/`V` throughout, since every
 * kept edge is axis-aligned. */
function pathFromLoop(loop: Point[]): string {
  const n = loop.length;
  const dir = (a: Point, b: Point) => (near(a.y, b.y) ? "H" : "V");
  const corners = loop.filter((point, i) => {
    const prev = loop[(i - 1 + n) % n];
    const next = loop[(i + 1) % n];
    return dir(prev, point) !== dir(point, next);
  });

  const [start, ...rest] = corners;
  let prev = start;
  const segments = rest.map((point) => {
    const segment = near(prev.y, point.y) ? `H${point.x}` : `V${point.y}`;
    prev = point;
    return segment;
  });
  return `M${start.x},${start.y} ${segments.join(" ")} Z`;
}

/**
 * The outline of a merged group, as an SVG path — a plain rectangle when
 * every member sits on the same row, a stepped/L shape (an ISO Enter key)
 * when they're stacked across rows with a different width each, or any
 * more irregular shape a less regular merge forms (see `tracePolygon`).
 * Members on the same row are first collapsed into that row's own runs of
 * *consecutive* members (`rowSpans`), each run's gaps absorbed so it reads
 * as one seamless keycap; a non-member cell sitting between two members
 * breaks the run rather than being bridged over.
 *
 * Two members stacked in physically adjacent rows meet the same way,
 * across the display's own row-to-row gap: whatever column range their runs
 * actually share is bridged, so the merge covers that strip too instead
 * of leaving a slit — a column only one of them occupies keeps its full
 * gap open, so the merge never bleeds into a neighbouring, unmerged
 * cell's own row or gap.
 *
 * Also returns `labelBounds` — where `LayoutCell` centres the cell's size
 * / type label, `largestSpan` of the group's own real spans rather than
 * the shape's bounding box (`bounds`), which a stepped or concave merge
 * can leave empty right at its centre.
 */
export function mergedOutline(
  group: number[],
  rows: number[][],
  cells: Record<number, GridCell>,
  unitMm: number,
  gapMm: number,
): { path: string; bounds: CellRect; labelBounds: CellRect } {
  const groupSet = new Set(group);
  const pitch = pitchMm(unitMm, gapMm);
  const rowIndexes = [...new Set(group.map((id) => rowOf(id, rows)))].sort(
    (a, b) => a - b,
  );

  const spansByRow = new Map<number, CellRect[]>(
    rowIndexes.map((row) => [
      row,
      rowSpans(rows[row] ?? [], groupSet, cells, unitMm, gapMm, row * pitch, unitMm),
    ]),
  );
  const spans = [...spansByRow.values()].flat();
  const rects = [...spans];

  for (let i = 0; i < rowIndexes.length - 1; i++) {
    const rowA = rowIndexes[i];
    const rowB = rowIndexes[i + 1];
    if (rowB !== rowA + 1) continue; // not physically adjacent — nothing to bridge
    const bridgeTop = rowA * pitch + unitMm;
    const bridgeBottom = rowB * pitch;
    for (const a of spansByRow.get(rowA) ?? []) {
      for (const b of spansByRow.get(rowB) ?? []) {
        const x = Math.max(a.x, b.x);
        const right = Math.min(a.x + a.width, b.x + b.width);
        if (right > x + OUTLINE_EPS) {
          rects.push({ x, y: bridgeTop, width: right - x, height: bridgeBottom - bridgeTop });
        }
      }
    }
  }

  return outlineOfRects(spans, rects);
}

/** A division's own rect within its parent cell's rect: `parentRect`
 * split into `divide.cols` × `divide.rows` equal shares, `id` row-major
 * (`row = Math.floor(id / cols)`, `col = id % cols`) — no gap between any
 * of them, unlike `layoutRow`'s ordinary same-row cells. */
export function divisionCellRect(
  id: number,
  divide: Pick<DivideGrid, "cols" | "rows">,
  parentRect: CellRect,
): CellRect {
  const width = parentRect.width / divide.cols;
  const height = parentRect.height / divide.rows;
  const col = id % divide.cols;
  const row = Math.floor(id / divide.cols);
  return {
    x: parentRect.x + col * width,
    y: parentRect.y + row * height,
    width,
    height,
  };
}

/** Whether any division of `groupA` shares an edge with any of `groupB`
 * — the condition for the two to be merge-able (mirrors `groupsShareEdge`,
 * just against a division grid's own uniform rects instead of a row's
 * cells). There's never a real gap to close between two divisions, so
 * unlike `groupsShareEdge` this always checks with `gapMm` 0. */
export function divisionsShareEdge(
  groupA: number[],
  groupB: number[],
  divide: Pick<DivideGrid, "cols" | "rows">,
  parentRect: CellRect,
): boolean {
  const rectOf = (id: number) => divisionCellRect(id, divide, parentRect);
  return groupA.some((a) => groupB.some((b) => shareEdge(rectOf(a), rectOf(b), 0)));
}

/**
 * The outline of a merged group of divisions — the same shape
 * `mergedOutline` returns for a merged group of ordinary cells (a plain
 * rectangle, a stepped shape, or anything else `tracePolygon` can trace)
 * — but over a division grid's own uniform, gap-less rects
 * (`divisionCellRect`) instead of a row's cells, so there's no
 * gap-bridging step needed: touching divisions already touch exactly,
 * with nothing between them left to close.
 */
export function divisionOutline(
  group: number[],
  divide: Pick<DivideGrid, "cols" | "rows">,
  parentRect: CellRect,
): { path: string; bounds: CellRect; labelBounds: CellRect } {
  const rects = group.map((id) => divisionCellRect(id, divide, parentRect));
  return outlineOfRects(rects, rects);
}
