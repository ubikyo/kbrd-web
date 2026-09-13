import { EmptyState, Stack } from "@mantine/core";
import { MdTune } from "react-icons/md";

import { pluginById } from "../plugins/registry";
import type { GridCell } from "../types/layout";

// Just the plugin-facing slice of a cell — matches `GridCell` and a
// division of a divided cell (`DivisionCell`) alike, since neither this
// component nor any `LayoutEditor` it renders ever reads `unit`,
// `pluginIds`, or (`GridCell` only) `divide`.
type PluginCell = Pick<GridCell, "typeId" | "typeConfig">;

type Props = {
  cell: PluginCell;
  onChange: (patch: Partial<PluginCell>) => void;
};

/**
 * Layout-mode Properties tab content for a selected `<Display>` cell (or
 * division of a divided one): whatever its own Layout plugin
 * (kbrd.layout-key / kbrd.layout-space) exposes — its Unit is set by
 * dragging the cell's own resize handle in `<Display>` instead, and
 * Merge/Unmerge/Divide/Remove now live in Display's own top-right
 * Actions menu (see `App`) rather than here.
 *
 * The plugin's own name isn't shown: what a Layout editor renders is a
 * property block that carries its own header (see `layout-key`'s
 * `Type`), so naming the plugin above it stacked two headings on one
 * field.
 */
export default function LayoutCellProperties({ cell, onChange }: Props) {
  const TypeLayoutEditor = cell.typeId
    ? pluginById(cell.typeId)?.LayoutEditor
    : undefined;

  // Outside the `Stack`, not in it: the empty state fills the panel the
  // way `Inspector`'s own "No item selected" one does, which it can only
  // do as a direct child of the flex column the panel's content is.
  if (!TypeLayoutEditor)
    return (
      <EmptyState
        className="inspector-empty"
        px={15}
        icon={<MdTune size={28} />}
        title="Nothing to configure"
        description="This cell has no properties"
      />
    );

  return (
    <Stack gap="md">
      <TypeLayoutEditor
        config={cell.typeConfig}
        onChange={(config) => onChange({ typeConfig: config })}
      />
    </Stack>
  );
}
