import { useEffect, useRef, useState } from "react";
import type { RefObject, PointerEvent as ReactPointerEvent } from "react";

import { createFollowGhost } from "./inspectorHelpers";
import { isLayerTarget } from "../plugins/registry";
import type { GridCell, MergeGroups } from "../types/layout";
import { layoutRow, primaryOf } from "../utils/layout";
import type { ElementSize } from "./useElementSize";

// Same square this drag's ghost starts at before growing — there's no
// "row" to size it from here (unlike the Inspector's plugin drag), so a
// plain constant stands in.
const GHOST_START_SIZE_PX = 40;

// Same idea as `useCellMove`'s own threshold — a pointer has to travel
// this far before a pointer-down on a key counts as dragging it, rather
// than just being the press half of an ordinary click.
const MOVE_THRESHOLD_PX = 4;

export type KeyDragTarget =
  | { kind: "cell"; id: number }
  | { kind: "division"; parentId: number; subId: number };

export function sameKeyDragTarget(a: KeyDragTarget, b: KeyDragTarget): boolean {
  if (a.kind !== b.kind) return false;
  return a.kind === "cell" && b.kind === "cell"
    ? a.id === b.id
    : a.kind === "division" &&
        b.kind === "division" &&
        a.parentId === b.parentId &&
        a.subId === b.subId;
}

/**
 * Layer mode's own drag — moving a key's Layer content (its attached
 * `KeyPlugin`s) onto another key, in place of the old "Move to" menu item.
 * Same plain-pointer-events approach as `useCellMove` (native HTML5 DnD is
 * too inconsistent for this on SVG — see that hook's own docblock), but
 * hit-tests the drop position against the grid's own geometry instead of
 * computing a row-insertion point: there's no geometry to reorder here,
 * only "which existing key (cell or division) is the pointer over right
 * now". A drop target only needs to be a valid Layer target
 * (`isLayerTarget` — the same rule a plugin dropped from the Inspector
 * already goes through) and not the cell/division being dragged itself —
 * unlike the *source*, it does NOT need to already have content: an empty
 * key is a perfectly good place to move something to.
 *
 * The source doesn't need to be selected beforehand either — press and
 * drag in one gesture works on any key with content, auto-selecting it
 * (`onSelectStart`) the moment the pointer actually crosses the move
 * threshold, so a plain click (no real movement) still goes through the
 * ordinary click-to-select path untouched.
 */
