import { expect, test } from "vitest";
import {
  addCellToRow,
  addMerge,
  adjacentSelection,
  canRemoveCell,
  cellRect,
  cellsAreContiguous,
  cellSizeMm,
  defaultLayout,
  divisionCellRect,
  divisionOutline,
  divisionsAreContiguous,
  divisionsShareEdge,
  gridRows,
  gridSizeMm,
  groupOf,
  groupsShareEdge,
  insertCellAfter,
  layoutRow,
  maxItems,
  maxUnitForCell,
  mergedOutline,
  nextCellId,
  pitchMm,
  primaryOf,
  remainingUnitsInRow,
  removeCellFromRow,
  removeMerge,
  rowOf,
  shareEdge,
} from "./layout";
import {
  createDivideGrid,
  defaultDivisionCell,
  defaultGridCell,
  type GridCell,
  type LayoutData,
} from "../types/layout";

const cellAt = (patch: Partial<GridCell> = {}) => ({
  ...defaultGridCell(),
  ...patch,
});

const layout = (id: number, name: string) => ({ id, name }) as LayoutData;

// The staple/bracket shape A-D-G-H-I-F traces around E (and B/C, both
// left untouched above D and F): full height on the left (A/D/G's
// column), the bottom row's full width, and F's column only from row 1
// down — see the "doesn't bleed into a cell left out of the merge" test.
const EXPECTED_STAPLE_PATH = "M0,0 H10 V26 H26 V13 H36 V36 H0 Z";

test("selects the default layout regardless of its position", () => {
  const result = defaultLayout([
    layout(1, "ISO"),
    layout(2, "Default"),
  ]);
  expect(result?.id).toBe(2);
});

test("falls back to the first layout", () => {
  expect(defaultLayout([layout(1, "ISO")])?.id).toBe(1);
  expect(defaultLayout([])).toBeUndefined();
});

test("pitch is the unit plus the gap", () => {
  expect(pitchMm(10, 2)).toBe(12);
  expect(pitchMm(19.05, 3)).toBeCloseTo(22.05);
});

test("maxItems fits as many items as the gap allows", () => {
  expect(maxItems(100, 10, 0)).toBe(10);
  expect(maxItems(94, 10, 2)).toBe(8);
  expect(maxItems(106, 10, 2)).toBe(9);
  expect(maxItems(216, 19.05, 3)).toBe(9);
  expect(maxItems(135, 19.05, 3)).toBe(6);
});

test("maxItems is zero when there is nothing to fit", () => {
  expect(maxItems(0, 10, 2)).toBe(0);
  expect(maxItems(100, 0, 0)).toBe(0);
});

test("gridSizeMm is the footprint maxItems fits within physicalMm", () => {
  const itemsX = maxItems(216, 19.05, 3);
  expect(gridSizeMm(itemsX, 19.05, 3)).toBe(itemsX * 19.05 + (itemsX - 1) * 3);
  expect(gridSizeMm(0, 19.05, 3)).toBe(0);
});

test("cellSizeMm sizes a cell by pitches, not a raw unitMm scale", () => {
  // unitMm is the keycap's own size, not its pitch (unitMm + gapMm) — a
  // 1.5U cell is 1.5 pitches minus the one trailing gap it doesn't need:
  // 1.5 * 13 - 3 = 16.5, not 1.5 * 10.
  expect(cellSizeMm(cellAt({ unit: 1.5 }), 10, 3)).toEqual({
    width: 16.5,
    height: 10,
  });
  // A plain 1U cell always comes back out to exactly unitMm — the pitch
  // it spans includes precisely the one gap being subtracted back out.
  expect(cellSizeMm(defaultGridCell(1), 19.05, 3)).toEqual({
    width: 19.05,
    height: 19.05,
  });
});

