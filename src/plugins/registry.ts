import type { ComponentType } from "react";
import { plugins as pluginModules } from "@kbrd/plugins/web";

export type PluginEditorProps = {
  // The state's stored fields merged over the plugin's own
  // `defaultConfig` — always complete, so every editor can read a value
  // for every field whether or not the instance has set one.
  config: Record<string, unknown>;
  // Only what the instance actually stores for this state, before those
  // defaults are merged in. An editor with optional property groups needs
  // this to tell "set to the default value" from "not set at all" — see
  // `PropertyGroup`'s own `active`. Editors without optional groups can
  // ignore it and just read `config`.
  definedConfig?: Record<string, unknown>;
  onChange: (config: Record<string, unknown>) => void;
  disabled?: boolean;
  targetType?: "key" | "background" | "space";
};

export type PluginRendererProps = {
  config: Record<string, unknown>;
  x: number;
  y: number;
  width: number;
  height: number;
};

type PluginModule = (typeof pluginModules)[number];

export type PluginDefinition = Omit<
  PluginModule,
  "LayoutEditor" | "LayerEditor" | "Renderer"
> & {
  LayoutEditor: ComponentType<PluginEditorProps>;
  LayerEditor: ComponentType<PluginEditorProps>;
  Renderer: ComponentType<PluginRendererProps>;
  // Declared (as `false`) only by a plugin that isn't a user's to attach
  // or detach — `kbrd.render-key` is the element's own form, not something
  // dropped onto it. Anything that leaves it out is deletable, hence the
  // optional field rather than one repeated across every manifest.
  deletable?: boolean;
};

export const plugins = pluginModules as unknown as PluginDefinition[];

export const pluginById = (id: string) =>
  plugins.find((plugin) => plugin.id === id);

/** The id of the plugin holding an element's own look — the row pinned at
 * the end of the Properties tab, backed by the key's `key_properties`
 * rather than by a `KeyPlugin` instance of its own. */
export const SYSTEM_PLUGIN_ID = "kbrd.render-key";

/** Whether this plugin can be attached to, and removed from, an element at
 * all — see `PluginDefinition.deletable`. */
export const isDeletable = (plugin: PluginDefinition) =>
  plugin.deletable !== false;

// A Layout plugin's own `capabilities` (`kbrd.layout-key`/`kbrd.layout-space`,
// see their own `plugin.json`) drive how a cell behaves in Layer mode —
// see `Display`/`LayoutCellDivision`. `layer-visible` is whether it still shows
// at all there (Key does, Space doesn't: hidden entirely, though its own
// row/grid space stays reserved); `layer-target` is whether an
// Invoke/Display plugin can be dropped onto it. Both default to `false`
// for a cell with no `typeId` yet, or a `typeId` the registry doesn't
// recognize.
export const isLayerVisible = (typeId: string | null | undefined) =>
  Boolean(
    typeId && pluginById(typeId)?.capabilities.includes("layer-visible"),
  );

export const isLayerTarget = (typeId: string | null | undefined) =>
  Boolean(
    typeId && pluginById(typeId)?.capabilities.includes("layer-target"),
  );
