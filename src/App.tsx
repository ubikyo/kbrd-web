import {
  AppShell,
  Box,
  Button,
  Group,
  Modal,
  Stack,
  Text,
} from "@mantine/core";

import { MdDelete } from "react-icons/md";

import { useCallback, useEffect, useRef, useState } from "react";

import LayoutEditor from "./components/modals/LayoutEditor";
import type { FactoryLayout, LayoutData } from "./types/layout";

import Composer from "./components/Composer";
import Header from "./components/Header";
import Inspector, { INSPECTOR_PANEL_WIDTH } from "./components/Inspector";
import Media, { MEDIA_PANEL_WIDTH } from "./components/Media";
import Settings from "./components/modals/Settings";
import LayerEditor from "./components/modals/LayerEditor";
import ReplaceEntity from "./components/modals/ReplaceEntity";
import Confirmation from "./components/modals/Confirmation";
import { updateFactoryLayout } from "./api/layers";
import { maxItems } from "./utils/layout";
import type { LayerData } from "./types/layer";
import { useDisplayGrid } from "./classes/useDisplayGrid";
import { useDisplaySettings } from "./classes/useDisplaySettings";
import { useEntityEditors } from "./classes/useEntityEditors";
import {
  loadInspectorPanel,
  loadMediaPanel,
  loadStartupMode,
  saveInspectorPanel,
  saveMediaPanel,
  saveStartupMode,
  type PanelState,
  type StartupMode,
} from "./utils/preferences";

// How long `<Display>`'s grid sits idle before its disposition is
// autosaved onto the current layout — see the effect below.
const FACTORY_LAYOUT_AUTOSAVE_MS = 600;