test("cellSizeMm's width matches a 16mm cap / 3mm gap keyboard's real key sizes", () => {
  // 1U = 16mm, 2U = 35mm, 6.25U = 115.75mm, 9U = 168mm — the pitch here
  // is 16 + 3 = 19mm.
  expect(cellSizeMm(cellAt({ unit: 1 }), 16, 3).width).toBe(16);
  expect(cellSizeMm(cellAt({ unit: 2 }), 16, 3).width).toBe(35);
  expect(cellSizeMm(cellAt({ unit: 6.25 }), 16, 3).width).toBeCloseTo(115.75);
  expect(cellSizeMm(cellAt({ unit: 9 }), 16, 3).width).toBe(168);
});

test("gridRows gives every row an empty cell list until told otherwise", () => {
  expect(gridRows(3, {})).toEqual([[], [], []]);
  expect(gridRows(2, { 1: [7, 8] })).toEqual([[], [7, 8]]);
});

test("rowOf finds which row holds a given cell id", () => {
  const rows = gridRows(2, { 0: [1, 2], 1: [3] });
  expect(rowOf(2, rows)).toBe(0);
  expect(rowOf(3, rows)).toBe(1);
  expect(rowOf(999, rows)).toBe(-1);
});

test("nextCellId is one past the highest id already in use, across every row", () => {
  expect(nextCellId(gridRows(2, { 0: [1, 2], 1: [50] }))).toBe(51);
  expect(nextCellId(gridRows(2, {}))).toBe(0);
  expect(nextCellId([])).toBe(0);
});

test("addCellToRow appends a fresh id to the target row only, and returns it", () => {
  const rows = gridRows(2, { 0: [1, 2] });
  const result = addCellToRow(rows, 0);
  expect(result.id).toBe(3);
  expect(result.rows[0]).toEqual([1, 2, 3]);
  expect(result.rows[1]).toEqual(rows[1]);
});

test("insertCellAfter puts a fresh id right after the given cell in its row, not at the end", () => {
  const rows = gridRows(2, { 0: [1, 2, 3] });
  const result = insertCellAfter(rows, 0, 1);
  expect(result.id).toBe(4);
  expect(result.rows[0]).toEqual([1, 4, 2, 3]);
  expect(result.rows[1]).toEqual(rows[1]);
});

test("insertCellAfter appends to the end if the given cell isn't actually in the row", () => {
  const rows = gridRows(1, { 0: [1, 2] });
  const result = insertCellAfter(rows, 0, 999);
  expect(result.rows[0]).toEqual([1, 2, result.id]);
});

test("canRemoveCell forbids removing a merged cell, but a row can go back to empty", () => {
  const rows = gridRows(1, { 0: [1] });
  expect(canRemoveCell(1, rows, [])).toBe(true); // the row's only cell — fine
  expect(canRemoveCell(1, rows, [[1, 2]])).toBe(false); // merged — unmerge first
  expect(canRemoveCell(99, rows, [])).toBe(false); // not in any row
});

test("removeCellFromRow removes only the given id, from only its own row", () => {
  const rows = gridRows(2, { 0: [1, 2], 1: [3] });
  const updated = removeCellFromRow(rows, 0, 1);
  expect(updated[0]).toEqual([2]);
  expect(updated[1]).toEqual(rows[1]);
});

test("layoutRow places cells left to right at their own configured Unit, flush at the row's own origin", () => {
  const cells: Record<number, GridCell> = {
    1: cellAt({ unit: 1.25 }),
    2: cellAt({ unit: 2 }),
  };
  const slots = layoutRow([1, 2], cells, 10, 3);
  // The row starts right at x=0 — any margin comes from centering the
  // whole grid as a block (`gridOffsetX` in `Display`), not from here.
  // Widths come from `cellSizeMm`'s pitch-based formula: pitch is 13
  // here, so 1.25U is 1.25*13-3=13.25 and 2U is 2*13-3=23.
  expect(slots[0]).toMatchObject({ id: 1, x: 0, width: 13.25 });
  expect(slots[1]).toMatchObject({ id: 2, x: 16.25, width: 23 });
});

test("layoutRow on an empty row returns no slots", () => {
  expect(layoutRow([], {}, 10, 3)).toEqual([]);
});

