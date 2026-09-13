import { useId } from "react";
import type { DragEvent, MouseEvent, PointerEvent } from "react";

// The dash pattern each of `kbrd.render-key`'s three border styles draws
// as — from the same control that previews them in the Properties tab, so
// the cell can't drift from its own preview.
import { BORDER_DASHES } from "@kbrd/plugins/web";

import { pluginById } from "../plugins/registry";
import { DEFAULT_STATE_NAME } from "../classes/inspectorHelpers";
import { stateConfig } from "../plugins/state";
import type { KeyPlugin } from "../types/layer";
import type { CellRect } from "../utils/layout";
import { fitFontSize, type FittedLine } from "../utils/textFit";
import type { KeyLook } from "../utils/keyProperties";

// How much of a cell the label is sized to take, across and down (see
// `fitFontSize`). The size isn't fixed: one layout holds cells an order
// of magnitude apart — a 1U key beside a 9U spacebar, and merges several
// rows tall — and a size chosen for either one is wrong for the other.
// So each cell's label is fitted to the cell, and stays the same
// *fraction* of it instead of the same number of millimetres.
//
// Height is what binds in almost every case, two short lines being far
// easier to fit across a keycap than down it — which is what keeps a row
// of differently-sized keys reading as one row of labels rather than as
// a size chart, and stops a 9U spacebar shouting its own name.
// Half rather than a fuller box: at 0.8 the label read as the cell's
// content rather than as an annotation over it, which in Layout mode —
// where the point is the shape of the grid — is the wrong thing to be
// looking at.
const LABEL_FILL = 0.5;
// Vertical spacing between the label's own lines (size, Layout plugin
// type, each attached Layer plugin type) — see `labelLines` below —
// as a multiple of whatever size the label came out at.
const LABEL_LINE_HEIGHT = 1.2;
// The type line's size as a fraction of the size line's. The size is
// what a cell is being read for in Layout mode and the type is the
// qualifier under it, so the two are set as a heading and its caption
// rather than as two equal lines — the size bold, the type smaller and
// regular weight. `fitFontSize` sizes the pair as one block, so this
// only ever changes their proportion to each other, never how much of
// the cell they take together.
const LABEL_TYPE_SCALE = 0.8;
// The floor a label stops shrinking at, in mm. Below roughly this a
// label is a smudge whatever it says, so a sliver of a cell overflows
// slightly rather than drawing something unreadable and pretending it
// fit.
const LABEL_MIN_SIZE_MM = 1;
// The same "this is the one" the rest of the app is drawn in. A `stroke`
// presentation attribute does take a `var()` — the labels below have read
// their fill that way all along — so there's no literal to keep in step
// with the palette here.
const SELECTED_STROKE = "var(--kbrd-color-selected)";
// Both kinds of drag destination — a plugin dragged from the Inspector
// (`isDropTarget`) and a key's Layer content dragged from another key
// (`isMoveTarget`, see `useKeyDrag`) — read the same way: the cell/
// division's existing border just turns solid white (`shapeProps`'s own
// dashed/transparent look otherwise stays), with a symbol centred over it
// telling the two apart (a plugin lands fresh, a move replaces).
const TARGET_SYMBOL_SIZE_MM = 5;
const DROP_TARGET_SYMBOL = "+";
const MOVE_TARGET_SYMBOL = "⤵";
// The body colour at 80% opacity — a drop/move target's own fill,
// instead of the plain transparent fill every other cell has.
const TARGET_FILL = "color-mix(in srgb, var(--kbrd-color-body) 80%, transparent)";
// A fixed screen size regardless of the grid's own scale (Caps size, zoom,
// how many rows fit…) — unlike the rest of a cell, which is drawn directly
// in the SVG's mm-space and so naturally scales with it, the grip is
// converted from these via `pxPerMm` (see `Display`) so it always reads
// the same size on screen.
const GRIP_WIDTH_PX = 6;
const GRIP_HEIGHT_PX = 30;
// `GripVerticalIcon`'s own paths (from `@mantine/core`'s `GripIcon.tsx`),
// reused verbatim inside a nested `<svg viewBox="0 0 24 24">` so the dots
// render exactly as Mantine's do, non-uniform stretch included.
const GRIP_DOT_PATHS = [
  "M8 5a1 1 0 1 0 2 0a1 1 0 1 0 -2 0",
  "M8 12a1 1 0 1 0 2 0a1 1 0 1 0 -2 0",
  "M8 19a1 1 0 1 0 2 0a1 1 0 1 0 -2 0",
  "M14 5a1 1 0 1 0 2 0a1 1 0 1 0 -2 0",
  "M14 12a1 1 0 1 0 2 0a1 1 0 1 0 -2 0",
  "M14 19a1 1 0 1 0 2 0a1 1 0 1 0 -2 0",
];
// The palette's loudest foreground, which is what `@kbrd/plugins/theme`
// also paints a Splitter thumb with — the grip is the same object. White
// on the dark theme's black glass, black on the light theme's white one.
const GRIP_BACKGROUND = "var(--kbrd-color-contrast)";

