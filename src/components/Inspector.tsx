import { useState, type ReactNode } from "react";
import {
  Accordion,
  ActionIcon,
  Box,
  Button,
  EmptyState,
  Group,
  Modal,
  ScrollArea,
  Stack,
  Tabs,
  Text,
  UnstyledButton,
} from "@mantine/core";
import {
  MdDelete,
  MdDragIndicator,
  MdHighlightAlt,
  MdUnfoldLess,
  MdUnfoldMore,
} from "react-icons/md";

import { pluginSummary, setDragSymbol, setPluginDragImage } from "../classes/inspectorHelpers";
import { useKeyInspector } from "../classes/useKeyInspector";
import State from "./menu/State";
import {
  SYSTEM_PLUGIN_ID,
  isDeletable,
  pluginById,
} from "../plugins/registry";
import { stateConfig, withStateConfig } from "../plugins/state";
import type { GridCell } from "../types/layout";
import LayoutCellProperties from "./LayoutCellProperties";
import StateEditor from "./modals/StateEditor";
import type { KeyPlugin, KeyProperty, LayerData } from "../types/layer";

// The three numbers the Plugins and Properties lists share, so switching
// tabs never moves or resizes what they have in common. `ROW_HEIGHT` is
// the Properties heading's own natural height (its 28px delete button plus
// 10px of padding either side) — the Plugins tab has no such button to
// grow its rows, so it states the same height by hand. `ROW_RULE` is the
// 1px each row is closed with: Mantine draws it on the accordion item,
// *outside* the heading, while a Plugins row draws it on itself.
/** The panel's own fixed width — stated here and read by `App`, which
 * opens its track to exactly that much and keeps the panel itself that
 * wide throughout, so it slides instead of stretching. */
export const INSPECTOR_PANEL_WIDTH = 280;

const GROUP_LABEL_SPACE = 45;
// The air above the first group of either tab, on top of the room its own
// label already carries — the list starts a little clear of the tab strip
// rather than hard against it. Stated once for both tabs, which have to
// start at the same height.
const LIST_TOP_SPACE = 15;
const ROW_HEIGHT = 48;
const ROW_RULE = 1;

/** The heading over one group of the Plugins/Properties lists, in the same
 * key as the property groups inside each editor — with the same room
 * above itself wherever it appears, so either tab's first group starts at
 * the same height. */
function GroupLabel({ children }: { children: ReactNode }) {
  return (
    <Text
      size="xs"
      fw={600}
      tt="uppercase"
      c="dimmed"
      px={15}
      pt={GROUP_LABEL_SPACE}
      pb={6}
      style={{ letterSpacing: "0.04em" }}
    >
      {children}
    </Text>
  );
}

type Props = {
  // Whether the panel is deployed. It renders its own tab either way —
  // that's what opens and closes it, and while closed it's the only part
  // of this in view (see `.inspector-tab` in App.css).
  opened: boolean;
  onToggle: () => void;
  layer: LayerData | null;
  selectedKey: string | null;
  tab: string | null;
  onTabChange: (tab: string | null) => void;
  onChange: (plugins: KeyPlugin[]) => void;
  // `selectedKey`'s own Layout plugin id (`kbrd.layout-key`/
  // `kbrd.layout-space`) — lets `useKeyInspector` tell a Key from a Space
  // for the system property row's own label, without a `layout`/geometry
  // lookup (see `App`'s own `selectedKeyTypeId`).
  selectedKeyTypeId: string | null;
  // Which form each plugin instance below shows: its Layout (placement) or
  // Layer (everything else) editor — see `kbrd-plugins`' per-plugin
  // `LayoutEditor`/`LayerEditor` exports.
  mode: "layout" | "layer";
  // The `<Display>` grid cell (or division of a divided one) currently
  // selected, only set in Layout mode — `cell` only needs to carry the
  // plugin-facing fields `LayoutCellProperties` actually reads, the same
  // for either kind of selection (see its own `PluginCell`).
  layoutSelection: {
    index: number;
    cell: Pick<GridCell, "typeId" | "typeConfig">;
  } | null;
  onLayoutCellChange: (
    index: number,
    patch: Partial<Pick<GridCell, "typeId" | "typeConfig">>,
  ) => void;
  onKeyPropertiesChange: (properties: KeyProperty[]) => void;
};