test("maxUnitForCell caps a cell at the row's raw-width budget minus every other cell in its row", () => {
  const rows = gridRows(1, { 0: [1, 2, 3] });
  const cells: Record<number, GridCell> = {
    1: cellAt({ unit: 2 }),
    2: cellAt({ unit: 3 }),
    3: cellAt({ unit: 1 }),
  };
  // A 90mm-wide screen at 10mm/Unit is a 9U budget; cells 1 and 2 already
  // use 5U, leaving cell 3 at most 4U. Zero gap here isolates the raw
  // budget math from the gap reservation covered separately below.
  expect(maxUnitForCell(3, rows, cells, 90, 10, 0)).toBe(4);
});

test("maxUnitForCell treats an empty row as having its full budget free", () => {
  const rows = gridRows(1, { 0: [1] });
  expect(maxUnitForCell(1, rows, {}, 90, 10, 0)).toBe(9); // no other cells yet
});

test("maxUnitForCell never goes negative even once the row is already over budget", () => {
  const rows = gridRows(1, { 0: [1, 2, 3] });
  const cells: Record<number, GridCell> = {
    1: cellAt({ unit: 5 }),
    2: cellAt({ unit: 5 }),
    3: cellAt({ unit: 1 }),
  };
  expect(maxUnitForCell(3, rows, cells, 90, 10, 0)).toBe(0);
});

test("maxUnitForCell's cap is a flat Unit budget, unaffected by how many cells or gaps share the row", () => {
  const unitMm = 19.05;
  const gapMm = 3;
  const physicalWidthMm = 216; // maxItems(216, 19.05, 3) === 9

  // A lone cell can use the full 9U — gaps don't eat into the budget.
  const soloRow = gridRows(1, { 0: [1] });
  expect(maxUnitForCell(1, soloRow, {}, physicalWidthMm, unitMm, gapMm)).toBe(9);

  // The same flat 9U cap holds regardless of cell count: 8 other 0.5U
  // cells (4U) leave a 9th cell exactly 5U, not some gap-shrunk number.
  const manyCellsRow = gridRows(1, { 0: [1, 2, 3, 4, 5, 6, 7, 8, 9] });
  const halfUnitCells: Record<number, GridCell> = Object.fromEntries(
    [1, 2, 3, 4, 5, 6, 7, 8].map((id) => [id, cellAt({ unit: 0.5 })]),
  );
  expect(
    maxUnitForCell(9, manyCellsRow, halfUnitCells, physicalWidthMm, unitMm, gapMm),
  ).toBe(5);
});

test("a row's Unit budget can be split however many ways, as long as it sums to the flat cap", () => {
  const unitMm = 19.05;
  const gapMm = 3;
  const physicalWidthMm = 216; // maxItems(216, 19.05, 3) === 9

  const asCells = (units: number[]) => {
    const ids = units.map((_, i) => i + 1);
    const cells: Record<number, GridCell> = Object.fromEntries(
      units.map((unit, i) => [ids[i], cellAt({ unit })]),
    );
    return { rows: gridRows(1, { 0: ids }), cells };
  };

  for (const units of [
    [9],
    Array(18).fill(0.5),
    Array(36).fill(0.25),
    [1, 2, 0.5, 2, 0.5, 3],
  ]) {
    const { rows, cells } = asCells(units);
    expect(
      remainingUnitsInRow(0, rows, cells, physicalWidthMm, unitMm, gapMm),
    ).toBe(0);
  }
});

test("remainingUnitsInRow is the row's budget minus whatever its cells already use", () => {
  const rows = gridRows(1, { 0: [1, 2] });
  const cells: Record<number, GridCell> = {
    1: cellAt({ unit: 2 }),
    2: cellAt({ unit: 3 }),
  };
  expect(remainingUnitsInRow(0, rows, cells, 90, 10, 0)).toBe(4);
});

test("remainingUnitsInRow is the full budget for a row with no cells, and never negative", () => {
  const rows = gridRows(1, {});
  expect(remainingUnitsInRow(0, rows, {}, 90, 10, 0)).toBe(9);
  const overBudget = gridRows(1, { 0: [1] });
  expect(
    remainingUnitsInRow(0, overBudget, { 1: cellAt({ unit: 20 }) }, 90, 10, 0),
  ).toBe(0);
});