type Props = {
  // Bounding box, used as the shape when `path` isn't given (a plain,
  // unmerged cell, or a merge whose members are all on the same row — a
  // simple rectangle either way) — and as the label's anchor too, absent
  // `labelBounds`.
  bounds: CellRect;
  // Outline of a merge spanning more than one row (a stepped/L shape).
  path?: string;
  // Where to centre the size/type label — defaults to `bounds`, but a
  // stepped or concave merge (see `mergedOutline`) wants its label
  // anchored on one of its own actual spans instead: `bounds`' centre,
  // the shape's plain bounding box, can fall in a notch the merge leaves
  // empty (wrapped around a cell that wasn't merged in, or just the gap
  // between two differently-sized stacked rows).
  labelBounds?: CellRect;
  // Plugin id of the attached kbrd.layout-key / kbrd.layout-space instance,
  // or null when this cell hasn't been assigned a kind yet.
  typeId?: string | null;
  // Keycap width as a multiple of the display's Unit, shown above the type
  // label. Undefined leaves that line out altogether, which is what the
  // callers use for a shape no single Unit describes: a merge, whose
  // footprint is all of its members together (see `Display`), and a cell
  // or division with nothing assigned to it yet.
  unit?: number;
  isSelected?: boolean;
  // A row's trailing empty space (or a fully empty row) rather than a real
  // cell — no `typeId` ever applies to it. Selecting it (to merge into, or
  // to paste a plugin onto) still shows green, but dashed rather than
  // solid, since there's nothing there yet.
  isEmpty?: boolean;
  isDropTarget?: boolean;
  // Layer mode's own drag destination (see `useKeyDrag`) — drawn as a
  // thick outline surrounding the whole shape, on top of whatever else it
  // already looks like (selected, empty…), so the drop target is
  // unambiguous regardless of the cell/division's own current state.
  isMoveTarget?: boolean;
  // False for a division whose border `Display` is instead drawing as
  // part of its own deduplicated pass over the whole division grid (see
  // `renderDivisions`) — two adjacent, both-dashed divisions each
  // stroking their own full outline would draw the exact same shared
  // edge twice, and since each shape's dash pattern starts counting from
  // its own path's own start point, the two independently-phased dashed
  // strokes can land out of sync and visually fill each other's gaps in,
  // reading as one solid line where neither one actually is.
  showBorder?: boolean;
  // Hides the size/type label text — Layer mode's own look, where the
  // cell shape stays but the Layout-only "1U · Key" caption underneath it
  // doesn't (see `Display`'s own `mode` prop).
  showText?: boolean;
  // The real `KeyPlugin` instances attached to this cell's own `keyRef`
  // (see `GridCell.keyRef`) — front to back, i.e. in the Plugins tab's own
  // order, where the topmost row is the frontmost element (this paints
  // them in reverse for that reason). Already resolved and sorted by
  // `Display`,
  // which is the one that actually knows about `layer.plugins`. Drawn in
  // Layer mode in place of the text label, each one's own `Renderer`
  // clipped to this cell's shape — the resting ("up") look only, no
  // press/down-state simulation (unlike `<Preview>`'s own interactive
  // keyboard, nothing here fakes pressing a key).
  keyPlugins?: KeyPlugin[];
  // This cell's own look, from the `kbrd.render-key` row of the Properties
  // tab (its Background and Border groups) — resolved by `Display`, the
  // one that knows about `layer.key_properties`. Undefined leaves the cell
  // with the grid's own chrome (a transparent fill and the dashed outline
  // below), which is also what an untouched key gets: Layer mode's own
  // look, since Layout mode is about the grid rather than about how a key
  // is painted.
  look?: KeyLook;
  onClick?: (event: MouseEvent<SVGGElement>) => void;
  // Right-click — opens this cell's own context menu (see `App`'s
  // `contextMenu`), after selecting it the same way a left click does.
  onContextMenu?: (event: MouseEvent<SVGGElement>) => void;
  onDragOver?: (event: DragEvent<SVGGElement>) => void;
  onDragLeave?: (event: DragEvent<SVGGElement>) => void;
  onDrop?: (event: DragEvent<SVGGElement>) => void;
  // Starts dragging this cell itself to move it elsewhere on the display
  // (see `Display`'s own pointer-based `handleCellPointerDown`/
  // `onMoveCell` — plain pointer events rather than native HTML5
  // drag-and-drop, which SVG elements support too inconsistently across
  // browsers to rely on). Only ever set for a plain, unmerged cell (a
  // merge's shape comes from all of its members together, so there's no
  // one well-defined place to drag *from*) — never for the row's own
  // empty space (nothing there to move).
  onPointerDown?: (event: PointerEvent<SVGGElement>) => void;
};

