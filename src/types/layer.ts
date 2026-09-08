import type { BorderStyleValue } from "@kbrd/plugins/web";

import type { FactoryLayout } from "./layout";

// The synthetic `key_ref` a Layer-wide (rather than per-key) plugin
// instance is stored under — shown as "Layer" in the Inspector's own
// Properties tab (see `useKeyInspector`'s `systemPluginName`), and as the
// keyboard's own background layer in `Preview` (rendered unclipped,
// behind every real key).
export const BACKGROUND_REF = "__background__";

export type KeyPlugin = {
  id: number;
  layer_id: number;
  key_ref: string;
  plugin_id: string;
  plugin_version: string;
  position: number;
  enabled: boolean;
  config: Record<string, unknown>;
};

export type KeyMode = "momentary" | "toggle";

// A key's look for one named state ("Up" always exists — see
// `DEFAULT_KEY_PROPERTIES` — plus whatever custom states the States menu
// in the Properties tab has added, e.g. "Down"). Every attached plugin's
// own `config.states` (see `plugins/state.ts`) carries one of these per
// state name too, so the whole key's content — system look and every
// plugin's fields alike — pivots together on whichever state is active.
//
// This is the *stored* shape, which is why every field is optional: an
// absent one means the state says nothing about that property, so the
// value comes from `kbrd.render-key`'s own `defaultConfig` (see its
// `plugin.json`, and `RenderKeyConfig` for the complete shape its editor
// actually receives). That's what makes closing a property group work —
// it deletes the fields rather than freezing today's values into the
// config, so re-opening the group starts from the plugin's defaults
// again. Same arrangement as any attached plugin instance, which stores
// `{}` until something is set.
export type KeyStateConfig = {
  backgroundColor?: string;
  borderEnabled?: boolean;
  borderColor?: string;
  borderStyle?: BorderStyleValue;
  borderWidth?: number;
};

export type KeyPropertyConfig = {
  keyMode: KeyMode;
  // Every state this key has, in menu order — always at least one.
  states: string[];
  stateConfigs: Record<string, KeyStateConfig>;
};

export type KeyProperty = {
  key_ref: string;
  config: KeyPropertyConfig;
};

export type LayerData = {
  id: number;
  layout_id: number;
  name: string;
  description: string;
  active: boolean;
  created_at: string;
  plugins: KeyPlugin[];
  key_properties: KeyProperty[];
  // `<Factory>`'s own grid disposition (see `FactoryLayout`), persisted
  // alongside this layer and reloaded whenever it's switched back to —
  // `null` until something's actually been laid out on the display.
  factory_layout: FactoryLayout | null;
};