test("remainingUnitsInRow never runs out from gaps alone — only the raw Unit sum counts against the budget", () => {
  const unitMm = 19.05;
  const gapMm = 3;
  const physicalWidthMm = 216; // the app's actual default screen width
  const ids = Array.from({ length: 30 }, (_, i) => i + 1);
  const cells: Record<number, GridCell> = Object.fromEntries(
    ids.map((id) => [id, cellAt({ unit: 0.25 })]),
  );
  const rows = gridRows(1, { 0: ids });
  // 30 * 0.25U = 7.5U raw, out of the row's flat 9U budget — 1.5U still
  // free for a 31st cell, however many gaps those 30 cells already need.
  expect(
    remainingUnitsInRow(0, rows, cells, physicalWidthMm, unitMm, gapMm),
  ).toBeCloseTo(1.5);
});

test("cellRect reads a cell's absolute rect off its own row's flow", () => {
  const rows = gridRows(2, { 0: [1], 1: [2] });
  const cells: Record<number, GridCell> = { 1: cellAt({ unit: 1.25 }) };
  const rect = cellRect(1, rows, cells, 10, 3);
  // x starts flush at the row's own origin — see `layoutRow`. Width is
  // 1.25 pitches (13mm) minus the trailing gap: 1.25*13-3=13.25.
  expect(rect).toEqual({ x: 0, y: 0, width: 13.25, height: 10 });
  // Row 1's own cell, untouched — MIN_UNIT (0.25U) by default: 0.25*13-3.
  const rowOneRect = cellRect(2, rows, cells, 10, 3);
  expect(rowOneRect.y).toBe(13);
  expect(rowOneRect.width).toBe(0.25);
});

test("groupOf returns a singleton for an unmerged cell", () => {
  expect(groupOf(5, [])).toEqual([5]);
  expect(groupOf(5, [[2, 3]])).toEqual([5]);
});

test("groupOf finds the group a merged cell belongs to", () => {
  expect(groupOf(3, [[2, 3, 4]])).toEqual([2, 3, 4]);
});

test("primaryOf is always the group's smallest index", () => {
  expect(primaryOf(5, [])).toBe(5);
  expect(primaryOf(4, [[2, 3, 4]])).toBe(2);
});

test("addMerge joins two singletons into one group", () => {
  expect(addMerge([], 2, 3)).toEqual([[2, 3]]);
});

test("addMerge extends an existing group and keeps unrelated groups untouched", () => {
  const groups = addMerge([[10, 11]], 2, 3);
  expect(addMerge(groups, 3, 4)).toEqual(
    expect.arrayContaining([[10, 11], [2, 3, 4]]),
  );
});

test("removeMerge splits a group back into standalone cells", () => {
  expect(removeMerge([[2, 3, 4]], 3)).toEqual([]);
  expect(removeMerge([[2, 3], [5, 6]], 3)).toEqual([[5, 6]]);
});

test("shareEdge is true for cells side by side on the same row", () => {
  const a = { x: 0, y: 0, width: 10, height: 10 };
  const b = { x: 13, y: 0, width: 10, height: 10 }; // 3mm gap
  expect(shareEdge(a, b, 3)).toBe(true);
  expect(shareEdge(b, a, 3)).toBe(true);
});

test("shareEdge is true for cells stacked across the row-to-row gap", () => {
  const top = { x: 0, y: 0, width: 10, height: 10 };
  const bottom = { x: 2, y: 13, width: 7, height: 10 }; // overlaps top's x-range
  expect(shareEdge(top, bottom, 3)).toBe(true);
});

test("shareEdge is false for cells that don't actually touch", () => {
  const a = { x: 0, y: 0, width: 10, height: 10 };
  const farRight = { x: 50, y: 0, width: 10, height: 10 };
  const nextRowNoOverlap = { x: 30, y: 13, width: 10, height: 10 };
  expect(shareEdge(a, farRight, 3)).toBe(false);
  expect(shareEdge(a, nextRowNoOverlap, 3)).toBe(false);
});