/** One SVG cell (or merged group of cells) in the grid `<Display>` lays
 * out over the display, and a drop target for the plugins dragged from
 * `<Inspector>`'s Plugins tab. */
export default function LayoutCell({
  bounds,
  path,
  labelBounds = bounds,
  typeId = null,
  unit,
  isSelected = false,
  isEmpty = false,
  isDropTarget = false,
  isMoveTarget = false,
  showBorder = true,
  showText = true,
  keyPlugins = [],
  look,
  onClick,
  onContextMenu,
  onDragOver,
  onDragLeave,
  onDrop,
  onPointerDown,
}: Props) {
  const clipId = useId();
  const type = typeId ? pluginById(typeId) : null;
  const stroke =
    isDropTarget || isMoveTarget
      ? "var(--kbrd-border-alt)"
      : isSelected
        ? SELECTED_STROKE
        : "var(--kbrd-border-color)";
  // Size, then the Layout plugin's own type — one per line. The Layer
  // plugin(s) attached via `pluginIds` used to get their own line(s) too,
  // but that grew this label too tall for a typical cell, so it's
  // deliberately left out here (still shown in Layer mode itself, via
  // each plugin's own `Renderer`).
  // The weight and the scale here are what the label is both measured
  // and drawn by — see `textWidthRatio` and `fitFontSize`, which need to
  // know the two lines aren't the same size before they can fit them as
  // one block.
  const labelParts: (FittedLine | null)[] = [
    typeof unit === "number"
      ? { text: `${unit}U`, bold: true, scale: 1 }
      : null,
    type ? { text: type.name, bold: false, scale: LABEL_TYPE_SCALE } : null,
  ];
  const labelLines = labelParts.filter((line) => line !== null);
  // Fitted to this cell rather than fixed, and to the box the label is
  // actually anchored in — which for a stepped merge is one of its own
  // spans, not the notched bounding box around the whole thing.
  const labelSize = fitFontSize(labelLines, labelBounds, {
    fill: LABEL_FILL,
    lineHeightRatio: LABEL_LINE_HEIGHT,
    min: LABEL_MIN_SIZE_MM,
  });
  // Each line's own size, and the drop from the line above it — taken at
  // the descending line's own size, the way `fitFontSize` counted the
  // block's height.
  const lineSizes = labelLines.map((line) => labelSize * (line.scale ?? 1));
  const lineDrops = lineSizes.map((size, index) =>
    index === 0 ? 0 : size * LABEL_LINE_HEIGHT,
  );
  // The baselines' own span, which is what gets centred in the cell.
  const labelSpan = lineDrops.reduce((total, drop) => total + drop, 0);
  // The key's own border, whenever it has one and nothing louder is
  // being said over it: a highlight (selection, either drop target) is
  // still the one thing that wins the outline, the same way it already
  // wins it from the grid's own chrome.
  const isHighlighted = isSelected || isDropTarget || isMoveTarget;
  const ownBorder = !isHighlighted && look?.borderEnabled ? look : null;
  const shapeProps = {
    fill: isDropTarget || isMoveTarget
      ? TARGET_FILL
      : (look?.backgroundColor ?? "transparent"),
    // `mergedOutline` can trace a shape wrapped all the way around a cell
    // that wasn't merged in, coming out as an outer subpath plus an inner
    // one for the hole — `evenodd` is what tells a filled version of that
    // shape to punch the hole rather than fill straight through it.
    fillRule: "evenodd" as const,
    stroke: ownBorder ? ownBorder.borderColor : stroke,
    // A real border of its own draws regardless of `showBorder`, which
    // only ever suppresses the *chrome* outline (see its own docblock: a
    // division whose dashed edge `Display` dedupes into one shared pass —
    // nothing it can dedupe a per-key border into).
    strokeWidth: ownBorder ? ownBorder.borderWidth : showBorder ? 1 : 0,
    // Selected stays dashed for empty space — there's no real cell there
    // yet, only a spot something could still be merged or pasted into.
    strokeDasharray: ownBorder
      ? BORDER_DASHES[ownBorder.borderStyle]
      : isSelected && !isEmpty
        ? undefined
        : "4 3",
    vectorEffect: "non-scaling-stroke" as const,
  };

  return (
    <g
      onClick={onClick}
      onContextMenu={onContextMenu}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      onPointerDown={onPointerDown}
      style={{ cursor: onPointerDown ? "grab" : "pointer" }}
    >
      {path ? (
        <path d={path} {...shapeProps} />
      ) : (
        <rect
          x={bounds.x}
          y={bounds.y}
          width={bounds.width}
          height={bounds.height}
          {...shapeProps}
        />
      )}
      {(isDropTarget || isMoveTarget) && (
        <text
          x={labelBounds.x + labelBounds.width / 2}
          y={labelBounds.y + labelBounds.height / 2}
          textAnchor="middle"
          dominantBaseline="middle"
          fontSize={TARGET_SYMBOL_SIZE_MM}
          fill="var(--kbrd-border-alt)"
          style={{ pointerEvents: "none" }}
        >
          {isMoveTarget ? MOVE_TARGET_SYMBOL : DROP_TARGET_SYMBOL}
        </text>
      )}
      {!showText && keyPlugins.length > 0 && (
        <>
          <defs>
            <clipPath id={clipId}>
              {path ? (
                <path d={path} />
              ) : (
                <rect
                  x={bounds.x}
                  y={bounds.y}
                  width={bounds.width}
                  height={bounds.height}
                />
              )}
            </clipPath>
          </defs>
          <g clipPath={`url(#${clipId})`} style={{ pointerEvents: "none" }}>
            {/* Painted back to front: the Plugins/Properties list reads
                top = frontmost (see `keyPlugins`), and SVG has no
                z-index — whatever is drawn last is what ends up on top.
                So the list's own order is walked in reverse here, which
                also puts `kbrd.render-key` (pinned last in that list, and
                drawn as the cell's own shape above) behind every plugin
                attached to it. */}
            {[...keyPlugins].reverse().map((instance) => {
              const plugin = pluginById(instance.plugin_id);
              if (!plugin) return null;
              const Renderer = plugin.Renderer;
              return (
                <Renderer
                  key={instance.id}
                  config={{
                    ...plugin.defaultConfig,
                    ...stateConfig(instance.config, DEFAULT_STATE_NAME),
                  }}
                  x={bounds.x}
                  y={bounds.y}
                  width={bounds.width}
                  height={bounds.height}
                />
              );
            })}
          </g>
        </>
      )}
      {showText && labelLines.length > 0 && (
        <text
          x={labelBounds.x + labelBounds.width / 2}
          y={labelBounds.y + labelBounds.height / 2 - labelSpan / 2}
          textAnchor="middle"
          dominantBaseline="middle"
          fontSize={labelSize}
          fill="var(--kbrd-border-alt)"
          style={{ pointerEvents: "none" }}
        >
          {labelLines.map((line, index) => (
            <tspan
              key={index}
              x={labelBounds.x + labelBounds.width / 2}
              dy={lineDrops[index]}
              fontSize={lineSizes[index]}
              fontWeight={line.bold ? "bold" : "normal"}
            >
              {line.text}
            </tspan>
          ))}
        </text>
      )}
    </g>
  );
}

