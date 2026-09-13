import { useRef, useState } from "react";

import {
  createDivideGrid,
  defaultDivisionCell,
  defaultGridCell,
} from "../types/layout";
import type {
  DivisionCell,
  FactoryLayout,
  GridCell,
  LayoutSettings,
  MergeGroups,
} from "../types/layout";
import {
  addCellToRow,
  addMerge,
  adjacentSelection,
  canRemoveCell,
  cellRect,
  cellsAreContiguous,
  divisionsAreContiguous,
  gridRows,
  groupOf,
  maxUnitForCell,
  remainingUnitsInRow,
  removeCellFromRow,
  removeMerge,
  rowOf,
} from "../utils/layout";
import { randomId } from "../utils/id";

/**
 * `<Display>`'s own grid state — `cells`/`rowOverrides`/`mergeGroups` and
 * every currently-selected cell/division/row/display — plus every
 * operation that reads or writes them (merge/divide/delete/copy/paste,
 * moving or resizing a cell, selecting one thing or another). Selection
 * lives here rather than in its own hook because so much of the logic
 * below reads *and* writes both in the same stroke — merging a
 * multi-selection, say, both folds cells into `mergeGroups` and collapses
 * the selection down to the merged group's own primary — so splitting the
 * two apart would mostly just move the coupling into extra parameters
 * instead of removing it.
 *
 * See `App`'s own comments (now moved here) for the reasoning behind each
 * piece; `App` itself just calls this once, feeds `<Display>`/`<Inspector>`
 * off what it returns, and wires a few of its own concerns on top
 * (`changeLayout`/`changeLayer` call `loadFactoryLayout`, `useUndoHistory`
 * reads `cells`/`rowOverrides`/`mergeGroups`/`skipAutosaveRef` from here).
 */