test("groupsShareEdge checks every pair of members across two groups", () => {
  // Base Unit 10mm, gap 3mm: cells 1 and 2 are adjacent on row 0, cell 3
  // is far enough right on the same row not to touch cell 1.
  const rows = gridRows(1, { 0: [1, 2, 3] });
  const cells: Record<number, GridCell> = {
    1: cellAt({ unit: 1 }),
    2: cellAt({ unit: 1 }),
    3: cellAt({ unit: 1 }),
  };
  expect(groupsShareEdge([1], [2], rows, cells, 10, 3)).toBe(true);
  expect(groupsShareEdge([1], [3], rows, cells, 10, 3)).toBe(false);
});

test("mergedOutline of same-row cells is a plain rectangle spanning both", () => {
  const rows = gridRows(1, { 0: [1, 2] });
  const cells: Record<number, GridCell> = {
    1: cellAt({ unit: 1 }),
    2: cellAt({ unit: 1 }),
  };
  const { path, bounds, labelBounds } = mergedOutline([1, 2], rows, cells, 10, 3);
  expect(bounds).toEqual({ x: 0, y: 0, width: 23, height: 10 });
  expect(path).toBe("M0,0 H23 V10 H0 Z");
  // A single row is already one span, so its label sits at plain centre.
  expect(labelBounds).toEqual(bounds);
});

test("mergedOutline of cells stacked across rows closes the gap and steps to each width", () => {
  const rows = gridRows(2, { 0: [1], 1: [2] });
  const cells: Record<number, GridCell> = {
    1: cellAt({ unit: 1 }),
    2: cellAt({ unit: 0.75 }),
  };
  const { path, bounds, labelBounds } = mergedOutline([1, 2], rows, cells, 10, 3);
  // Row 1's 0.75U cell is 0.75*13-3=6.75mm (pitch-based, see `cellSizeMm`).
  // Row 0 is wider on the right (10 vs 6.75): the step lands on row 0's
  // own true bottom (y=10), and row 1's right edge bridges the *entire*
  // gap (10 to 13) to reach it — the gap is never split between the two,
  // and the untouched column (6.75 to 10) keeps its full gap open.
  expect(bounds).toEqual({ x: 0, y: 0, width: 10, height: 23 });
  expect(path).toBe("M0,0 H10 V10 H6.75 V23 H0 Z");
  // `bounds`' own centre (5, 11.5) sits in the thin row-to-row bridge
  // strip, not on either cell's own real surface — the label instead
  // anchors on row 0's cell, the bigger of the two real spans.
  expect(labelBounds).toEqual({ x: 0, y: 0, width: 10, height: 10 });
});

test("mergedOutline doesn't bleed into a cell left out of the merge", () => {
  // A 3x3 grid, merging every cell except the centre one (E):
  //   A B C        A . .
  //   D E F   ->   D . F
  //   G H I        G H I
  // B and C are untouched too, so the merge's own shape wraps around E on
  // three sides but stays open on E's fourth (top) side, where B sits.
  const rows = gridRows(3, {
    0: [1, 2, 3], // A B C
    1: [4, 5, 6], // D E F
    2: [7, 8, 9], // G H I
  });
  const cells: Record<number, GridCell> = Object.fromEntries(
    [1, 2, 3, 4, 5, 6, 7, 8, 9].map((id) => [id, cellAt({ unit: 1 })]),
  );
  const group = [1, 4, 6, 7, 8, 9]; // A D F G H I — E, B, C left out

  const { path, bounds, labelBounds } = mergedOutline(group, rows, cells, 10, 3);

  // The merge's bounding box still spans the full 3x3 footprint, and its
  // centre (18, 18) is exactly E's own centre — the label instead anchors
  // on the bottom row (G/H/I), the biggest of the merge's own real spans.
  expect(bounds).toEqual({ x: 0, y: 0, width: 36, height: 36 });
  expect(labelBounds).toEqual({ x: 0, y: 26, width: 36, height: 10 });
  // ...but E's own rect (x13-23, y13-23) must stay outside the traced
  // shape: none of its four corners are covered by the merge.
  const outside = [
    [13, 13],
    [23, 13],
    [13, 23],
    [23, 23],
  ];
  for (const [x, y] of outside) {
    expect(path).not.toContain(`${x},${y}`);
  }
  // The path traces one closed loop wrapping A/D/G/H/I/F around E and B/C
  // without ever bridging over them.
  expect(path).toBe(EXPECTED_STAPLE_PATH);
});

