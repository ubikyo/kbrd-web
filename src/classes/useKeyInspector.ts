import { useState } from "react";

import {
  deleteKeyPlugin,
  updateKeyPlugin,
  updateKeyProperties,
} from "../api/layers";
import {
  isDeletable,
  isMappingVisible,
  pluginById,
  plugins,
} from "../plugins/registry";
import { pluginStates } from "../plugins/state";
import {
  BACKGROUND_REF,
  type KeyPlugin,
  type KeyProperty,
  type KeyPropertyConfig,
  type KeyStateConfig,
  type LayerData,
} from "../types/layer";
import { resolveKeyPropertyConfig } from "../utils/keyProperties";
import { usePendingSaves } from "../utils/usePendingSaves";
import { DEFAULT_STATE_CONFIG, DEFAULT_STATE_NAME } from "./inspectorHelpers";

/**
 * Everything behind `<Inspector>`'s Plugins/Properties tabs for
 * `selectedKey`: which plugin instances/properties it has, the system
 * "Key"/"Space"/"Layer" properties row every key shows regardless of its
 * own plugins, and every mutation (patch/reorder/remove/clear/move) —
 * each one optimistically updating `layer` through the callbacks passed
 * in (`onChange`/`onKeyPropertiesChange`) before its own debounced save
 * actually reaches KBRD-API (see `usePendingSaves`).
 *
 * A key's whole Properties tab — the system row and every attached
 * plugin alike, listed in one flat accordion — pivots on one shared
 * "active state" (see the States menu above that accordion): whatever
 * fields each one shows are that state's own values, from
 * `KeyPropertyConfig.stateConfigs`/each `KeyPlugin.config.states` (see
 * `plugins/state.ts`) — `addState`/`renameState`/`deleteState` below keep
 * both in lockstep.
 */