/**
 * Layout-mode Properties tab content for a selected `<Display>` cell, or
 * Layer-mode's Plugins/Properties tabs for `selectedKey` — see
 * `useKeyInspector` for everything behind the latter (which plugins/
 * properties a key has, and every mutation on them).
 *
 * Renders its own "Inspector" tab as well as the panel: the tab hangs off
 * the panel's left edge, so while the panel is pushed off-screen the tab
 * is all that shows, sitting on the window's right edge — that's what
 * opens it. Same arrangement as the Media panel, mirrored.
 *
 * Neither tab has anything to show without a layout — Plugins has nothing
 * to drag onto, Properties nothing to select — so with none at all this
 * isn't mounted: `App` drops both side panels, tab included, leaving the
 * Composer's own "No layout yet" alone on screen. Nothing here has to
 * account for that case.
 */
export default function Inspector({
  opened,
  onToggle,
  layer,
  selectedKey,
  tab,
  onTabChange,
  onChange,
  selectedKeyTypeId,
  mode,
  layoutSelection,
  onLayoutCellChange,
  onKeyPropertiesChange,
}: Props) {
  const inspector = useKeyInspector({
    layer,
    selectedKey,
    selectedKeyTypeId,
    mode,
    onChange,
    onKeyPropertiesChange,
  });
  const {
    deleting,
    setDeleting,
    dropIndicator,
    setDropIndicator,
    draggedPropertyId,
    setDraggedPropertyId,
    draggablePlugins,
    pluginCategories,
    instances,
    propertyConfig,
    targetType,
    systemPluginName,
    activeState,
    activeStateConfig,
    setActiveState,
    setStateConfig,
    addState,
    renameState,
    deleteState,
    patch,
    reorder,
    remove,
  } = inspector;
  // The element's own form lives in a plugin like any other now
  // (`kbrd.render-key`), it's just not one that can be attached or
  // detached — see its manifest's `deletable` and `isDeletable`.
  const systemPlugin = pluginById(SYSTEM_PLUGIN_ID);
  const SystemEditor = systemPlugin?.LayerEditor;
  const systemPluginDeletable = systemPlugin ? isDeletable(systemPlugin) : true;
  // "add"/"edit" while the States menu's own modal is open, `null`
  // otherwise — see `StateEditor`.
  const [stateEditorMode, setStateEditorMode] = useState<"add" | "edit" | null>(
    null,
  );
  // Which Properties rows are open, as the Accordion item values they are
  // keyed by (a plugin instance's own id, or "system"). Held here rather
  // than left to each group's own Accordion, so the expand/collapse
  // button facing the state picker can work the whole tab at once.
  const [openProperties, setOpenProperties] = useState<string[]>([]);

  // One plugin instance's own row in the Properties list — its own
  // function so each category group below can render its own list of
  // them (see `propertyGroups`), rather than one flat map over the lot.
  function renderInstance(item: KeyPlugin) {
    const plugin = pluginById(item.plugin_id);
    if (!plugin) return null;
    // This branch of the Properties tab only renders in Layer
    // mode — see the `mode === "layout"` split above.
    const Editor = plugin.LayerEditor;
    const summary = pluginSummary(item);
    const definedConfig = stateConfig(item.config, activeState);
    const currentConfig = {
      ...plugin.defaultConfig,
      ...definedConfig,
    };
    return (
      <Accordion.Item
        key={item.id}
        value={String(item.id)}
        style={{
          position: "relative",
        }}
        onDragOver={(event) => {
          if (
            draggedPropertyId !== null &&
            pluginById(
              instances.find(
                (instance) => instance.id === draggedPropertyId,
              )?.plugin_id ?? "",
            )?.category === plugin.category &&
            event.dataTransfer.types.includes(
              "application/kbrd-property",
            )
          ) {
            event.preventDefault();
            event.dataTransfer.dropEffect = "move";
            const bounds = event.currentTarget.getBoundingClientRect();
            setDropIndicator({
              id: item.id,
              edge:
                event.clientY < bounds.top + bounds.height / 2
                  ? "before"
                  : "after",
            });
          } else {
            setDropIndicator(null);
          }
        }}
        onDragLeave={(event) => {
          if (
            !event.currentTarget.contains(
              event.relatedTarget as Node | null,
            )
          ) {
            setDropIndicator((value) =>
              value?.id === item.id ? null : value,
            );
          }
        }}
        onDrop={(event) => {
          const draggedId = Number(
            event.dataTransfer.getData("application/kbrd-property"),
          );
          if (!Number.isNaN(draggedId)) {
            event.preventDefault();
            const edge =
              dropIndicator?.id === item.id
                ? dropIndicator.edge
                : "before";
            setDropIndicator(null);
            void reorder(draggedId, item.id, edge);
          }
        }}
      >
        {dropIndicator?.id === item.id && (
          <Box
            aria-hidden
            style={{
              position: "absolute",
              zIndex: 10,
              left: 0,
              right: 0,
              [dropIndicator.edge === "before" ? "top" : "bottom"]:
                -1,
              height: 1,
              pointerEvents: "none",
              // The app's own "this is the one" green, the same a
              // selected cell is outlined in — a drop mark is a
              // destination, not another rule in the list.
              backgroundColor: "var(--kbrd-color-selected)",
            }}
          />
        )}
        <Group
          className="inspector-accordion-heading"
          gap={0}
          wrap="nowrap"
          h={ROW_HEIGHT}
        >
          <Box
            draggable
            // The only spacing this row states by hand: the room between
            // the grip and the name it belongs to. Everything around it
            // comes from the heading's own padding.
            pr={10}
            onDragStart={(event) => {
              event.stopPropagation();
              event.dataTransfer.effectAllowed = "move";
              event.dataTransfer.setData(
                "application/kbrd-property",
                String(item.id),
              );
              setDraggedPropertyId(item.id);
              setDragSymbol(event);
            }}
            onDragEnd={() => {
              setDraggedPropertyId(null);
              setDropIndicator(null);
            }}
          >
            <MdDragIndicator
              aria-label={`Move ${plugin.name}`}
              style={{ cursor: "grab", display: "block" }}
            />
          </Box>
          <Accordion.Control
            style={{ flex: 1, paddingLeft: 0 }}
          >
            <Text truncate>
              {plugin.name}
              {summary && ` (${summary})`}
            </Text>
          </Accordion.Control>
          <ActionIcon
            color="red"
            variant="subtle"
            aria-label={`Delete ${plugin.name}`}
            onClick={() => setDeleting(item)}
          >
            <MdDelete />
          </ActionIcon>
        </Group>
        <Accordion.Panel className="property-editor-panel">
          <Editor
            config={currentConfig}
            definedConfig={definedConfig}
            targetType={targetType}
            onChange={(config) =>
              patch(item, {
                config: withStateConfig(item.config, activeState, config),
              })
            }
          />
        </Accordion.Panel>
      </Accordion.Item>
    );
  }

  // The element's own form, pinned at the end of its own category's
  // group: it is what every plugin in the list draws on top of (see
  // `LayoutCell` in kbrd-web), and it is also why that group is never
  // empty.
  const systemItem = (
    <Accordion.Item value="system">
      <Group
        className="inspector-accordion-heading"
        gap={0}
        wrap="nowrap"
        h={ROW_HEIGHT}
      >
        <Box
          pr={10}
          aria-label={`Move ${systemPluginName} disabled`}
          aria-disabled="true"
        >
          <MdDragIndicator
            style={{
              cursor: "not-allowed",
              display: "block",
              opacity: 0.35,
            }}
          />
        </Box>
        <Accordion.Control style={{ flex: 1, paddingLeft: 0 }}>
          {systemPluginName}
        </Accordion.Control>
        <ActionIcon
          color="red"
          variant="transparent"
          aria-label={`Delete ${systemPluginName} disabled`}
          disabled={!systemPluginDeletable}
          style={{ backgroundColor: "transparent" }}
        >
          <MdDelete />
        </ActionIcon>
      </Group>
      {targetType === "key" && SystemEditor && (
        <Accordion.Panel className="property-editor-panel">
          {/* Assembled exactly like a plugin instance's own
              panel above: the complete view to render from,
              plus what the state actually stores so the editor
              can tell a set field from an unset one. */}
          <SystemEditor
            config={{
              ...systemPlugin?.defaultConfig,
              ...activeStateConfig,
            }}
            definedConfig={activeStateConfig}
            targetType={targetType}
            onChange={(config) => setStateConfig(config)}
          />
        </Accordion.Panel>
      )}
    </Accordion.Item>
  );

  // The Properties list split by plugin category — one labelled group
  // each, in the registry's own order (`pluginCategories`), with anything
  // it doesn't name following alphabetically. A category with nothing in
  // it isn't shown at all; the system plugin's own (Display) always has
  // at least its own row, so that one always is. Reordering by drag is
  // already category-bound (see `renderInstance`'s `onDragOver`), so this
  // only draws a grouping the list already had.
  const systemCategory = systemPlugin?.category;
  const propertyGroups = (() => {
    const grouped = new Map<string, KeyPlugin[]>();
    if (systemCategory) grouped.set(systemCategory, []);
    for (const item of instances) {
      const category = pluginById(item.plugin_id)?.category;
      // A plugin the registry no longer knows has no group to go in —
      // `renderInstance` draws nothing for it either.
      if (!category) continue;
      grouped.set(category, [...(grouped.get(category) ?? []), item]);
    }
    const rank = (category: string) => {
      const index = pluginCategories.indexOf(category);
      return index === -1 ? pluginCategories.length : index;
    };
    return [...grouped.entries()]
      .map(([category, items]) => ({ category, items }))
      .sort(
        (left, right) =>
          rank(left.category) - rank(right.category) ||
          left.category.localeCompare(right.category),
      );
  })();

  // The Accordion item values one group owns: a row per plugin instance,
  // plus the system row in whichever group it's pinned to. Each group
  // keeps its own Accordion (see below), so `openProperties` is split
  // back out per group with this, and put back together the same way.
  const groupValues = ({
    category,
    items,
  }: {
    category: string;
    items: KeyPlugin[];
  }) => [
    ...items.map((item) => String(item.id)),
    ...(category === systemCategory ? ["system"] : []),
  ];
  const allPropertyValues = propertyGroups.flatMap(groupValues);
  // "All open" is what turns the expand button into a collapse one. An
  // empty list can't be expanded, so it never counts as open.
  const allPropertiesOpen =
    allPropertyValues.length > 0 &&
    allPropertyValues.every((value) => openProperties.includes(value));

  return (
    <>
      <UnstyledButton
        className="inspector-tab"
        aria-expanded={opened}
        aria-label={opened ? "Close inspector" : "Open inspector"}
        onClick={onToggle}
      >
        Inspector
      </UnstyledButton>

      {/* Closed, the panel is still mounted (it has to be, to slide) but
          off-screen — `inert` keeps it out of the tab order and off the
          accessibility tree while it is. The tab above isn't inside it,
          so it stays reachable. */}
      <ScrollArea
        className="inspector-scroll"
        inert={!opened}
        h="100%"
        bg="var(--kbrd-color-body)"
        p={0}
        type="scroll"
        scrollbarSize={1}
        // The scrollbar sits on the panel's own left edge, over the rule
        // that separates the Inspector from the Composer — see
        // `.inspector-scroll` in `App.css`, which draws that rule.
        verticalScrollbarPosition="left"
        // Mantine insets the thumb by a fifth of the scrollbar's size; at
        // 1px that would leave it sub-pixel, so the track keeps none.
        styles={{
          scrollbar: { padding: 0, zIndex: 2 },
          // Mantine lays the content out as a table, which is only as tall
          // as it needs to be; the tabs below have to reach the bottom of
          // the panel instead, so the Properties tab's empty state can be
          // centred on the panel's own height (see `.inspector-scroll` in
          // App.css). A *minimum* rather than a fixed height, so a full
          // list still grows past it and scrolls.
          content: {
            minHeight: "100%",
            display: "flex",
            flexDirection: "column",
          },
        }}
      >
        {/* The room above the tabs is the panel's, not its container's, so
            the scrollbar runs the full height of the Inspector rather than
            starting at the tabs. It scrolls away with the content. */}
        <Tabs
          pt={40}
          className="panel-tabs"
          value={tab}
          onChange={onTabChange}
          variant="outline"
        >
          <Tabs.List grow>
            <Tabs.Tab value="plugins">Plugins</Tabs.Tab>
            <Tabs.Tab value="properties">Properties</Tabs.Tab>
          </Tabs.List>

          <Tabs.Panel value="plugins" pb="lg">
            {!layer ? (
              <Text c="dimmed">Create a layer to add plugins.</Text>
            ) : (
              // One labelled group per category, no accordion: with two of
              // them (Display and Invoke in Layer mode, Layout alone in
              // Layout mode) there is nothing to fold away, and a list you
              // drag *from* is worth having permanently in view.
              // `pluginCategories` is derived from the plugins themselves,
              // so a category shown here always has at least one row.
              <Stack gap={0} pt={LIST_TOP_SPACE}>
                {pluginCategories.map((category) => {
                  const categoryPlugins = draggablePlugins.filter(
                    (plugin) => plugin.category === category,
                  );
                  return (
                    <Box key={category}>
                      <GroupLabel>{category}</GroupLabel>
                      {/* Closed at the top, each row closed at the bottom —
                          the same rules the Properties tab's own lists are
                          drawn with. */}
                      <Box
                        style={{
                          borderTop: "1px solid var(--kbrd-rule-color)",
                        }}
                      >
                        {categoryPlugins.map((plugin) => (
                          <Box
                            key={plugin.id}
                            // The Properties heading's own height plus the
                            // rule below it, which that list draws on its
                            // accordion item rather than on the heading —
                            // here the row carries both (Mantine boxes are
                            // `border-box`). Same 10px padding as well.
                            h={ROW_HEIGHT + ROW_RULE}
                            p={10}
                            draggable
                            style={{
                              borderBottom: "1px solid var(--kbrd-rule-color)",
                              // Without this, starting the drag with a
                              // left click paints a native text/element
                              // selection highlight over the row instead
                              // of (or alongside) the custom drag ghost.
                              userSelect: "none",
                              WebkitUserSelect: "none",
                              WebkitUserDrag: "element",
                            }}
                            onDragStart={(event) => {
                              // "move" (not "copy") so the browser's own
                              // cursor badge doesn't show a "+" — dropping
                              // a plugin here doesn't remove it from this
                              // list either way, "move" is just the cursor
                              // this app wants.
                              event.dataTransfer.effectAllowed = "move";
                              event.dataTransfer.setData(
                                "application/kbrd-plugin",
                                plugin.id,
                              );
                              setPluginDragImage(event, plugin.name);
                            }}
                          >
                            {/* 10px between the grip and the name, as in
                                the Properties tab's own rows. */}
                            <Group
                              gap={10}
                              wrap="nowrap"
                              // Centred in whatever the fixed row leaves,
                              // rather than sitting on its top padding.
                              align="center"
                              h="100%"
                            >
                              <MdDragIndicator
                                aria-label="Move plugin"
                                style={{ cursor: "grab", flexShrink: 0 }}
                              />
                              {/* The palette's loudest foreground, not
                                  its body grey: this is the list you drag
                                  from, and the name is its content rather
                                  than its chrome. */}
                              <Text c="var(--kbrd-color-contrast)">
                                {plugin.name}
                              </Text>
                            </Group>
                          </Box>
                        ))}
                      </Box>
                    </Box>
                  );
                })}
              </Stack>
            )}
          </Tabs.Panel>

          <Tabs.Panel value="properties" pb="lg">
            {mode === "layout" ? (
              !layoutSelection ? (
                <EmptyState
                  className="inspector-empty"
                  px={15}
                  icon={<MdHighlightAlt size={28} />}
                  title="No item selected"
                  description={
                    <>
                      Select a cell to
                      <br />
                      edit its properties
                    </>
                  }
                />
              ) : (
                <LayoutCellProperties
                  cell={layoutSelection.cell}
                  onChange={(patch) =>
                    onLayoutCellChange(layoutSelection.index, patch)
                  }
                />
              )
            ) : !selectedKey ? (
              <EmptyState
                className="inspector-empty"
                px={15}
                icon={<MdHighlightAlt size={28} />}
                title="No item selected"
                description={
                  <>
                    Select a cell to
                    <br />
                    edit its properties
                  </>
                }
              />
            ) : (
              <Stack
                key={selectedKey}
                gap={0}
                pt={LIST_TOP_SPACE}
                style={{ position: "relative" }}
              >
                {/* Neither control takes a row of its own — the Plugins tab
                    has no such pair, and the first label of either list has
                    to sit at the same height — so they're positioned out of
                    the flow, in the room the first group label's own top
                    padding leaves above it. They sit on the list's own
                    `LIST_TOP_SPACE`, well clear of that label: both apply
                    to the whole key rather than to the group below them. */}
                <Group
                  justify="space-between"
                  px={15}
                  style={{
                    position: "absolute",
                    top: LIST_TOP_SPACE,
                    left: 0,
                    right: 0,
                  }}
                >
                  {/* Facing the state picker across that same row: opens
                      every row of every group at once, and closes them all
                      again once they are open. */}
                  <UnstyledButton
                    className="icon-toggle"
                    aria-label={
                      allPropertiesOpen
                        ? "Collapse all properties"
                        : "Expand all properties"
                    }
                    onClick={() =>
                      setOpenProperties(
                        allPropertiesOpen ? [] : allPropertyValues,
                      )
                    }
                  >
                    {allPropertiesOpen ? (
                      <MdUnfoldLess size={16} />
                    ) : (
                      <MdUnfoldMore size={16} />
                    )}
                  </UnstyledButton>
                  <State
                    states={propertyConfig.states}
                    activeState={activeState}
                    onSelect={setActiveState}
                    onAdd={() => setStateEditorMode("add")}
                    onEdit={() => setStateEditorMode("edit")}
                    onDelete={() => deleteState(activeState)}
                  />
                </Group>
                {propertyGroups.map((group) => {
                  const values = groupValues(group);
                  const { category, items } = group;
                  return (
                    // `property-group` so `App.css` can tell the last group
                    // from the rest — see its own rule on the room an opened
                    // row leaves below itself.
                    <Box key={category} className="property-group">
                      <GroupLabel>{category}</GroupLabel>
                      {/* One accordion per group rather than one for the
                          whole list: what's open in a group is its own
                          business, and the rule each list closes itself with
                          at the top is drawn on its own first item (see
                          `.property-accordion` in `App.css`). Each reports
                          only its own rows, so the tab-wide list keeps every
                          other group's rows as they were. */}
                      <Accordion
                        multiple
                        className="property-accordion"
                        value={openProperties.filter((value) =>
                          values.includes(value),
                        )}
                        onChange={(next) =>
                          setOpenProperties((current) => [
                            ...current.filter(
                              (value) => !values.includes(value),
                            ),
                            ...next,
                          ])
                        }
                      >
                        {items.map(renderInstance)}
                        {category === systemCategory && systemItem}
                      </Accordion>
                    </Box>
                  );
                })}
              </Stack>
            )}
          </Tabs.Panel>
        </Tabs>

        <Modal
          opened={deleting !== null}
          onClose={() => setDeleting(null)}
          title={<Text fw={700}>Delete plugin</Text>}
          centered
          size="sm"
        >
          <Stack>
            <Text>
              Permanently delete{" "}
              <Text component="span" fw={600}>
                {deleting ? pluginById(deleting.plugin_id)?.name : "this plugin"}
              </Text>
              ?
            </Text>
            <Group justify="flex-end">
              <Button color="gray" onClick={() => setDeleting(null)}>
                Cancel
              </Button>
              <Button
                color="red"
                leftSection={<MdDelete size={16} />}
                onClick={() => deleting && void remove(deleting)}
              >
                Delete
              </Button>
            </Group>
          </Stack>
        </Modal>

        {stateEditorMode && (
          <StateEditor
            mode={stateEditorMode}
            states={propertyConfig.states}
            editingState={stateEditorMode === "edit" ? activeState : undefined}
            onClose={() => setStateEditorMode(null)}
            onSubmit={(name, copyFrom) => {
              if (stateEditorMode === "add") addState(name, copyFrom);
              else renameState(activeState, name, copyFrom);
              setStateEditorMode(null);
            }}
          />
        )}
      </ScrollArea>
    </>
  );
}