test("divisionCellRect splits the parent rect into equal, gap-less shares", () => {
  const parent = { x: 10, y: 20, width: 40, height: 20 };
  const divide = { cols: 4, rows: 2 };
  // Row-major: id 0 is the top-left division, id 3 the top-right, id 4
  // the bottom-left, id 7 the bottom-right.
  expect(divisionCellRect(0, divide, parent)).toEqual({
    x: 10,
    y: 20,
    width: 10,
    height: 10,
  });
  expect(divisionCellRect(3, divide, parent)).toEqual({
    x: 40,
    y: 20,
    width: 10,
    height: 10,
  });
  expect(divisionCellRect(4, divide, parent)).toEqual({
    x: 10,
    y: 30,
    width: 10,
    height: 10,
  });
  // Adjacent divisions touch exactly — no gap, unlike an ordinary row.
  const right = divisionCellRect(0, divide, parent).x + divisionCellRect(0, divide, parent).width;
  expect(right).toBe(divisionCellRect(1, divide, parent).x);
});

test("divisionsShareEdge is true for side-by-side divisions, false for diagonal ones", () => {
  const parent = { x: 0, y: 0, width: 40, height: 20 };
  const divide = { cols: 4, rows: 2 };
  expect(divisionsShareEdge([0], [1], divide, parent)).toBe(true);
  expect(divisionsShareEdge([0], [4], divide, parent)).toBe(true);
  expect(divisionsShareEdge([0], [5], divide, parent)).toBe(false);
  expect(divisionsShareEdge([0], [3], divide, parent)).toBe(false);
});

test("divisionOutline of a merged 2x1 pair of divisions is one seamless rectangle", () => {
  const parent = { x: 0, y: 0, width: 40, height: 20 };
  const divide = { cols: 4, rows: 2 };
  const { path, bounds, labelBounds } = divisionOutline([0, 1], divide, parent);
  // No gap between id 0 (x0-10) and id 1 (x10-20) — the outline reads as
  // one plain rectangle, not two with a slit down the middle.
  expect(bounds).toEqual({ x: 0, y: 0, width: 20, height: 10 });
  expect(path).toBe("M0,0 H20 V10 H0 Z");
  // The two divisions add up to the entire bounding box — a plain, solid
  // rectangle with nothing for a merge to bleed into — so the label
  // anchors on the *whole* merged shape, not arbitrarily on just one of
  // the two equal-sized (and so tied-for-"largest") divisions.
  expect(labelBounds).toEqual(bounds);
});

test("divisionOutline's labelBounds still dodges a notch for an irregular (non-rectangular) merge", () => {
  // A 2x2 division grid, merged as an L: ids 0, 1, 2 (leaving 3 out) —
  //   0 1
  //   2 .
  const parent = { x: 0, y: 0, width: 20, height: 20 };
  const divide = { cols: 2, rows: 2 };
  const { bounds, labelBounds } = divisionOutline([0, 1, 2], divide, parent);
  // The bounding box still covers all 4 quadrants (including the
  // untouched id 3), but the merge itself doesn't — so its centre isn't
  // solid, and `labelBounds` must fall back to one of the merge's own
  // (equal-sized) spans rather than that unfilled centre.
  expect(bounds).toEqual({ x: 0, y: 0, width: 20, height: 20 });
  expect(labelBounds).not.toEqual(bounds);
  expect(labelBounds).toEqual({ x: 0, y: 0, width: 10, height: 10 });
});