export function useKeyDrag(params: {
  rows: number[][];
  cells: Record<number, GridCell>;
  mergeGroups: MergeGroups;
  unitMm: number;
  gapMm: number;
  display: ElementSize | null;
  pxPerMm: number;
  gridOffsetX: number;
  gridOffsetY: number;
  itemsY: number;
  rowPitch: number;
  svgRef: RefObject<SVGSVGElement | null>;
  // Whether `target` currently has Layer content worth dragging — only
  // gates *starting* a drag (there'd be nothing to move otherwise), never
  // the destination.
  hasContent: (target: KeyDragTarget) => boolean;
  // How many plugins `target` has — shown on the drag ghost once it grows,
  // so the user sees how much content is about to move.
  pluginCount: (target: KeyDragTarget) => number;
  // Called once, the moment a press-and-drag on `target` is confirmed
  // (past the move threshold) — selects it if it wasn't already, so the
  // gesture doesn't require a separate prior click.
  onSelectStart: (target: KeyDragTarget) => void;
  onMoveKey: (source: KeyDragTarget, dest: KeyDragTarget) => void;
}) {
  const {
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
    hasContent,
    pluginCount,
    onSelectStart,
    onMoveKey,
  } = params;

  // The key currently hovered as a drop target while dragging — drawn as
  // a highlighted cell/division (see `Display`'s own rendering).
  const [dragTarget, setDragTarget] = useState<KeyDragTarget | null>(null);
  const dragTargetRef = useRef<KeyDragTarget | null>(null);
  function setTarget(target: KeyDragTarget | null) {
    dragTargetRef.current = target;
    setDragTarget(target);
  }
  const draggingRef = useRef<{
    source: KeyDragTarget;
    startClientX: number;
    startClientY: number;
    hasMoved: boolean;
  } | null>(null);
  const ghostRef = useRef<ReturnType<typeof createFollowGhost> | null>(null);
  // Same purpose as `useCellMove`'s own — read and cleared by `Display`'s
  // `handleClick` so the `click` right after this drag's `pointerup`
  // doesn't also re-select/toggle the key just dragged.
  const suppressClickRef = useRef(false);

  useEffect(() => {
    // Which cell/division (if any) sits under `(mmX, mmY)` — resolves a
    // merge to its primary the same way a click would, and (unmerged
    // cells only — a merge and `divide` are mutually exclusive) resolves
    // further down into whichever division of that cell's own grid the
    // point actually falls in.
    function hitTestAt(mmX: number, mmY: number): KeyDragTarget | null {
      const row = Math.floor(mmY / rowPitch);
      if (row < 0 || row >= itemsY) return null;
      const slots = layoutRow(rows[row] ?? [], cells, unitMm, gapMm);
      const slot = slots.find((item) => mmX >= item.x && mmX < item.x + item.width);
      if (!slot) return null;
      const primary = primaryOf(slot.id, mergeGroups);
      const cell = cells[primary];
      if (!cell?.divide || primary !== slot.id) {
        return { kind: "cell", id: primary };
      }
      const parentX = slot.x;
      const parentY = row * rowPitch;
      const divWidth = slot.width / cell.divide.cols;
      const divHeight = unitMm / cell.divide.rows;
      const col = Math.min(
        cell.divide.cols - 1,
        Math.max(0, Math.floor((mmX - parentX) / divWidth)),
      );
      const divRow = Math.min(
        cell.divide.rows - 1,
        Math.max(0, Math.floor((mmY - parentY) / divHeight)),
      );
      const subId = primaryOf(divRow * cell.divide.cols + col, cell.divide.mergeGroups);
      return { kind: "division", parentId: primary, subId };
    }

    function isValidDestination(target: KeyDragTarget, source: KeyDragTarget): boolean {
      if (sameKeyDragTarget(target, source)) return false;
      const typeId =
        target.kind === "cell"
          ? cells[target.id]?.typeId
          : cells[target.parentId]?.divide?.cells[target.subId]?.typeId;
      return isLayerTarget(typeId);
    }

    function handleMove(event: PointerEvent) {
      const dragging = draggingRef.current;
      if (!dragging || !display || pxPerMm <= 0) return;
      if (!dragging.hasMoved) {
        const dx = event.clientX - dragging.startClientX;
        const dy = event.clientY - dragging.startClientY;
        if (Math.hypot(dx, dy) < MOVE_THRESHOLD_PX) return;
        dragging.hasMoved = true;
        onSelectStart(dragging.source);
        const ghost = createFollowGhost(
          event.clientX,
          event.clientY,
          GHOST_START_SIZE_PX,
          "⤵",
        );
        const count = pluginCount(dragging.source);
        // Shorter than the Inspector plugin drag's own 300ms — moving a
        // key's content is a much shorter, quicker gesture (adjacent
        // cells), so the count needs to show up well before the drag is
        // typically already over.
        ghost.grow(`${count} plugin${count === 1 ? "" : "s"}`, 100, 50, 120);
        ghostRef.current = ghost;
      }
      ghostRef.current?.moveTo(event.clientX, event.clientY);
      const svg = svgRef.current;
      if (!svg) return;
      const screenRect = svg.getBoundingClientRect();
      const mmX = (event.clientX - screenRect.left) / pxPerMm - gridOffsetX;
      const mmY = (event.clientY - screenRect.top) / pxPerMm - gridOffsetY;
      const target = hitTestAt(mmX, mmY);
      setTarget(target && isValidDestination(target, dragging.source) ? target : null);
    }

    function handleUp() {
      const dragging = draggingRef.current;
      draggingRef.current = null;
      ghostRef.current?.remove();
      ghostRef.current = null;
      if (dragging?.hasMoved) {
        suppressClickRef.current = true;
        const target = dragTargetRef.current;
        if (target) onMoveKey(dragging.source, target);
      }
      setTarget(null);
    }

    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
    return () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
    };
  }, [
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
    pluginCount,
    onSelectStart,
    onMoveKey,
  ]);

  function handleKeyPointerDown(
    target: KeyDragTarget,
    event: ReactPointerEvent<SVGGElement>,
  ) {
    if (event.button !== 0 || !hasContent(target)) return;
    event.stopPropagation();
    draggingRef.current = {
      source: target,
      startClientX: event.clientX,
      startClientY: event.clientY,
      hasMoved: false,
    };
  }

  return { dragTarget, suppressClickRef, handleKeyPointerDown };
}