export default function App() {
  const [layout, setLayout] = useState<LayoutData | null>(null);
  // Every Layout/Layer that currently exists — fed by `<Layout>`/`<Layer>`'s
  // own `onItemsChange`, read only by `useEntityEditors`' "Replace with
  // current" picker.
  const [layoutItems, setLayoutItems] = useState<LayoutData[]>([]);
  const [layerItems, setLayerItems] = useState<LayerData[]>([]);
  const { layoutSettings, setLayoutSettings, saveDisplaySettings } =
    useDisplaySettings();

  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  // `selectedKey`'s own Layout plugin id (`kbrd.layout-key`/
  // `kbrd.layout-space`) — set in lockstep with it below, so the
  // Inspector can tell a Key from a Space without needing its own
  // reverse lookup from `keyRef` back to a `GridCell`/`DivisionCell`.
  const [selectedKeyTypeId, setSelectedKeyTypeId] = useState<string | null>(
    null,
  );

  const [layer, setLayer] = useState<LayerData | null>(null);

  const [settingsOpened, setSettingsOpened] = useState(false);
  // The two side panels, each toggled from its own tab — the one thing of
  // either that stays in view while it's closed (see `Media`/`Inspector`).
  // Closed, a panel takes no room at all: the Composer (`flex: 1`) gets
  // its width back. Both start wherever Settings' "On open" tab says; that
  // preference is only ever read here, toggling a panel doesn't rewrite
  // it.
  const [mediaPanel, setMediaPanel] = useState<PanelState>(loadMediaPanel);
  const [inspectorPanel, setInspectorPanel] =
    useState<PanelState>(loadInspectorPanel);
  const [mediaOpened, setMediaOpened] = useState(() => mediaPanel === "open");
  const [inspectorOpened, setInspectorOpened] = useState(
    () => inspectorPanel === "open",
  );

  // Which form the Inspector's plugin editors show — see `mode` on
  // `Inspector`'s props and each plugin's `LayoutEditor`/`MappingEditor`.
  const [mode, setMode] = useState<"layout" | "mapping">("layout");

  // Settings' Preferences tab — "On open, open". Mapping mode only means
  // anything once a layout is actually loaded (it maps *that* layout's
  // keys), so "Mapping" is applied on the first layout to arrive rather
  // than at mount, and only ever once: switching layouts afterwards must
  // not drag the user back out of whichever mode they've since picked.
  const [startupMode, setStartupMode] = useState<StartupMode>(loadStartupMode);
  const startupModeApplied = useRef(false);

  const [inspectorTab, setInspectorTab] = useState<string | null>("plugins");
  // Settings' Developer tab — on for now, while the app is still being
  // built: it restores plain HTML page behaviour (native context menu,
  // selectable text) that the app otherwise suppresses.
  const [debug, setDebug] = useState(true);
  // Mirrors `layer` for the autosave effect below, so that effect only
  // has to depend on the grid state that actually triggers a save — not
  // on `layer` itself, which the save's own response also updates.
  const layerRef = useRef<LayerData | null>(null);
  // Mirrors `layout` so `changeLayout` can tell a genuine switch (a
  // different layout's id) from a same-layout refresh (the Layout editor's
  // `onSaved` re-fetching this same layout after an edit) — see there.
  const layoutRef = useRef<LayoutData | null>(null);

  const computedGridItemsY = maxItems(
    layoutSettings.physicalHeightMm,
    layoutSettings.unitMm,
    layoutSettings.gapMm,
  );
  // The current layout's own Max height (1U) override — see the Layout
  // editor's Geometry tab — clamped to what actually still fits in case
  // Caps size/Gap size/the display's own size changed since it was set.
  const gridItemsY =
    layout?.max_rows != null
      ? Math.min(layout.max_rows, computedGridItemsY)
      : computedGridItemsY;

  // `<Display>`'s whole grid — cells, rows, merges, and every selection
  // (cell/division/row/display) — plus every operation that reads or
  // writes them. Read directly by `Inspector` (the Properties tab) as
  // well as `<Composer>` (the display's own chrome/shortcuts/undo), so it
  // stays lifted here rather than inside either one.
  const grid = useDisplayGrid({ layoutSettings, gridItemsY });

  // Mapping mode's own "which key" for the Inspector's Plugins/Properties
  // tabs — whichever cell/division `<Composer>`'s `<Display>` has
  // selected (the same grid both modes share — see `Display`'s own
  // docblock), read by its own `keyRef` (see `GridCell.keyRef`): that's
  // the real reference a Render/Invoke `KeyPlugin` actually attaches to,
  // not the cell's own synthetic id. `null` while nothing selected has one
  // yet (an untyped cell, or a fresh save from before this field existed).
  useEffect(() => {
    if (mode !== "mapping") return;
    setSelectedKey(
      grid.divisionSelection?.cell.keyRef ?? grid.layoutSelection?.cell.keyRef ?? null,
    );
    setSelectedKeyTypeId(
      grid.divisionSelection?.cell.typeId ?? grid.layoutSelection?.cell.typeId ?? null,
    );
  }, [mode, grid.divisionSelection, grid.layoutSelection]);

  useEffect(() => {
    if (startupModeApplied.current || layout == null) return;
    startupModeApplied.current = true;
    if (startupMode === "mapping") setMode("mapping");
  }, [layout, startupMode]);

  const entityEditors = useEntityEditors({ layout, layer, layoutItems, layerItems });

  const changeLayout = useCallback(
    (value: LayoutData | null) => {
      // The Layout editor's `onSaved` refreshes this same layout's own row
      // (e.g. a changed Max width/height, Caps size…) by re-fetching it, not
      // by switching to a different one — `Layout.refresh(id)` calls this
      // with a freshly-fetched object that still carries the same `id`. The
      // active layer and everything on the display must survive that; only
      // an actual switch (a different id, or none at all) should wipe them.
      const isSameLayout =
        layoutRef.current !== null &&
        value !== null &&
        layoutRef.current.id === value.id;
      setLayout(value);
      layoutRef.current = value;
      // Each layout keeps its own Caps size / Gap size — load them back in
      // now that we've switched to it, or reset to the reference panel once
      // there's no layout left to show them for. The physical screen's
      // width/height are *not* touched here (see `useDisplaySettings`):
      // they're the same for every layout, not per-layout.
      setLayoutSettings((current) => ({
        ...current,
        unitMm: value?.unit_mm ?? current.unitMm,
        gapMm: value?.gap_mm ?? current.gapMm,
      }));
      if (isSameLayout) return;
      setLayer(null);
      layerRef.current = null;
      setSelectedKey(null);
      // The layer `<Layer>` activates next (see its effect) seeds
      // these back in via `changeLayer` — this is just the gap between
      // layouts.
      grid.loadFactoryLayout(null);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const changeLayer = useCallback(
    (value: LayerData | null) => {
      setLayer(value);
      layerRef.current = value;
      setSelectedKey(null);
      // Each layer keeps its own `<Display>` disposition — load it back
      // in now that we've switched to it.
      grid.loadFactoryLayout(value?.factory_layout ?? null);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  // The browser's own right-click context menu is never wanted anywhere
  // in the app — `<Composer>` already shows its own for a cell/division/
  // row/display in Layout mode, but this covers every other case too
  // (Mapping mode, the header, the Inspector panel, Settings…), where
  // nothing else calls `preventDefault()` on it. Debug mode (Settings'
  // Developer tab) is the one exception: the page then behaves like any
  // other HTML page, native context menu and all, so the browser's own
  // element inspector is reachable.
  useEffect(() => {
    if (debug) return;
    function handleContextMenu(event: MouseEvent) {
      event.preventDefault();
    }
    window.addEventListener("contextmenu", handleContextMenu);
    return () => window.removeEventListener("contextmenu", handleContextMenu);
  }, [debug]);

  // The other half of debug mode: `body`'s app-wide `user-select: none`
  // (see App.css) is lifted so text can be selected like anywhere else.
  useEffect(() => {
    document.body.classList.toggle("debug", debug);
    return () => document.body.classList.remove("debug");
  }, [debug]);

  function changePlugins(plugins: LayerData["plugins"]) {
    setLayer((value) => (value ? { ...value, plugins } : null));
  }

  function changeKeyProperties(keyProperties: LayerData["key_properties"]) {
    setLayer((value) =>
      value ? { ...value, key_properties: keyProperties } : null,
    );
  }

  // Autosaves `<Display>`'s disposition onto the current layer's own
  // `factory_layout` — debounced so a drag-resize or a run of clicks
  // doesn't fire one PUT per change. Skipped for the run right after
  // `changeLayer` seeds this same state from what's already saved (see
  // `grid.skipAutosaveRef`), and reads `layerRef` rather than `layer` so
  // this save's own response (a fresh `setLayer`) doesn't re-trigger
  // itself.
  useEffect(() => {
    const current = layerRef.current;
    if (!current) return;
    if (grid.skipAutosaveRef.current) {
      grid.skipAutosaveRef.current = false;
      return;
    }
    const factoryLayout: FactoryLayout = {
      rowOverrides: grid.rowOverrides,
      cells: grid.cells,
      mergeGroups: grid.mergeGroups,
    };
    const timeout = setTimeout(() => {
      void updateFactoryLayout(current.id, factoryLayout).then((updated) => {
        setLayer(updated);
        layerRef.current = updated;
      });
    }, FACTORY_LAYOUT_AUTOSAVE_MS);
    return () => clearTimeout(timeout);
  }, [grid.cells, grid.rowOverrides, grid.mergeGroups, grid.skipAutosaveRef]);

  return (
    <AppShell header={{ height: 64 }} padding={0}>
      <Header
        layoutMenuRef={entityEditors.layoutMenuRef}
        onLayoutChange={changeLayout}
        onAddLayout={entityEditors.openAddLayout}
        onLayoutItemsChange={setLayoutItems}
        onOpenSettings={() => setSettingsOpened(true)}
      />

      <Settings
        opened={settingsOpened}
        onClose={() => setSettingsOpened(false)}
        settings={layoutSettings}
        onSave={saveDisplaySettings}
        debug={debug}
        onDebugChange={setDebug}
        startupMode={startupMode}
        onStartupModeChange={(next) => {
          setStartupMode(next);
          saveStartupMode(next);
        }}
        mediaPanel={mediaPanel}
        onMediaPanelChange={(next) => {
          setMediaPanel(next);
          saveMediaPanel(next);
        }}
        inspectorPanel={inspectorPanel}
        onInspectorPanelChange={(next) => {
          setInspectorPanel(next);
          saveInspectorPanel(next);
        }}
      />

      <AppShell.Main
        bg="var(--kbrd-color-body)"
        style={{
          height: "100vh",
        }}
      >
        {/* A panel either side of the Composer, which takes whatever's
            left: the Media panel (200px) on the far left, the Inspector
            (280px) on the right. Each slides in from its own edge and
            gives its room back when closed — see `.media-panel` /
            `.inspector-panel` in App.css. */}
        <Box
          style={{
            position: "relative",
            display: "flex",
            height: "calc(100vh - 64px)",
            overflow: "hidden",
          }}
        >
          {/* Always mounted — its track is what opens and closes (200px
              to none), while the panel itself slides in from off-screen
              left. Both run on the same transition, so the panel's right
              edge never leaves the track's: the Composer takes up the
              room at exactly the rate the panel leaves it. See
              `.media-panel` in App.css. */}
          <Box
            className="media-panel"
            data-opened={mediaOpened || undefined}
            style={{ flexBasis: mediaOpened ? MEDIA_PANEL_WIDTH : 0 }}
          >
            <Box
              className="media-panel-inner"
              style={{ width: MEDIA_PANEL_WIDTH }}
            >
              <Media
                opened={mediaOpened}
                onToggle={() => setMediaOpened((opened) => !opened)}
              />
            </Box>
          </Box>
          <Box style={{ flex: 1, minWidth: 0, height: "100%" }}>
            <Composer
              layoutSettings={layoutSettings}
              mode={mode}
              onModeChange={(next) => {
                // A selection made in one mode has no meaning in the
                // other — Layout and Mapping share only cell/division
                // display, position and type, not their own content.
                grid.clearSelection();
                setMode(next);
              }}
              layout={layout}
              layer={layer}
              grid={grid}
              entityEditors={entityEditors}
              settingsOpened={settingsOpened}
              onChangePlugins={changePlugins}
              onChangeKeyProperties={changeKeyProperties}
              layerMenuRef={entityEditors.layerMenuRef}
              onChangeLayer={changeLayer}
              onLayerItemsChange={setLayerItems}
            />
          </Box>
          <Box
            className="inspector-panel"
            data-opened={inspectorOpened || undefined}
            style={{ flexBasis: inspectorOpened ? INSPECTOR_PANEL_WIDTH : 0 }}
          >
            <Box
              className="inspector-panel-inner"
              style={{ width: INSPECTOR_PANEL_WIDTH }}
            >
              <Inspector
                opened={inspectorOpened}
                onToggle={() => setInspectorOpened((value) => !value)}
                layer={layer}
                selectedKey={selectedKey}
                selectedKeyTypeId={selectedKeyTypeId}
                hasLayout={layout != null}
                mode={mode}
                layoutSelection={
                  grid.divisionSelection
                    ? { index: grid.divisionSelection.subId, cell: grid.divisionSelection.cell }
                    : grid.layoutSelection
                }
                onLayoutCellChange={
                  grid.divisionSelection
                    ? (subId, patch) =>
                        grid.changeDivisionCell(grid.divisionSelection!.parentId, subId, patch)
                    : grid.changeCell
                }
                tab={inspectorTab}
                onTabChange={setInspectorTab}
                onChange={changePlugins}
                onKeyPropertiesChange={changeKeyProperties}
              />
            </Box>
          </Box>
        </Box>
      </AppShell.Main>
      {entityEditors.layoutEditorOpened && (
        <LayoutEditor
          editing={entityEditors.editingLayout}
          duplicateFrom={entityEditors.duplicatingLayout}
          onClose={() => entityEditors.setLayoutEditorOpened(false)}
          onSaved={(id) => {
            entityEditors.setLayoutEditorOpened(false);
            void entityEditors.layoutMenuRef.current?.refresh(id);
          }}
        />
      )}
      {entityEditors.layerEditorOpened && layout && (
        <LayerEditor
          layoutId={layout.id}
          editing={entityEditors.editingLayer}
          duplicateFrom={entityEditors.duplicatingLayer}
          onClose={() => entityEditors.setLayerEditorOpened(false)}
          onSaved={(id) => {
            entityEditors.setLayerEditorOpened(false);
            void entityEditors.layerMenuRef.current?.refresh(id);
          }}
        />
      )}
      {entityEditors.replacePickerKind && (
        <ReplaceEntity
          kind={entityEditors.replacePickerKind}
          items={
            entityEditors.replacePickerKind === "layout"
              ? entityEditors.layoutItems
              : entityEditors.layerItems
          }
          currentId={
            entityEditors.replacePickerKind === "layout"
              ? (layout?.id ?? null)
              : (layer?.id ?? null)
          }
          onClose={entityEditors.cancelReplacePicker}
          onPick={entityEditors.pickReplaceTarget}
        />
      )}
      {entityEditors.pendingReplace && (
        <Confirmation
          title="Replace"
          message={
            <>
              Replace{" "}
              <Text component="span" fw={600}>
                {entityEditors.pendingReplace.targetName}
              </Text>{" "}
              with the current {entityEditors.pendingReplace.kind}? This cannot be undone.
            </>
          }
          onConfirm={() => void entityEditors.confirmReplaceNow()}
          onCancel={entityEditors.cancelReplace}
        />
      )}
      {entityEditors.confirmDelete && (
        <Modal
          opened
          onClose={() => entityEditors.setConfirmDelete(null)}
          title={
            <Text fw={700}>
              Delete {entityEditors.confirmDelete.kind === "layout" ? "layout" : "layer"}
            </Text>
          }
          centered
          size="sm"
        >
          <Stack>
            <Text>
              Delete {entityEditors.confirmDelete.kind === "layout" ? "layout" : "layer"}{" "}
              <Text component="span" fw={600}>
                {entityEditors.confirmDelete.name}
              </Text>
              ?
            </Text>
            <Text size="sm" c="dimmed">
              This action cannot be undone.
            </Text>
            <Group justify="flex-end">
              <Button color="gray" onClick={() => entityEditors.setConfirmDelete(null)}>
                Cancel
              </Button>
              <Button
                color="red"
                leftSection={<MdDelete size={16} />}
                onClick={() => void entityEditors.confirmDeleteNow()}
              >
                Delete
              </Button>
            </Group>
          </Stack>
        </Modal>
      )}
    </AppShell>
  );
}