test("cellsAreContiguous is true for a connected set, false when one member is isolated", () => {
  const rows = gridRows(1, { 0: [1, 2, 3] });
  const cells: Record<number, GridCell> = {
    1: cellAt({ unit: 1 }),
    2: cellAt({ unit: 1 }),
    3: cellAt({ unit: 1 }),
  };
  const rectOf = (id: number) => cellRect(id, rows, cells, 10, 3);
  expect(cellsAreContiguous([1, 2, 3], rectOf, 3)).toBe(true);
  expect(cellsAreContiguous([1, 3], rectOf, 3)).toBe(false);
  expect(cellsAreContiguous([2], rectOf, 3)).toBe(true);
  expect(cellsAreContiguous([], rectOf, 3)).toBe(true);
});

test("cellsAreContiguous chains connectivity through an intermediate member", () => {
  // 1-2-3 in a row: {1, 3} alone aren't touching, but the full {1, 2, 3}
  // set is one connected chain even though 1 and 3 never touch directly.
  const rows = gridRows(1, { 0: [1, 2, 3] });
  const cells: Record<number, GridCell> = {
    1: cellAt({ unit: 1 }),
    2: cellAt({ unit: 1 }),
    3: cellAt({ unit: 1 }),
  };
  const rectOf = (id: number) => cellRect(id, rows, cells, 10, 3);
  expect(cellsAreContiguous([1, 2, 3], rectOf, 3)).toBe(true);
});

test("divisionsAreContiguous checks the division grid's own row/column adjacency", () => {
  // A 3x2 grid (cols=3, rows=2):
  //   0 1 2
  //   3 4 5
  expect(divisionsAreContiguous([0, 1, 2], 3)).toBe(true); // full top row
  expect(divisionsAreContiguous([0, 3], 3)).toBe(true); // stacked, same column
  expect(divisionsAreContiguous([0, 2], 3)).toBe(false); // same row, not adjacent
  expect(divisionsAreContiguous([0, 4], 3)).toBe(false); // diagonal
  expect(divisionsAreContiguous([0, 1, 4], 3)).toBe(true); // 0-1 adjacent, 1-4 adjacent
});

test("adjacentSelection walks a row's cells left and right, and stops at the display's ends", () => {
  const rows = gridRows(2, { 0: [1, 2], 1: [3] });
  const cells: Record<number, GridCell> = {
    1: cellAt({ unit: 1 }),
    2: cellAt({ unit: 1 }),
    3: cellAt({ unit: 1 }),
  };
  const at = (from: number, direction: -1 | 1) =>
    adjacentSelection({ kind: "cell", id: from }, direction, rows, cells, []);

  expect(at(1, 1)).toEqual({ kind: "cell", id: 2 });
  expect(at(2, -1)).toEqual({ kind: "cell", id: 1 });
  // Past a row's last cell comes the next row's first one, not a dead end.
  expect(at(2, 1)).toEqual({ kind: "cell", id: 3 });
  expect(at(3, -1)).toEqual({ kind: "cell", id: 2 });
  // The very first/last cell of the display has nowhere left to go.
  expect(at(1, -1)).toBeNull();
  expect(at(3, 1)).toBeNull();
});

test("adjacentSelection treats a merged group as the single cell it's shown as", () => {
  const rows = gridRows(1, { 0: [1, 2, 3] });
  const cells: Record<number, GridCell> = {
    1: cellAt({ unit: 1 }),
    2: cellAt({ unit: 1 }),
    3: cellAt({ unit: 1 }),
  };
  const merged = addMerge([], 1, 2);
  // Right off the group lands past *both* its members, and coming back
  // lands on the group's primary — the id a selection ever carries.
  expect(
    adjacentSelection({ kind: "cell", id: 1 }, 1, rows, cells, merged),
  ).toEqual({ kind: "cell", id: 3 });
  expect(
    adjacentSelection({ kind: "cell", id: 3 }, -1, rows, cells, merged),
  ).toEqual({ kind: "cell", id: 1 });
});