export function useKeyInspector(params: {
  layer: LayerData | null;
  selectedKey: string | null;
  // `selectedKey`'s own Layout plugin id (`kbrd.layout-key`/
  // `kbrd.layout-space`) — see `App`'s own `selectedKeyTypeId`, set the
  // same place `selectedKey` itself is.
  selectedKeyTypeId: string | null;
  mode: "layout" | "mapping";
  onChange: (plugins: KeyPlugin[]) => void;
  onKeyPropertiesChange: (properties: KeyProperty[]) => void;
}) {
  const {
    layer,
    selectedKey,
    selectedKeyTypeId,
    mode,
    onChange,
    onKeyPropertiesChange,
  } = params;

  const [deleting, setDeleting] = useState<KeyPlugin | null>(null);
  const [dropIndicator, setDropIndicator] = useState<{
    id: number;
    edge: "before" | "after";
  } | null>(null);
  const [draggedPropertyId, setDraggedPropertyId] = useState<number | null>(
    null,
  );
  // Which state's fields are currently shown, per key — the States menu's
  // own selection. Defaults to the key's first state ("Up", unless it's
  // been renamed) rather than a hardcoded name, and falls back the same
  // way if the state it remembers was since deleted.
  const [activeStates, setActiveStates] = useState<Record<string, string>>(
    {},
  );
  const pendingSaves = usePendingSaves<number, Partial<KeyPlugin>>();
  const pendingPropertySaves = usePendingSaves<string, KeyPropertyConfig>();

  // Layout plugins (positioning/kind) are only draggable in Layout mode;
  // Invoke/Display plugins (behaviour/content) only in Mapping mode.
  // A non-deletable plugin is the element's own form rather than
  // something attached to it (see `isDeletable`), so it never belongs in
  // the list you drag from either.
  const draggablePlugins = plugins.filter(
    (plugin) =>
      isDeletable(plugin) &&
      (mode === "layout"
        ? plugin.category === "Layout"
        : plugin.category !== "Layout"),
  );
  const pluginCategories = [
    ...new Set(draggablePlugins.map((plugin) => plugin.category)),
  ];
  const allInstances = layer?.plugins ?? [];
  const instances = allInstances
    .filter((plugin) => plugin.key_ref === selectedKey)
    .sort((left, right) => left.position - right.position);
  const keyProperties = layer?.key_properties ?? [];
  const selectedProperty = keyProperties.find(
    (property) => property.key_ref === selectedKey,
  );
  const propertyConfig = resolveKeyPropertyConfig(selectedProperty?.config);
  // `isMappingVisible` is the same "does this Layout plugin still show up
  // in Mapping mode" capability check `Display`/`LayoutCellDivision` use
  // to hide a Space's cell there — Key has it, Space doesn't, which is
  // exactly the Key/Space distinction this needs too. No `typeId` yet (a
  // cell that predates `GridCell.typeId`, or nothing selected at all)
  // falls back to "key", same as before this read straight `GridCell`s.
  const targetType: "key" | "space" | "background" =
    selectedKey === BACKGROUND_REF
      ? "background"
      : selectedKeyTypeId && !isMappingVisible(selectedKeyTypeId)
        ? "space"
        : "key";
  const systemPluginName =
    targetType === "background"
      ? "Layer"
      : targetType === "space"
        ? "Space"
        : "Key";
  const storedActiveState = selectedKey ? activeStates[selectedKey] : undefined;
  const activeState =
    storedActiveState && propertyConfig.states.includes(storedActiveState)
      ? storedActiveState
      : (propertyConfig.states[0] ?? DEFAULT_STATE_NAME);
  // What the active state actually *stores* for the element's own look —
  // usually a subset, sometimes nothing at all. The complete view the
  // system editor renders from is this merged over
  // `kbrd.render-key`'s `defaultConfig`, which `Inspector` assembles the
  // same way it does for any plugin instance.
  const activeStateConfig =
    propertyConfig.stateConfigs[activeState] ?? DEFAULT_STATE_CONFIG;

  function setActiveState(state: string) {
    if (!selectedKey) return;
    setActiveStates((current) => ({ ...current, [selectedKey]: state }));
  }

  function patchKeyProperty(data: Partial<KeyPropertyConfig>) {
    if (!layer || !selectedKey) return;
    const config = { ...propertyConfig, ...data };
    const property = { key_ref: selectedKey, config };
    onKeyPropertiesChange([
      ...keyProperties.filter((item) => item.key_ref !== selectedKey),
      property,
    ]);
    pendingPropertySaves.schedule(
      selectedKey,
      () => config,
      (saved) => void updateKeyProperties(layer.id, selectedKey, saved),
    );
  }

  // Replaces the currently active state's own stored look outright — the
  // system row's equivalent of a plugin's `withStateConfig`. A *replace*
  // rather than a merge, because a field that's gone from `config` is the
  // whole point: that's how closing a property group hands the property
  // back to `kbrd.render-key`'s own `defaultConfig` (see `KeyStateConfig`).
  // A merge could only ever add fields, never let one go.
  function setStateConfig(config: KeyStateConfig) {
    patchKeyProperty({
      stateConfigs: { ...propertyConfig.stateConfigs, [activeState]: config },
    });
  }

  function patch(item: KeyPlugin, data: Partial<KeyPlugin>) {
    const value = { ...item, ...data };
    onChange(
      allInstances.map((plugin) => (plugin.id === value.id ? value : plugin)),
    );

    pendingSaves.schedule(
      item.id,
      (previous) => ({ ...previous, ...data }),
      (merged) => void updateKeyPlugin(item.id, merged),
    );
  }

  // Adds a new state named `name` to this key — the system row and every
  // attached plugin instance alike — seeded from `copyFrom`'s own current
  // values where given, and otherwise storing nothing at all, so each one
  // shows its own plugin's defaults (see `DEFAULT_STATE_CONFIG`).
  function addState(name: string, copyFrom: string | null) {
    if (!layer || !selectedKey) return;
    const trimmed = name.trim();
    if (!trimmed || propertyConfig.states.includes(trimmed)) return;

    const seedSystem = copyFrom
      ? (propertyConfig.stateConfigs[copyFrom] ?? DEFAULT_STATE_CONFIG)
      : DEFAULT_STATE_CONFIG;
    patchKeyProperty({
      states: [...propertyConfig.states, trimmed],
      stateConfigs: {
        ...propertyConfig.stateConfigs,
        [trimmed]: { ...seedSystem },
      },
    });

    for (const item of instances) {
      const states = pluginStates(item.config);
      // Same rule as a freshly attached instance: nothing stored unless
      // it's being copied from a state that had something.
      const seed = copyFrom ? (states[copyFrom] ?? {}) : {};
      patch(item, { config: { states: { ...states, [trimmed]: { ...seed } } } });
    }
    setActiveState(trimmed);
  }

  // Renames `oldName` to `newName` everywhere it appears for this key —
  // and, when `copyFrom` is given, also resets its values from that other
  // state's own (a "reset from" alongside the rename).
  function renameState(
    oldName: string,
    newName: string,
    copyFrom: string | null,
  ) {
    if (!layer || !selectedKey) return;
    const trimmed = newName.trim();
    if (!trimmed) return;
    if (trimmed !== oldName && propertyConfig.states.includes(trimmed)) return;

    const nextStates = propertyConfig.states.map((state) =>
      state === oldName ? trimmed : state,
    );
    const nextStateConfigs = { ...propertyConfig.stateConfigs };
    const systemSource = copyFrom
      ? nextStateConfigs[copyFrom]
      : nextStateConfigs[oldName];
    delete nextStateConfigs[oldName];
    nextStateConfigs[trimmed] = { ...(systemSource ?? DEFAULT_STATE_CONFIG) };
    patchKeyProperty({ states: nextStates, stateConfigs: nextStateConfigs });

    for (const item of instances) {
      const states = pluginStates(item.config);
      const source = copyFrom ? states[copyFrom] : states[oldName];
      const nextPluginStates = { ...states };
      delete nextPluginStates[oldName];
      nextPluginStates[trimmed] = { ...(source ?? {}) };
      patch(item, { config: { states: nextPluginStates } });
    }
    setActiveState(trimmed);
  }

  // Removes `name` everywhere it appears for this key — refused if it's
  // the key's last remaining state, per the States menu's own rule.
  function deleteState(name: string) {
    if (!layer || !selectedKey || propertyConfig.states.length <= 1) return;
    const nextStates = propertyConfig.states.filter((state) => state !== name);
    const nextStateConfigs = { ...propertyConfig.stateConfigs };
    delete nextStateConfigs[name];
    patchKeyProperty({ states: nextStates, stateConfigs: nextStateConfigs });

    for (const item of instances) {
      const states = { ...pluginStates(item.config) };
      delete states[name];
      patch(item, { config: { states } });
    }
    if (activeState === name) setActiveState(nextStates[0]);
  }

  async function reorder(
    draggedId: number,
    targetId: number,
    edge: "before" | "after",
  ) {
    const draggedItem = instances.find((item) => item.id === draggedId);
    const targetItem = instances.find((item) => item.id === targetId);
    if (!draggedItem || !targetItem || draggedId === targetId) return;
    const category = pluginById(draggedItem.plugin_id)?.category;
    if (!category || pluginById(targetItem.plugin_id)?.category !== category) {
      return;
    }

    const categoryInstances = instances.filter(
      (item) => pluginById(item.plugin_id)?.category === category,
    );
    const from = categoryInstances.findIndex((item) => item.id === draggedId);

    const positions = categoryInstances.map((item) => item.position);
    const reordered = [...categoryInstances];
    const [dragged] = reordered.splice(from, 1);
    const targetIndex = reordered.findIndex((item) => item.id === targetId);
    if (targetIndex === -1) return;
    reordered.splice(targetIndex + (edge === "after" ? 1 : 0), 0, dragged);
    if (
      reordered.every(
        (item, index) => item.id === categoryInstances[index].id,
      )
    ) {
      return;
    }
    const positioned = reordered.map((item, index) => ({
      ...item,
      position: positions[index],
    }));

    const reorderedById = new Map(positioned.map((item) => [item.id, item]));
    onChange(allInstances.map((item) => reorderedById.get(item.id) ?? item));
    await Promise.all(
      positioned
        .filter(
          (item) =>
            categoryInstances.find((instance) => instance.id === item.id)
              ?.position !== item.position,
        )
        .map((item) => updateKeyPlugin(item.id, { position: item.position })),
    );
  }

  async function remove(item: KeyPlugin) {
    const pending = pendingSaves.take(item.id);
    onChange(allInstances.filter((plugin) => plugin.id !== item.id));
    if (pending) await updateKeyPlugin(item.id, pending);
    await deleteKeyPlugin(item.id);
    setDeleting(null);
  }

  return {
    // UI-only state
    deleting,
    setDeleting,
    dropIndicator,
    setDropIndicator,
    draggedPropertyId,
    setDraggedPropertyId,

    // derived data
    draggablePlugins,
    pluginCategories,
    allInstances,
    instances,
    propertyConfig,
    targetType,
    systemPluginName,
    activeState,
    activeStateConfig,

    // mutations
    setActiveState,
    patchKeyProperty,
    setStateConfig,
    addState,
    renameState,
    deleteState,
    patch,
    reorder,
    remove,
  };
}
