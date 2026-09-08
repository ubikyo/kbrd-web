import type {
  DragEvent,
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
  ReactElement,
} from "react";

import { isMappingVisible } from "../plugins/registry";
import type { KeyPlugin } from "../types/layer";
import type { DivideGrid } from "../types/layout";
import type { KeyLook } from "../utils/keyProperties";
import {
  divisionCellRect,
  divisionOutline,
  groupOf,
  type CellRect,
} from "../utils/layout";
import LayoutCell from "./LayoutCell";

type Props = {
  mode: "layout" | "mapping";
  parentId: number;
  divide: DivideGrid;
  parentRect: CellRect;
  parentUnit: number;
  selectedCellIndices: number[];
  selectedDivisionIndices: number[];
  isDropTarget: (subId: number) => boolean;
  // Mapping mode's own key-drag drop target (see `useKeyDrag`) — separate
  // from `isDropTarget` above (a plugin dragged from the Inspector), see
  // `LayoutCell`'s own `isMoveTarget`. Both default to never-true so
  // Layout-mode callers (which don't have this concept) can omit them.
  isMoveTarget?: (subId: number) => boolean;
  onDivisionPointerDown?: (
    parentId: number,
    subId: number,
    event: ReactPointerEvent<SVGGElement>,
  ) => void;
  onDivisionClick: (
    parentId: number,
    divide: DivideGrid,
    subId: number,
    event: ReactMouseEvent<SVGGElement>,
  ) => void;
  onDivisionContextMenu: (
    parentId: number,
    divide: DivideGrid,
    subId: number,
    event: ReactMouseEvent<SVGGElement>,
  ) => void;
  onDivisionDragOver: (
    parentId: number,
    subId: number,
    event: DragEvent<SVGGElement>,
  ) => void;
  onDivisionDragLeave: (parentId: number, subId: number) => void;
  onDivisionDrop: (
    parentId: number,
    divide: DivideGrid,
    subId: number,
    event: DragEvent<SVGGElement>,
  ) => void;
  // Resolves a division's own attached Render/Invoke plugins from its
  // `keyRef` — see `Display`'s own `keyPluginsFor`, the one place that
  // actually knows about `layer.plugins`.
  keyPluginsFor: (keyRef: string | null | undefined) => KeyPlugin[];
  // Resolves a division's own Background/Border look the same way — see
  // `Display`'s own `keyLookFor`, which also decides that Layout mode
  // gets none of it.
  keyLookFor: (keyRef: string | null | undefined) => KeyLook | undefined;
};

/**
 * `parentId`'s own division grid (see `GridCell.divide`) in place of the
 * one plain `<LayoutCell>` an ordinary cell gets — one `<LayoutCell>` per
 * division *group* (a division merged with a sibling renders once, from
 * its primary, exactly like a top-level merge does), laid out directly
 * over `parentRect` with no gap between any of them
 * (`divisionCellRect`/`divisionOutline`), rather than going through
 * `layoutRow`'s ordinary same-row, `gapMm`-spaced flow. Pulled out of
 * `<Display>` (as `renderDivisions`) since it's a self-contained rendering
 * pass — see `Display`'s own comment on the resize grip for why the
 * border-dedup pass below needs a second, later pass of its own too.
 */