test("adjacentSelection reaches every division of a divided cell, row after row", () => {
  const rows = gridRows(1, { 0: [1, 2] });
  const cells: Record<number, GridCell> = {
    // The "Divide" layout's own shape: one column, two rows — the bottom
    // division is only ever reachable by wrapping past the top one's row.
    1: cellAt({ unit: 1, divide: createDivideGrid(1, 2, defaultDivisionCell()) }),
    2: cellAt({ unit: 1, divide: createDivideGrid(1, 2, defaultDivisionCell()) }),
  };
  const at = (parentId: number, subId: number, direction: -1 | 1) =>
    adjacentSelection(
      { kind: "division", parentId, subId },
      direction,
      rows,
      cells,
      [],
    );

  expect(at(1, 0, 1)).toEqual({ kind: "division", parentId: 1, subId: 1 });
  expect(at(1, 1, 1)).toEqual({ kind: "division", parentId: 2, subId: 0 });
  expect(at(2, 0, 1)).toEqual({ kind: "division", parentId: 2, subId: 1 });
  expect(at(2, 1, 1)).toBeNull();
  expect(at(2, 0, -1)).toEqual({ kind: "division", parentId: 1, subId: 1 });
  expect(at(1, 0, -1)).toBeNull();
});

test("adjacentSelection skips a merged division's other members, like a merged cell's", () => {
  const divide = createDivideGrid(3, 1, defaultDivisionCell());
  const rows = gridRows(1, { 0: [1] });
  const cells: Record<number, GridCell> = {
    1: cellAt({ unit: 1, divide: { ...divide, mergeGroups: addMerge([], 0, 1) } }),
  };
  expect(
    adjacentSelection({ kind: "division", parentId: 1, subId: 0 }, 1, rows, cells, []),
  ).toEqual({ kind: "division", parentId: 1, subId: 2 });
  expect(
    adjacentSelection({ kind: "division", parentId: 1, subId: 2 }, -1, rows, cells, []),
  ).toEqual({ kind: "division", parentId: 1, subId: 0 });
});

test("adjacentSelection enters a divided cell at the end it arrives from", () => {
  const rows = gridRows(1, { 0: [1, 2, 3] });
  const cells: Record<number, GridCell> = {
    1: cellAt({ unit: 1 }),
    // 2x2:
    //   0 1
    //   2 3
    2: cellAt({ unit: 1, divide: createDivideGrid(2, 2, defaultDivisionCell()) }),
    3: cellAt({ unit: 1 }),
  };
  expect(
    adjacentSelection({ kind: "cell", id: 1 }, 1, rows, cells, []),
  ).toEqual({ kind: "division", parentId: 2, subId: 0 });
  expect(
    adjacentSelection({ kind: "cell", id: 3 }, -1, rows, cells, []),
  ).toEqual({ kind: "division", parentId: 2, subId: 3 });
  // A divided cell selected as a whole (a drag can leave it that way)
  // steps into its own divisions rather than going nowhere.
  expect(
    adjacentSelection({ kind: "cell", id: 2 }, 1, rows, cells, []),
  ).toEqual({ kind: "division", parentId: 2, subId: 0 });
});

test("adjacentSelection skips whatever isNavigable rules out — Mapping's own Space cells", () => {
  const rows = gridRows(1, { 0: [1, 2, 3, 4] });
  const cells: Record<number, GridCell> = {
    1: cellAt({ unit: 1, typeId: "kbrd.layout-key" }),
    2: cellAt({ unit: 1, typeId: "kbrd.layout-space" }),
    // A divided cell with nothing but Space in it is skipped whole.
    3: cellAt({
      unit: 1,
      divide: createDivideGrid(2, 1, { ...defaultDivisionCell(), typeId: "kbrd.layout-space" }),
    }),
    4: cellAt({ unit: 1, typeId: "kbrd.layout-key" }),
  };
  const isKey = (typeId: string | null | undefined) => typeId === "kbrd.layout-key";
  expect(
    adjacentSelection({ kind: "cell", id: 1 }, 1, rows, cells, [], isKey),
  ).toEqual({ kind: "cell", id: 4 });
  expect(
    adjacentSelection({ kind: "cell", id: 4 }, -1, rows, cells, [], isKey),
  ).toEqual({ kind: "cell", id: 1 });
  // Same cells, no rule: every one of them is a stop again.
  expect(
    adjacentSelection({ kind: "cell", id: 1 }, 1, rows, cells, []),
  ).toEqual({ kind: "cell", id: 2 });
});
