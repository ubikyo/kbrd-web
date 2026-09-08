import {
  DEFAULT_KEY_PROPERTIES,
  DEFAULT_STATE_CONFIG,
  DEFAULT_STATE_NAME,
} from "../classes/inspectorHelpers";
import { pluginById, SYSTEM_PLUGIN_ID } from "../plugins/registry";
import type {
  KeyMode,
  KeyProperty,
  KeyPropertyConfig,
  KeyStateConfig,
} from "../types/layer";

// The shape `KeyPropertyConfig` had before named states existed: a single
// `up*`/`down*` pair (plus an even older single-field `borderEnabled`/
// `borderWidth`, from before Up/Down were split at all) instead of
// `states`/`stateConfigs`.
type LegacyKeyPropertyConfig = {
  keyMode?: KeyMode;
  borderEnabled?: boolean;
  borderWidth?: number;
  downEnabled?: boolean;
  upBorderEnabled?: boolean;
  downBorderEnabled?: boolean;
  upBorderColor?: string;
  downBorderColor?: string;
  upBorderWidth?: number;
  downBorderWidth?: number;
  upBackgroundColor?: string;
  downBackgroundColor?: string;
};

/**
 * Normalizes a key's saved Properties config into the current
 * `states`/`stateConfigs` shape, migrating a layer saved before named
 * states existed: its `up*` fields become the "Up" state, and its
 * `down*` fields become a "Down" state — but only when `downEnabled` was
 * actually set, since a key that never turned Down on shouldn't gain an
 * extra state just from being read once under the new model.
 */
export function resolveKeyPropertyConfig(
  config: Partial<KeyPropertyConfig> | LegacyKeyPropertyConfig | undefined,
): KeyPropertyConfig {
  if (!config) return DEFAULT_KEY_PROPERTIES;
  const current = config as Partial<KeyPropertyConfig>;
  if (Array.isArray(current.states) && current.states.length > 0) {
    const states = current.states;
    return {
      keyMode: current.keyMode ?? DEFAULT_KEY_PROPERTIES.keyMode,
      states,
      stateConfigs: states.reduce<Record<string, KeyStateConfig>>(
        (acc, state) => {
          acc[state] = {
            ...DEFAULT_STATE_CONFIG,
            ...current.stateConfigs?.[state],
          };
          return acc;
        },
        {},
      ),
    };
  }

  const legacy = config as LegacyKeyPropertyConfig;
  // Only what the legacy shape actually saved is carried over — every
  // field it has nothing to say about is left absent rather than filled
  // in, so `kbrd.render-key`'s own defaults apply to it (see
  // `KeyStateConfig`). `borderStyle` in particular never existed here, and
  // its default is the solid line these keys always had anyway.
  const upState: KeyStateConfig = {
    backgroundColor: legacy.upBackgroundColor,
    borderEnabled: legacy.upBorderEnabled ?? legacy.borderEnabled,
    borderColor: legacy.upBorderColor,
    borderWidth: legacy.upBorderWidth ?? legacy.borderWidth,
  };
  const states = [DEFAULT_STATE_NAME];
  const stateConfigs: Record<string, KeyStateConfig> = {
    [DEFAULT_STATE_NAME]: upState,
  };
  if (legacy.downEnabled) {
    states.push("Down");
    stateConfigs.Down = {
      backgroundColor: legacy.downBackgroundColor,
      borderEnabled: legacy.downBorderEnabled,
      borderColor: legacy.downBorderColor,
      borderWidth: legacy.downBorderWidth,
    };
  }
  return { keyMode: legacy.keyMode ?? DEFAULT_KEY_PROPERTIES.keyMode, states, stateConfigs };
}

/** A key's own look, with every field resolved — what a renderer needs,
 * as opposed to `KeyStateConfig`'s "only what's actually stored". Only
 * `backgroundColor` stays optional: absent genuinely means "no
 * background", not "transparent" (see `KeyStateConfig`). */
export type KeyLook = {
  backgroundColor?: string;
  borderEnabled: boolean;
  borderColor: string;
  borderStyle: NonNullable<KeyStateConfig["borderStyle"]>;
  borderWidth: number;
};

// `kbrd.render-key`'s own `defaultConfig` (see its `plugin.json`) — the
// single source of truth for what an untouched key looks like, the same
// one its editor renders from. The fallbacks are only there to keep this
// total if the manifest ever drops a field.
const SYSTEM_DEFAULTS = (pluginById(SYSTEM_PLUGIN_ID)?.defaultConfig ??
  {}) as Partial<KeyLook>;

const DEFAULT_LOOK: KeyLook = {
  borderEnabled: SYSTEM_DEFAULTS.borderEnabled ?? false,
  borderColor: SYSTEM_DEFAULTS.borderColor ?? "#ffffff",
  borderStyle: SYSTEM_DEFAULTS.borderStyle ?? "solid",
  borderWidth: SYSTEM_DEFAULTS.borderWidth ?? 1,
  backgroundColor: SYSTEM_DEFAULTS.backgroundColor,
};

/**
 * How `keyRef` looks in its resting state — its stored `key_properties`
 * merged over `kbrd.render-key`'s own defaults, exactly as its editor in
 * the Properties tab assembles them (see `Inspector`). "Up" is the state
 * every key has (`DEFAULT_STATE_NAME`), and the only one anything drawn
 * outside `<Preview>` ever shows — nothing there simulates a press.
 *
 * `null` for a key that has nothing to say about its own look, so a
 * caller can keep whatever it drew before this existed rather than have
 * to special-case an all-defaults look.
 */
export function keyLook(
  properties: KeyProperty[],
  keyRef: string | null | undefined,
): KeyLook | null {
  if (!keyRef) return null;
  const stored = properties.find((item) => item.key_ref === keyRef);
  if (!stored) return null;
  const config = resolveKeyPropertyConfig(stored.config);
  const state =
    config.stateConfigs[DEFAULT_STATE_NAME] ??
    config.stateConfigs[config.states[0] ?? ""] ??
    DEFAULT_STATE_CONFIG;
  const look = { ...DEFAULT_LOOK };
  // Field by field rather than one spread: the legacy migration above
  // writes keys whose value is `undefined` (a `up*` field the old shape
  // never saved), and spreading those would overwrite a real default
  // with nothing.
  for (const [key, value] of Object.entries(state)) {
    if (value !== undefined) {
      (look as Record<string, unknown>)[key] = value;
    }
  }
  return look;
}