export default function LayoutCellDivision({
  mode,
  parentId,
  divide,
  parentRect,
  parentUnit,
  selectedCellIndices,
  selectedDivisionIndices,
  isDropTarget,
  isMoveTarget,
  onDivisionClick,
  onDivisionContextMenu,
  onDivisionDragOver,
  onDivisionDragLeave,
  onDivisionDrop,
  onDivisionPointerDown,
  keyPluginsFor,
  keyLookFor,
}: Props) {
  const count = divide.cols * divide.rows;
  const cols = divide.cols;

  // Resolved once up front — both the border-dedup pass below and the
  // regular rendering pass need each division's group/primary and
  // highlighted state.
  const status = Array.from({ length: count }, (_, subId) => {
    const group = groupOf(subId, divide.mergeGroups);
    const primary = Math.min(...group);
    const isSelected =
      selectedCellIndices.length === 1 &&
      selectedCellIndices[0] === parentId &&
      selectedDivisionIndices.includes(primary);
    return {
      group,
      primary,
      look: keyLookFor(divide.cells[primary]?.keyRef),
      isMerged: group.length > 1,
      isSelected,
      isDropTarget: isDropTarget(primary),
      isMoveTarget: isMoveTarget?.(primary) ?? false,
      // Mapping mode only ever shows a division whose own Layout plugin
      // opts into it (`mapping-visible`) — same rule as `Display`'s own
      // top-level cells, just per-division.
      isVisible: mode === "layout" || isMappingVisible(divide.cells[primary]?.typeId),
    };
  });
  const isHighlighted = (subId: number) =>
    status[subId].isSelected || status[subId].isDropTarget || status[subId].isMoveTarget;
  // A division whose own key carries a border draws its whole outline
  // itself (see `LayoutCell`'s `look`), so it wants no part in the shared
  // dashed pass below — neither its own sides, nor a neighbour's towards
  // it, exactly like a highlighted one.
  const drawsOwnBorder = (subId: number) =>
    Boolean(status[subId].look?.borderEnabled);
  const coversOwnEdges = (subId: number) =>
    isHighlighted(subId) || drawsOwnBorder(subId);

  // Two adjacent, both-dashed divisions each stroking their own full
  // border would draw their shared edge twice — and since each one's
  // dash pattern starts counting from its own path's own start point,
  // the two independently-phased dashed strokes can land out of sync
  // and visually fill each other's gaps in, reading as one solid line
  // where neither one actually is. So a "baseline" division (unmerged,
  // not selected, not the drop target) never draws a side it shares
  // with another baseline one — only the side that "owns" it does
  // (right/bottom always wins over left/top — an arbitrary but
  // consistent tie-break, equivalent to a spreadsheet's own
  // border-collapse) — or with a highlighted one (whose own full
  // border already covers it). A merged group still traces its own
  // full outline unconditionally, same as before — including towards a
  // baseline neighbour, a rarer pairing this doesn't fully dedupe.
  const borderSegments: { x1: number; y1: number; x2: number; y2: number }[] = [];
  for (let subId = 0; subId < count; subId++) {
    if (status[subId].isMerged || coversOwnEdges(subId) || !status[subId].isVisible) {
      continue;
    }
    const row = Math.floor(subId / cols);
    const col = subId % cols;
    const rect = divisionCellRect(subId, divide, parentRect);
    const neighbourOf = (dRow: number, dCol: number) => {
      const r = row + dRow;
      const c = col + dCol;
      return r < 0 || r >= divide.rows || c < 0 || c >= cols ? null : r * cols + c;
    };
    const drawsTowards = (dRow: number, dCol: number, owns: boolean) => {
      const otherId = neighbourOf(dRow, dCol);
      if (otherId === null) return true; // the grid's own outer edge
      if (coversOwnEdges(otherId)) return false; // its own full border covers it
      if (status[otherId].isMerged) return true; // accept the rare double-render risk
      if (!status[otherId].isVisible) return true; // nothing there to share the edge with
      return owns; // both baseline — only the owning side draws it
    };
    if (drawsTowards(0, -1, false)) {
      borderSegments.push({ x1: rect.x, y1: rect.y, x2: rect.x, y2: rect.y + rect.height });
    }
    if (drawsTowards(-1, 0, false)) {
      borderSegments.push({ x1: rect.x, y1: rect.y, x2: rect.x + rect.width, y2: rect.y });
    }
    if (drawsTowards(0, 1, true)) {
      borderSegments.push({
        x1: rect.x + rect.width,
        y1: rect.y,
        x2: rect.x + rect.width,
        y2: rect.y + rect.height,
      });
    }
    if (drawsTowards(1, 0, true)) {
      borderSegments.push({
        x1: rect.x,
        y1: rect.y + rect.height,
        x2: rect.x + rect.width,
        y2: rect.y + rect.height,
      });
    }
  }

  const rendered = new Set<number>();
  // The interactive element for a division — real event handlers, real
  // content — always renders in this same, stable `subId` order and
  // *never* moves in the DOM afterward, regardless of selection/drop/move
  // state: reordering it (an earlier "priority" pass used to push a
  // highlighted one later, to paint over a neighbour's shared edge) can
  // detach and reattach its own DOM node mid-gesture, which is enough to
  // make a browser's native drag-and-drop silently lose track of it —
  // `dragover` still fires (nothing about the drag's own tracking touches
  // the DOM), but the `drop` right after it never does. Any Z-ordering a
  // highlight still needs against a neighbour is handled by
  // `highlightItems` below instead: a second, purely visual, non-
  // interactive pass drawn after every one of these, so it always paints
  // on top without this element ever having to.
  const baseItems: ReactElement[] = [];
  // Visual-only re-draw of whichever division(s) are currently selected,
  // a plugin's own drop target, or a key-drag's move target — same shape/
  // position as the matching `baseItems` entry, `pointerEvents: "none"`
  // so it never intercepts anything, just painted after every baseline
  // item so its own highlighted border/fill always wins on a shared edge.
  const highlightItems: ReactElement[] = [];
  for (let subId = 0; subId < count; subId++) {
    const {
      group,
      primary,
      look,
      isSelected,
      isDropTarget: primaryIsDropTarget,
      isMoveTarget: primaryIsMoveTarget,
      isMerged,
      isVisible,
    } = status[subId];
    if (rendered.has(primary)) continue;
    rendered.add(primary);
    if (!isVisible) continue;

    const divCell = divide.cells[primary];
    // A division with no plugin yet reads exactly like the row's own
    // trailing empty space (`isEmpty` there too): no text at all (see
    // `unit` below — `undefined` skips the size label the same way it
    // already does for `typeId`/`pluginIds`), and selecting it stays
    // dashed rather than solid, since there's nothing real there yet —
    // just a spot a plugin could still be dropped onto.
    const hasContent = Boolean(divCell?.typeId);
    const outline = isMerged ? divisionOutline(group, divide, parentRect) : null;
    const bounds = outline?.bounds ?? divisionCellRect(primary, divide, parentRect);
    // Only the width matters for a division's own size label — its
    // height always matches the row's fixed cap size regardless of how
    // many `divide.rows` share it. Expressed as a share of the parent
    // cell's own Unit, by its own share of the parent's physical width
    // (its bounding box, so a merged, possibly stepped group still
    // reads as its true on-screen footprint) — rounded for a clean
    // "0.5U"-style label instead of a repeating decimal.
    const unit = hasContent
      ? Math.round((bounds.width / parentRect.width) * parentUnit * 100) / 100
      : undefined;
    const isHighlightedNow = isSelected || primaryIsDropTarget || primaryIsMoveTarget;

    baseItems.push(
      <LayoutCell
        key={`division-${parentId}-${primary}`}
        bounds={bounds}
        path={outline?.path}
        labelBounds={outline?.labelBounds}
        typeId={divCell?.typeId}
        keyPlugins={keyPluginsFor(divCell?.keyRef)}
        look={look}
        unit={unit}
        isEmpty={!hasContent}
        // Never this element's own highlighted styling — see
        // `highlightItems` above for that.
        isSelected={false}
        isDropTarget={false}
        isMoveTarget={false}
        // A baseline (unmerged) division's border is drawn once,
        // deduplicated, in `borderSegments` above instead; a merged one
        // still needs its own outline regardless of highlight state.
        showBorder={isMerged}
        showText={mode === "layout"}
        onClick={(event) => onDivisionClick(parentId, divide, primary, event)}
        onContextMenu={(event) =>
          onDivisionContextMenu(parentId, divide, primary, event)
        }
        onDragOver={(event) => onDivisionDragOver(parentId, primary, event)}
        onDragLeave={() => onDivisionDragLeave(parentId, primary)}
        onDrop={(event) => onDivisionDrop(parentId, divide, primary, event)}
        onPointerDown={
          mode === "mapping" && onDivisionPointerDown
            ? (event) => onDivisionPointerDown(parentId, primary, event)
            : undefined
        }
      />,
    );

    if (isHighlightedNow) {
      highlightItems.push(
        <g key={`division-highlight-${parentId}-${primary}`} style={{ pointerEvents: "none" }}>
          <LayoutCell
            bounds={bounds}
            path={outline?.path}
            labelBounds={outline?.labelBounds}
            isEmpty={!hasContent}
            isSelected={isSelected}
            isDropTarget={primaryIsDropTarget}
            isMoveTarget={primaryIsMoveTarget}
            showBorder
            showText={false}
          />
        </g>,
      );
    }
  }

  const borderLines = borderSegments.map((segment, index) => (
    <line
      key={`division-border-${parentId}-${index}`}
      x1={segment.x1}
      y1={segment.y1}
      x2={segment.x2}
      y2={segment.y2}
      stroke="var(--kbrd-border-color)"
      strokeWidth={1}
      strokeDasharray="4 3"
      vectorEffect="non-scaling-stroke"
      style={{ pointerEvents: "none" }}
    />
  ));

  return [
    ...borderLines,
    ...baseItems,
    ...highlightItems,
  ];
}