type ResizeGripProps = {
  // The cell being resized — the grip sits centred on its right edge.
  bounds: CellRect;
  // The SVG's own scale (real screen pixels per mm — see `Display`), used
  // to size the grip in fixed pixels regardless of the grid's own scale.
  pxPerMm: number;
  onResizeStart: (event: PointerEvent<SVGGElement>) => void;
};

/**
 * A cell's drag-resize handle — rendered by `Display` as its own pass
 * *after* every cell in every row, so it always paints on top of them
 * (plain SVG document order otherwise puts a narrow-gap neighbour's own
 * border in front of a grip that overlaps it, since that neighbour is
 * later in the row).
 */
export function ResizeGrip({ bounds, pxPerMm, onResizeStart }: ResizeGripProps) {
  const gripHeight = pxPerMm > 0 ? GRIP_HEIGHT_PX / pxPerMm : 0;
  const gripWidth = pxPerMm > 0 ? GRIP_WIDTH_PX / pxPerMm : 0;
  const cx = bounds.x + bounds.width;
  const cy = bounds.y + bounds.height / 2;

  return (
    <g
      aria-label="Resize"
      onPointerDown={(event) => {
        event.stopPropagation();
        event.preventDefault();
        onResizeStart(event);
      }}
      onClick={(event) => event.stopPropagation()}
      style={{ cursor: "col-resize" }}
    >
      <rect
        x={cx - gripWidth / 2}
        y={cy - gripHeight / 2}
        width={gripWidth}
        height={gripHeight}
        rx={gripWidth / 2}
        fill={GRIP_BACKGROUND}
        stroke="var(--kbrd-border-color)"
        strokeWidth={1}
        vectorEffect="non-scaling-stroke"
      />
      <svg
        x={cx - gripWidth / 2}
        y={cy - gripHeight / 2}
        width={gripWidth}
        height={gripHeight}
        viewBox="0 0 24 24"
        fill="none"
        stroke="var(--mantine-color-dimmed)"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {GRIP_DOT_PATHS.map((d) => (
          <path key={d} d={d} />
        ))}
      </svg>
    </g>
  );
}