export function useDisplayGrid(params: {
  layoutSettings: LayoutSettings;
  // Already clamped to the current layout's own Max height (1U) override
  // and whatever the physical display actually fits — see `App`'s
  // `gridItemsY`.
  gridItemsY: number;
}) {
  const { layoutSettings, gridItemsY } = params;

  const [cells, setCells] = useState<Record<number, GridCell>>({});
  const [rowOverrides, setRowOverrides] = useState<Record<number, number[]>>(
    {},
  );
  const [mergeGroups, setMergeGroups] = useState<MergeGroups>([]);
  const [selectedCellIndices, setSelectedCellIndices] = useState<number[]>(
    [],
  );
  const [selectedEmptyRow, setSelectedEmptyRow] = useState<number | null>(
    null,
  );
  const [selectedDivisionIndices, setSelectedDivisionIndices] = useState<
    number[]
  >([]);
  const [displaySelected, setDisplaySelected] = useState(false);
  // The last cell copied from the Actions menu (or Cmd/Ctrl+C) — "Paste"
  // is disabled until this is set, and applies its type/config/pluginIds
  // onto whichever cell/division is selected at the time. `sourceId` is
  // the cell it was copied *from* — see `pasteToEmptyRow`, which routes
  // pasting back onto that exact cell differently (into its row's own
  // remaining space) than onto any other cell (overwriting it in place).
  const [copiedCell, setCopiedCell] = useState<
    (Pick<GridCell, "typeId" | "typeConfig" | "pluginIds" | "unit"> & {
      sourceId: number;
    })
    | null
  >(null);
  // A Paste, or dropping a Layout plugin (Key/Space), that would overwrite
  // a cell/division that isn't blank waits here for confirmation (see
  // `Confirmation` in `Composer`) instead of applying right away —
  // `pasteToEmptyRow`/`assignLayoutPlugin`/`assignLayoutPluginToDivision`
  // set this instead of mutating whenever their target already has
  // content that dropping the same kind again wouldn't (a no-op, see
  // `assignLayoutPlugin`).
  const [pendingOverwrite, setPendingOverwrite] = useState<
    | {
        source: "paste";
        // Every target this paste would overwrite — more than one once a
        // multi-selection is the paste target (see `pasteToEmptyRow`); a
        // single Confirmation still covers the whole batch.
        targets: (
          | { kind: "cell"; id: number }
          | { kind: "division"; parentId: number; subId: number }
        )[];
      }
    | {
        source: "layout-plugin";
        target: { kind: "cell"; id: number } | { kind: "division"; parentId: number; subId: number };
        pluginId: string;
        defaultConfig: Record<string, unknown>;
      }
    | null
  >(null);
  // Backspace, or the context menu's "Delete", on the current cell/division
  // selection waits here for confirmation (`Composer`'s own `Confirmation`)
  // instead of deleting right away — mirrors `pendingOverwrite` above.
  const [pendingDelete, setPendingDelete] = useState<
    { kind: "cells" | "divisions" } | null
  >(null);
  // Sidesteps `useUndoHistory`'s own push effect, and the autosave-to-
  // server effect in `App`, for the run right after `loadFactoryLayout`
  // seeds this state from a layer's own saved `factory_layout` (or resets
  // it for a fresh layout) — that change is a load, not an edit to record
  // or save back.
  const skipAutosaveRef = useRef(true);

  const rows = gridRows(gridItemsY, rowOverrides);

  // The display (the physical screen) and a grid cell are mutually
  // exclusive selections — each shows its own context menu.
  function selectDisplay() {
    setDisplaySelected(true);
    setSelectedCellIndices([]);
    setSelectedDivisionIndices([]);
    setSelectedEmptyRow(null);
  }

  // A plain click on a cell — replaces the whole selection with just
  // this one, or clears it if this was already the sole selection (a
  // toggle-off, same as before multi-select existed). Cmd/Ctrl+click
  // (`toggleCellSelection`) is the only way to select more than one.
  function selectCell(index: number | null) {
    setSelectedCellIndices((current) =>
      index === null
        ? []
        : current.length === 1 && current[0] === index
          ? []
          : [index],
    );
    setSelectedDivisionIndices([]);
    setSelectedEmptyRow(null);
    setDisplaySelected(false);
  }

  // "This is the selection now", with none of `selectCell`'s own
  // click-to-toggle: a drop — or a drag on its way to one — is never a
  // request to deselect whatever it lands on, which is exactly what
  // `selectCell` would do to a cell that already was the selection.
  function focusCell(index: number) {
    setSelectedCellIndices([index]);
    setSelectedDivisionIndices([]);
    setSelectedEmptyRow(null);
    setDisplaySelected(false);
  }

  /** `focusCell` for one division of a divided cell. */
  function focusDivision(ref: { parentId: number; subId: number }) {
    setSelectedCellIndices([ref.parentId]);
    setSelectedDivisionIndices([ref.subId]);
    setSelectedEmptyRow(null);
    setDisplaySelected(false);
  }

  // Cmd/Ctrl+click on a cell — toggles `index` in or out of the current
  // multi-selection, unless the previous selection was of a different
  // kind entirely (a division, empty space, the display), in which case it
  // just starts a fresh one-cell selection instead, the same as a plain
  // click would.
  function toggleCellSelection(index: number) {
    const inCellSelectionMode =
      !displaySelected &&
      selectedEmptyRow === null &&
      selectedDivisionIndices.length === 0;
    setSelectedCellIndices((current) => {
      if (!inCellSelectionMode) return [index];
      return current.includes(index)
        ? current.filter((id) => id !== index)
        : [...current, index];
    });
    setSelectedDivisionIndices([]);
    setSelectedEmptyRow(null);
    setDisplaySelected(false);
  }

  // A division of `parentId`'s own divided cell — see `GridCell.divide`
  // — selected instead of the divided cell as a whole; mutually exclusive
  // with every other selection, same as `selectCell`. A plain click on a
  // division always focuses its parent as the sole cell selection (there
  // being no sense in which the parent, as a whole, is "also" selected
  // once you're looking at one specific division of it).
  function selectDivision(ref: { parentId: number; subId: number }) {
    setSelectedCellIndices([ref.parentId]);
    setSelectedDivisionIndices((current) =>
      current.length === 1 && current[0] === ref.subId ? [] : [ref.subId],
    );
    setSelectedEmptyRow(null);
    setDisplaySelected(false);
  }

  // Cmd/Ctrl+click on a division — toggles `ref.subId` in or out of the
  // current division multi-selection, as long as it's still the same
  // parent already focused; a different parent (or no division focus at
  // all yet) just starts fresh, same as a plain click would.
  function toggleDivisionSelection(ref: { parentId: number; subId: number }) {
    const sameParentFocused =
      selectedCellIndices.length === 1 &&
      selectedCellIndices[0] === ref.parentId;
    setSelectedCellIndices([ref.parentId]);
    setSelectedDivisionIndices((current) => {
      if (!sameParentFocused) return [ref.subId];
      return current.includes(ref.subId)
        ? current.filter((id) => id !== ref.subId)
        : [...current, ref.subId];
    });
    setSelectedEmptyRow(null);
    setDisplaySelected(false);
  }

  // A row's empty space, selected (instead of a cell) so a copied plugin
  // can be pasted straight onto it — see `emptySelection`/`pasteToEmptyRow`.
  function selectEmptyRow(row: number) {
    setSelectedEmptyRow(row);
    setSelectedCellIndices([]);
    setSelectedDivisionIndices([]);
    setDisplaySelected(false);
  }

  // Clears just the cell/division/row selection — what `undo` resets,
  // since a disposition it just stepped back to may no longer make sense
  // for whatever was selected (a selected cell the undone edit removed,
  // say). Leaves `displaySelected` alone — unlike `loadFactoryLayout`
  // below, undo never touches the display's own selection.
  function clearCellSelection() {
    setSelectedCellIndices([]);
    setSelectedDivisionIndices([]);
    setSelectedEmptyRow(null);
  }

  // Every selection at once, `displaySelected` included — unlike
  // `clearCellSelection` above. Used when switching between Layout and
  // Layer mode, since a selection made in one mode has no meaning in
  // the other (their content is isolated, only geometry is shared).
  function clearSelection() {
    setSelectedCellIndices([]);
    setSelectedDivisionIndices([]);
    setSelectedEmptyRow(null);
    setDisplaySelected(false);
  }

  // Seeds `cells`/`rowOverrides`/`mergeGroups` from a layer's own saved
  // `factory_layout` (or resets them for a fresh layout/layer — `null`),
  // clears every selection, and marks the very next run of
  // `useUndoHistory`'s push effect and `App`'s own autosave-to-server
  // effect as "just a load, not an edit" — see `changeLayout`/`changeLayer`
  // in `App`, the only two callers.
  function loadFactoryLayout(factoryLayout: FactoryLayout | null) {
    setCells(factoryLayout?.cells ?? {});
    setRowOverrides(factoryLayout?.rowOverrides ?? {});
    setMergeGroups(factoryLayout?.mergeGroups ?? []);
    setSelectedCellIndices([]);
    setSelectedDivisionIndices([]);
    setSelectedEmptyRow(null);
    setDisplaySelected(false);
    setPendingOverwrite(null);
    skipAutosaveRef.current = true;
  }

  function changeCell(index: number, patch: Partial<GridCell>) {
    setCells((current) => ({
      ...current,
      [index]: { ...(current[index] ?? defaultGridCell()), ...patch },
    }));
  }

  // Same idea as `changeCell`, for one division of a divided cell (see
  // `GridCell.divide`) instead of a top-level one.
  function changeDivisionCell(
    parentId: number,
    subId: number,
    patch: Partial<DivisionCell>,
  ) {
    setCells((current) => {
      const parent = current[parentId];
      if (!parent?.divide) return current;
      const existing = parent.divide.cells[subId] ?? defaultDivisionCell();
      return {
        ...current,
        [parentId]: {
          ...parent,
          divide: {
            ...parent.divide,
            cells: {
              ...parent.divide.cells,
              [subId]: { ...existing, ...patch },
            },
          },
        },
      };
    });
  }

  // Drops a freshly-typed cell onto the end of `row`'s empty space — see
  // `Display`'s trailing drop target. Generates the new cell's id and
  // selects it in the same stroke.
  function createCell(row: number, cell: GridCell) {
    const { rows: updatedRows, id } = addCellToRow(rows, row);
    setRowOverrides((current) => ({ ...current, [row]: updatedRows[row] }));
    setCells((current) => ({ ...current, [id]: cell }));
    setSelectedCellIndices([id]);
    setSelectedEmptyRow(null);
  }

  // Drags `id` (a plain, unmerged cell — `Display` only ever lets one of
  // those be dragged in the first place) out of its row and back in
  // right before `beforeId` (`null` for the row's own end) — the same
  // row, to reorder it, or a different one entirely. No-ops if it
  // doesn't actually fit there: built the row it would land in as if the
  // move had already happened, then reused `maxUnitForCell`'s own
  // budget math (the same check a resize already goes through) against
  // that, rather than a fresh one of its own.
  function moveCell(id: number, targetRow: number, beforeId: number | null) {
    const sourceRow = rowOf(id, rows);
    const cell = cells[id];
    if (sourceRow === -1 || !cell || groupOf(id, mergeGroups).length > 1) {
      return;
    }

    const withoutSource = rows.map((cellIds, row) =>
      row === sourceRow ? cellIds.filter((cellId) => cellId !== id) : cellIds,
    );
    const targetCellIds = withoutSource[targetRow] ?? [];
    const insertAt = beforeId !== null ? targetCellIds.indexOf(beforeId) : -1;
    const nextTargetCellIds =
      insertAt === -1
        ? [...targetCellIds, id]
        : [
            ...targetCellIds.slice(0, insertAt),
            id,
            ...targetCellIds.slice(insertAt),
          ];
    const nextRows = withoutSource.map((cellIds, row) =>
      row === targetRow ? nextTargetCellIds : cellIds,
    );

    const cap = maxUnitForCell(
      id,
      nextRows,
      cells,
      layoutSettings.physicalWidthMm,
      layoutSettings.unitMm,
      layoutSettings.gapMm,
    );
    if (cell.unit > cap) return;

    setRowOverrides((current) => ({
      ...current,
      [sourceRow]: nextRows[sourceRow],
      [targetRow]: nextRows[targetRow],
    }));
  }

  // Removes `index` from its row entirely — "Remove cell" in the Actions
  // menu. No-ops (see `canRemoveCell`) rather than pulling a member out
  // from under a merge; unlike a cell's Unit, a row's cell count has no
  // floor, so this can empty a row back out.
  function removeCell(index: number) {
    const row = rowOf(index, rows);
    if (row === -1 || !canRemoveCell(index, rows, mergeGroups)) return;
    setRowOverrides((current) => ({
      ...current,
      [row]: removeCellFromRow(rows, row, index)[row],
    }));
    setCells((current) => {
      const rest = { ...current };
      delete rest[index];
      return rest;
    });
    setSelectedCellIndices((current) => current.filter((id) => id !== index));
  }

  // The single selected top-level cell — `null`, not just for an empty
  // selection, but also whenever more than one is selected: there's no
  // single "the" cell for Properties/Divide to act on then (see the
  // context menu instead, keyed off `selectedCellIndices` directly for
  // its own multi-select branches).
  const selectedCellIndex =
    selectedCellIndices.length === 1 ? selectedCellIndices[0] : null;
  const selectedCell =
    selectedCellIndex !== null ? cells[selectedCellIndex] : undefined;
  const layoutSelection =
    selectedCellIndex !== null && selectedCell
      ? {
          index: selectedCellIndex,
          cell: selectedCell,
          isMerged: groupOf(selectedCellIndex, mergeGroups).length > 1,
          canRemove: canRemoveCell(selectedCellIndex, rows, mergeGroups),
        }
      : null;

  // Whether every currently-selected top-level cell is reachable from
  // every other by a chain of shared edges — the condition for "Merge" to
  // show up on multiple selected cells (see `mergeSelectedCells`); a
  // multi-selection that isn't only ever offers Delete.
  const isCellSelectionContiguous =
    selectedCellIndices.length > 1 &&
    cellsAreContiguous(
      selectedCellIndices,
      (id) =>
        cellRect(
          id,
          rows,
          cells,
          layoutSettings.unitMm,
          layoutSettings.gapMm,
        ),
      layoutSettings.gapMm,
    );

  // Which divisions of `selectedCellIndex`'s own divided cell (see
  // `GridCell.divide`) are the real focus, instead of that cell as a
  // whole — takes priority over `layoutSelection` wherever both could
  // apply (the Properties tab, the context menu) since `Display` only
  // ever routes a click within a divided cell's own area to one of its
  // divisions (see `selectDivision`), never to the divided cell as a
  // whole. `null` unless exactly one division is selected — same
  // reasoning as `layoutSelection` above, and for the same reason
  // (Properties has one cell's worth of fields to show).
  const selectedDivisionId =
    selectedDivisionIndices.length === 1 ? selectedDivisionIndices[0] : null;
  const divisionSelection =
    selectedCellIndex !== null &&
    selectedCell?.divide &&
    selectedDivisionId !== null
      ? {
          parentId: selectedCellIndex,
          subId: selectedDivisionId,
          cell:
            selectedCell.divide.cells[selectedDivisionId] ??
            defaultDivisionCell(),
          isMerged:
            groupOf(selectedDivisionId, selectedCell.divide.mergeGroups)
              .length > 1,
        }
      : null;

  // Same idea as `isCellSelectionContiguous`, scoped to the selected
  // cell's own division grid — plain row/column adjacency there (see
  // `divisionsAreContiguous`), not real rects.
  const isDivisionSelectionContiguous =
    selectedCellIndex !== null &&
    selectedCell?.divide != null &&
    selectedDivisionIndices.length > 1 &&
    divisionsAreContiguous(selectedDivisionIndices, selectedCell.divide.cols);

  // Which row a *fresh* pasted cell would land in: the selected empty
  // row, or — so Copy then Paste round-trips straight onto the same
  // cell's own row without an extra click to explicitly select its
  // trailing space first — the selected cell's own row, but only if it's
  // the exact cell just copied (see `copiedCell.sourceId`); pasting onto
  // any *other* cell overwrites it directly instead (see `canPaste`
  // below), rather than falling back to its row. `-1` means neither
  // applies right now.
  const pasteTargetRow =
    selectedEmptyRow !== null
      ? selectedEmptyRow
      : selectedCellIndex !== null &&
          selectedDivisionIndices.length === 0 &&
          copiedCell !== null &&
          selectedCellIndex === copiedCell.sourceId
        ? rowOf(selectedCellIndex, rows)
        : -1;
  // Whether the copied cell still fits in `pasteTargetRow`'s remaining
  // Unit budget.
  const rowHasRoomForPaste =
    pasteTargetRow !== -1 &&
    copiedCell !== null &&
    copiedCell.unit <=
      remainingUnitsInRow(
        pasteTargetRow,
        rows,
        cells,
        layoutSettings.physicalWidthMm,
        layoutSettings.unitMm,
        layoutSettings.gapMm,
      );

  const emptySelection =
    selectedEmptyRow !== null
      ? { row: selectedEmptyRow, canPaste: rowHasRoomForPaste }
      : null;

  // Whether "Paste" would do anything at all right now — see
  // `pasteToEmptyRow`. A division, or a cell *other* than the one just
  // copied, always applies directly once something's been copied
  // (filling it in if blank, or — see `pendingOverwrite` — asking
  // first if it isn't); the row's own empty space, or the exact cell just
  // copied, both need actual room in that row to fall back to instead.
  const canPaste =
    copiedCell !== null &&
    (selectedCellIndices.length > 1 ||
      (selectedCellIndices.length === 1 && selectedDivisionIndices.length > 1) ||
      selectedDivisionId !== null ||
      (selectedCellIndex !== null &&
        selectedDivisionIndices.length === 0 &&
        selectedCellIndex !== copiedCell.sourceId) ||
      rowHasRoomForPaste);

  // Whether any division of the sole selected cell is the real focus
  // right now, as opposed to plain top-level cells — used by `App`'s
  // keydown shortcuts to route Backspace to the right bulk action, and to
  // keep Copy (not implemented for divisions) from firing while one's
  // selected.
  const hasDivisionSelection =
    selectedCellIndices.length === 1 && selectedDivisionIndices.length > 0;
  const hasCellSelection =
    selectedCellIndices.length > 0 && !hasDivisionSelection;
  // Copy only ever shows in the context menu for a single selected cell
  // — never for a multi-selection, contiguous or not — so Cmd/Ctrl+C has
  // to respect the same rule rather than firing for any non-empty cell
  // selection.
  const canCopySelection = hasCellSelection && selectedCellIndices.length === 1;

  // ← / → move the selection one cell (or division) over, in reading
  // order across the whole display — see `adjacentSelection` for what
  // counts as "over" around merges, divided cells and row ends. Only ever
  // from a single selected cell/division: a multi-selection has no one
  // place for an arrow to start from, so it's left alone rather than
  // collapsed onto an arbitrary member of itself.
  //
  // `isNavigable` is how Layer mode keeps the arrows off a Space cell
  // (see `Composer`): it renders nothing at all there, so there'd be no
  // selection to see. This hook has no `mode` of its own to decide that
  // from — the caller passes whichever rule its mode goes by.
  function selectAdjacent(
    direction: -1 | 1,
    isNavigable?: (typeId: string | null | undefined) => boolean,
  ) {
    if (selectedCellIndices.length !== 1 || selectedDivisionIndices.length > 1) {
      return;
    }
    const parentId = selectedCellIndices[0];
    const next = adjacentSelection(
      selectedDivisionId !== null
        ? { kind: "division", parentId, subId: selectedDivisionId }
        : { kind: "cell", id: parentId },
      direction,
      rows,
      cells,
      mergeGroups,
      isNavigable,
    );
    if (!next) return;
    if (next.kind === "cell") focusCell(next.id);
    else focusDivision(next);
  }

  // "Merge" on multiple selected, mutually-contiguous top-level cells —
  // folds them all into one `mergeGroups` entry in one stroke instead of
  // growing a merge one adjacent click at a time (the old
  // notification/STOP-driven flow this replaces — see
  // `isCellSelectionContiguous`, which gates whether the menu even offers
  // this).
  function mergeSelectedCells() {
    if (!isCellSelectionContiguous) return;
    const [first, ...rest] = selectedCellIndices;
    setMergeGroups((current) =>
      rest.reduce((groups, id) => addMerge(groups, first, id), current),
    );
    setSelectedCellIndices([Math.min(...selectedCellIndices)]);
  }

  function unmerge() {
    if (selectedCellIndices.length !== 1) return;
    setMergeGroups((current) => removeMerge(current, selectedCellIndices[0]));
  }

  // Backspace, or the context menu's "Delete" — arms `pendingDelete` for
  // `Composer`'s Confirmation rather than deleting right away (see
  // `confirmDelete`/`cancelDelete`). No-ops on an empty selection, same as
  // the immediate deletion this replaced always did.
  function requestDeleteCells() {
    if (selectedCellIndices.length === 0) return;
    setPendingDelete({ kind: "cells" });
  }

  function requestDeleteDivisions() {
    if (selectedCellIndices.length !== 1 || selectedDivisionIndices.length === 0) {
      return;
    }
    setPendingDelete({ kind: "divisions" });
  }

  // "Yes" on the delete confirmation — runs whichever of the two below
  // `pendingDelete.kind` armed.
  function confirmDelete() {
    const pending = pendingDelete;
    setPendingDelete(null);
    if (!pending) return;
    if (pending.kind === "cells") performDeleteSelectedCells();
    else performDeleteSelectedDivisions();
  }

  function cancelDelete() {
    setPendingDelete(null);
  }

  // "Delete" on however many top-level cells are currently selected
  // (contiguous or not) — removes every one that's actually removable
  // (`canRemoveCell`) in a single pass. Deliberately not a loop of
  // `removeCell` calls: that function reads `rows` from this render's own
  // closure rather than a functional update, so calling it more than once
  // in the same stroke would have each call overwrite the last's result
  // instead of compounding.
  function performDeleteSelectedCells() {
    const removable = new Set(
      selectedCellIndices.filter((id) => canRemoveCell(id, rows, mergeGroups)),
    );
    if (removable.size === 0) return;
    setRowOverrides((current) => {
      const next = { ...current };
      rows.forEach((cellIds, row) => {
        if (cellIds.some((id) => removable.has(id))) {
          next[row] = cellIds.filter((id) => !removable.has(id));
        }
      });
      return next;
    });
    setCells((current) => {
      const rest = { ...current };
      for (const id of removable) delete rest[id];
      return rest;
    });
    setSelectedCellIndices([]);
  }

  // Same idea as `mergeSelectedCells`, scoped to one cell's own divisions
  // (`divide.mergeGroups`) instead of the display's top-level `mergeGroups`.
  function mergeSelectedDivisions() {
    if (
      selectedCellIndices.length !== 1 ||
      !isDivisionSelectionContiguous
    ) {
      return;
    }
    const parentId = selectedCellIndices[0];
    const parent = cells[parentId];
    if (!parent?.divide) return;

    const [first, ...rest] = selectedDivisionIndices;
    const mergedGroups = rest.reduce(
      (groups, id) => addMerge(groups, first, id),
      parent.divide.mergeGroups,
    );
    const group = groupOf(first, mergedGroups);
    const primary = Math.min(...group);
    // The merged shape only ever renders/edits its primary's own
    // `DivisionCell` — divisions start blank (unlike a top-level cell,
    // always typed the moment it exists), so if whichever one already
    // has a plugin on it isn't the new primary, carry it over rather
    // than letting it silently vanish from view behind a blank one.
    const divisionCells = { ...parent.divide.cells };
    if (!divisionCells[primary]?.typeId) {
      const withContent = group.find((id) => divisionCells[id]?.typeId);
      if (withContent !== undefined) {
        divisionCells[primary] = divisionCells[withContent];
      }
    }

    // Every division just ended up in one group — there's nothing left
    // to divide into more than one piece, so this collapses back to the
    // plain, undivided cell it would be if Divide had never happened,
    // carrying over whatever content survived the merge above. If
    // nothing did (every division was blank), that plain cell would
    // itself be blank — rather than leave that sitting in the row, drop
    // it entirely, the same as merging two blank top-level cells would
    // have nothing left worth keeping either.
    if (group.length === parent.divide.cols * parent.divide.rows) {
      const survivor = divisionCells[primary] ?? defaultDivisionCell();
      if (!survivor.typeId) {
        removeCell(parentId);
        return;
      }
      setCells((current) => {
        const currentParent = current[parentId];
        if (!currentParent?.divide) return current;
        return {
          ...current,
          [parentId]: {
            ...currentParent,
            typeId: survivor.typeId,
            typeConfig: survivor.typeConfig,
            pluginIds: survivor.pluginIds,
            // A fresh reference, same as any other Layout-plugin
            // assignment — see `GridCell.keyRef` — rather than the
            // division's own, now that it's collapsing back into a
            // plain top-level cell.
            keyRef: randomId(),
            divide: undefined,
          },
        };
      });
      selectCell(parentId);
      return;
    }

    setCells((current) => {
      const currentParent = current[parentId];
      if (!currentParent?.divide) return current;
      return {
        ...current,
        [parentId]: {
          ...currentParent,
          divide: {
            ...currentParent.divide,
            mergeGroups: mergedGroups,
            cells: divisionCells,
          },
        },
      };
    });
    setSelectedDivisionIndices([primary]);
  }

  function unmergeDivision() {
    if (
      selectedCellIndices.length !== 1 ||
      selectedDivisionIndices.length !== 1
    ) {
      return;
    }
    const parentId = selectedCellIndices[0];
    const subId = selectedDivisionIndices[0];
    setCells((current) => {
      const parent = current[parentId];
      if (!parent?.divide) return current;
      return {
        ...current,
        [parentId]: {
          ...parent,
          divide: {
            ...parent.divide,
            mergeGroups: removeMerge(parent.divide.mergeGroups, subId),
          },
        },
      };
    });
  }

  // "Delete" on however many divisions are currently selected — unlike a
  // top-level cell's Delete (`removeCell`, which drops it from its row
  // entirely), a division can't be removed on its own: the grid's
  // `cols`/`rows` count is fixed at Divide time (see `createDivideGrid`).
  // This just clears each selected one's plugin back to blank, the same
  // state every division but the first starts in — the divisions
  // themselves, and the rest of the grid, stay exactly as they were.
  function performDeleteSelectedDivisions() {
    if (
      selectedCellIndices.length !== 1 ||
      selectedDivisionIndices.length === 0
    ) {
      return;
    }
    const parentId = selectedCellIndices[0];
    const targets = new Set(selectedDivisionIndices);
    setCells((current) => {
      const parent = current[parentId];
      if (!parent?.divide) return current;
      const divisionCells = { ...parent.divide.cells };
      for (const id of targets) {
        if (divisionCells[id]?.typeId) divisionCells[id] = defaultDivisionCell();
      }
      return {
        ...current,
        [parentId]: { ...parent, divide: { ...parent.divide, cells: divisionCells } },
      };
    });
  }

  // "Divide" in the Actions menu — only reachable for a plain, unmerged,
  // not-yet-divided cell (see the menu item itself in `App`). Division 0
  // keeps the cell's own plugin/config, so dividing doesn't discard it —
  // every other division starts blank instead, to be assigned by
  // dropping a plugin onto it, same as any brand-new cell (see
  // `createDivideGrid`).
  function divideSelectedCell(cols: number, divideRows: number) {
    if (
      !layoutSelection ||
      layoutSelection.isMerged ||
      layoutSelection.cell.divide ||
      cols * divideRows <= 1 // see `Divide`'s own `isNoOp` guard
    ) {
      return;
    }
    const index = layoutSelection.index;
    const { typeId, typeConfig, pluginIds } = layoutSelection.cell;
    setCells((current) => ({
      ...current,
      [index]: {
        ...current[index],
        // Division 0's own `keyRef` is deliberately not carried over from
        // the cell being divided — `createDivideGrid` mints it a fresh one
        // regardless of what's passed here (see its own docblock).
        divide: createDivideGrid(cols, divideRows, {
          typeId,
          typeConfig,
          pluginIds,
          keyRef: null,
        }),
      },
    }));
    selectDivision({ parentId: index, subId: 0 });
  }

  // Copy the smallest-id selected cell's type, config and Layer plugins
  // — not its own id or position — the same "primary" convention a merge
  // already uses to pick which member represents a group. Cloned so a
  // later Paste's own further edits can't reach back into this cell's
  // arrays/objects. `sourceId` is that cell's own id — see `pasteToEmptyRow`.
  function copySelectedCell() {
    if (selectedCellIndices.length === 0) return;
    const sourceId = Math.min(...selectedCellIndices);
    const source = cells[sourceId];
    if (!source) return;
    const { typeId, typeConfig, pluginIds, unit } = source;
    setCopiedCell({
      typeId,
      typeConfig: { ...typeConfig },
      pluginIds: [...pluginIds],
      unit,
      sourceId,
    });
  }

  // Each paste target gets its own fresh `keyRef` (see `GridCell.keyRef`)
  // rather than inheriting the copied cell's — pasting the same content
  // onto two different cells must never leave them both pointing real
  // Layer-mode plugins at the same reference.
  function applyPasteOntoCell(id: number) {
    if (!copiedCell) return;
    changeCell(id, {
      typeId: copiedCell.typeId,
      typeConfig: { ...copiedCell.typeConfig },
      pluginIds: [...copiedCell.pluginIds],
      keyRef: randomId(),
    });
  }

  function applyPasteOntoDivision(parentId: number, subId: number) {
    if (!copiedCell) return;
    changeDivisionCell(parentId, subId, {
      typeId: copiedCell.typeId,
      typeConfig: { ...copiedCell.typeConfig },
      pluginIds: [...copiedCell.pluginIds],
      keyRef: randomId(),
    });
  }

  // Applies the copied cell to whatever's actually selected right now —
  // see `canPaste` for when this can do anything at all:
  //
  // - More than one cell, or more than one division of the same parent, is
  //   selected: applies directly onto every one of them (never the "new
  //   cell in this row" convenience below — that only ever makes sense for
  //   a single target), one Confirmation covering the whole batch if any
  //   target isn't already blank.
  // - A single division is the real focus: applies directly onto it
  //   (divisions have no separate "row" of their own to fall back to
  //   instead — see `createDivideGrid`), confirming first
  //   (`pendingOverwrite`) if it isn't already blank.
  // - The row's own empty space is selected, or the selected cell is the
  //   exact one just copied (see `copiedCell.sourceId`) and its row still
  //   has room: lands a brand-new cell at that row's own trailing end —
  //   never overwrites anything, so never needs to confirm.
  // - Any other single cell: applies directly onto it, confirming first if
  //   it isn't already blank — same as a division above.
  function pasteToEmptyRow() {
    if (!copiedCell) return;

    if (selectedCellIndices.length === 1 && selectedDivisionIndices.length > 1) {
      const parentId = selectedCellIndices[0];
      const parent = cells[parentId];
      if (!parent?.divide) return;
      const targets = selectedDivisionIndices.map((subId) => ({
        kind: "division" as const,
        parentId,
        subId,
      }));
      if (selectedDivisionIndices.some((subId) => parent.divide!.cells[subId]?.typeId)) {
        setPendingOverwrite({ source: "paste", targets });
      } else {
        targets.forEach((target) => applyPasteOntoDivision(target.parentId, target.subId));
      }
      return;
    }

    if (selectedCellIndices.length > 1) {
      const targets = selectedCellIndices.map((id) => ({ kind: "cell" as const, id }));
      if (selectedCellIndices.some((id) => cells[id]?.typeId)) {
        setPendingOverwrite({ source: "paste", targets });
      } else {
        targets.forEach((target) => applyPasteOntoCell(target.id));
      }
      return;
    }

    if (selectedCellIndex !== null && selectedDivisionId !== null) {
      const parentId = selectedCellIndex;
      const subId = selectedDivisionId;
      if (cells[parentId]?.divide?.cells[subId]?.typeId) {
        setPendingOverwrite({
          source: "paste",
          targets: [{ kind: "division", parentId, subId }],
        });
        return;
      }
      applyPasteOntoDivision(parentId, subId);
      return;
    }

    if (pasteTargetRow !== -1) {
      if (!rowHasRoomForPaste) return;
      const { rows: updatedRows, id } = addCellToRow(rows, pasteTargetRow);
      setRowOverrides((current) => ({
        ...current,
        [pasteTargetRow]: updatedRows[pasteTargetRow],
      }));
      setCells((current) => ({
        ...current,
        [id]: {
          typeId: copiedCell.typeId,
          typeConfig: { ...copiedCell.typeConfig },
          pluginIds: [...copiedCell.pluginIds],
          keyRef: randomId(),
          unit: copiedCell.unit,
        },
      }));
      setSelectedCellIndices([id]);
      setSelectedEmptyRow(null);
      return;
    }

    if (
      selectedCellIndex !== null &&
      selectedDivisionIndices.length === 0 &&
      selectedCellIndex !== copiedCell.sourceId
    ) {
      if (cells[selectedCellIndex]?.typeId) {
        setPendingOverwrite({
          source: "paste",
          targets: [{ kind: "cell", id: selectedCellIndex }],
        });
        return;
      }
      applyPasteOntoCell(selectedCellIndex);
    }
  }

  // Assigning (or re-assigning, onto a different kind) a Layout plugin
  // always mints a fresh `keyRef` — see `GridCell.keyRef` — so whatever
  // Layer-mode plugins get dropped on it next attach to *this* instance,
  // never to whatever a previous kind change or a stale save left behind.
  function applyLayoutPluginToCell(
    id: number,
    pluginId: string,
    defaultConfig: Record<string, unknown>,
  ) {
    setCells((current) => ({
      ...current,
      [id]: {
        ...defaultGridCell(current[id]?.unit),
        typeId: pluginId,
        typeConfig: { ...defaultConfig },
        keyRef: randomId(),
      },
    }));
  }

  function applyLayoutPluginToDivision(
    parentId: number,
    subId: number,
    pluginId: string,
    defaultConfig: Record<string, unknown>,
  ) {
    changeDivisionCell(parentId, subId, {
      typeId: pluginId,
      typeConfig: { ...defaultConfig },
      pluginIds: [],
      keyRef: randomId(),
    });
  }

  // Dropping a Layout plugin (Key/Space) onto `index` (or its merge's
  // primary — see `Display`'s own `handleCellDrop`, which resolves that
  // before calling this) sets its kind — same rule as `pasteToEmptyRow`:
  // dropping the kind it already is is always a no-op (nothing to lose),
  // but a *different* kind onto a cell that already has content (its own
  // config, or Layer-mode plugins a kind change would discard) asks
  // first (`pendingOverwrite`) rather than silently overwriting it.
  function assignLayoutPlugin(
    index: number,
    pluginId: string,
    defaultConfig: Record<string, unknown>,
  ) {
    focusCell(index);
    const cell = cells[index];
    if (cell?.typeId === pluginId) return;
    if (cell?.typeId) {
      setPendingOverwrite({
        source: "layout-plugin",
        target: { kind: "cell", id: index },
        pluginId,
        defaultConfig,
      });
      return;
    }
    applyLayoutPluginToCell(index, pluginId, defaultConfig);
  }

  // Same idea as `assignLayoutPlugin`, for one division of a divided cell
  // instead of a top-level one.
  function assignLayoutPluginToDivision(
    parentId: number,
    subId: number,
    pluginId: string,
    defaultConfig: Record<string, unknown>,
  ) {
    focusDivision({ parentId, subId });
    const divCell = cells[parentId]?.divide?.cells[subId];
    if (divCell?.typeId === pluginId) return;
    if (divCell?.typeId) {
      setPendingOverwrite({
        source: "layout-plugin",
        target: { kind: "division", parentId, subId },
        pluginId,
        defaultConfig,
      });
      return;
    }
    applyLayoutPluginToDivision(parentId, subId, pluginId, defaultConfig);
  }

  // "Yes" on the confirmation a non-blank overwrite shows (`Composer`'s
  // `Confirmation`) — applies whichever of `pasteToEmptyRow`/
  // `assignLayoutPlugin`/`assignLayoutPluginToDivision` set `pendingOverwrite`.
  function confirmOverwrite() {
    const pending = pendingOverwrite;
    setPendingOverwrite(null);
    if (!pending) return;
    if (pending.source === "paste") {
      for (const target of pending.targets) {
        if (target.kind === "cell") applyPasteOntoCell(target.id);
        else applyPasteOntoDivision(target.parentId, target.subId);
      }
    } else {
      if (pending.target.kind === "cell") {
        applyLayoutPluginToCell(pending.target.id, pending.pluginId, pending.defaultConfig);
      } else {
        applyLayoutPluginToDivision(
          pending.target.parentId,
          pending.target.subId,
          pending.pluginId,
          pending.defaultConfig,
        );
      }
    }
  }

  function cancelOverwrite() {
    setPendingOverwrite(null);
  }

  return {
    // grid state
    cells,
    rowOverrides,
    mergeGroups,
    rows,
    setCells,
    setRowOverrides,
    setMergeGroups,
    skipAutosaveRef,
    loadFactoryLayout,

    // selection state
    selectedCellIndices,
    selectedEmptyRow,
    selectedDivisionIndices,
    displaySelected,
    copiedCell,
    pendingOverwrite,
    pendingDelete,

    // selection actions
    selectDisplay,
    selectCell,
    focusCell,
    toggleCellSelection,
    selectDivision,
    focusDivision,
    toggleDivisionSelection,
    selectEmptyRow,
    selectAdjacent,
    clearCellSelection,
    clearSelection,

    // derived selection
    selectedCellIndex,
    layoutSelection,
    isCellSelectionContiguous,
    selectedDivisionId,
    divisionSelection,
    isDivisionSelectionContiguous,
    emptySelection,
    canPaste,
    hasDivisionSelection,
    hasCellSelection,
    canCopySelection,

    // grid mutations
    changeCell,
    changeDivisionCell,
    createCell,
    moveCell,
    removeCell,
    mergeSelectedCells,
    unmerge,
    requestDeleteCells,
    mergeSelectedDivisions,
    unmergeDivision,
    requestDeleteDivisions,
    divideSelectedCell,
    copySelectedCell,
    pasteToEmptyRow,
    assignLayoutPlugin,
    assignLayoutPluginToDivision,
    confirmOverwrite,
    cancelOverwrite,
    confirmDelete,
    cancelDelete,
  };
}

export type DisplayGridApi = ReturnType<typeof useDisplayGrid>;
