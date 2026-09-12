/**
 * App-level preferences (Settings' own "On open" tab) — the handful of
 * choices that belong to whoever is using the app rather than to a
 * layout or to the device, so they're kept in `localStorage` instead of
 * going through KBRD-API the way `display`/`layout` rows do.
 *
 * Every one of these says what the app should look like when it opens,
 * not what it looks like now: opening or closing a panel from its own tab
 * doesn't write anything here.
 *
 * The one exception is the colour scheme (Settings' Appearance tab),
 * which applies the moment it's picked rather than on the next open —
 * and which Mantine stores itself. See `ColorSchemePreference` below.
 */

/** Which mode `App` starts in — see its own `mode`. */
export type StartupMode = "layout" | "mapping";

/**
 * Settings' Appearance tab — which of the two palettes in
 * `@kbrd/plugins/theme` the app wears. Deliberately Mantine's own
 * `MantineColorScheme` and nothing of ours: this is the one preference
 * here that isn't stored by this module at all.
 *
 * `useMantineColorScheme` reads and writes it through the provider's own
 * manager (`localStorage`, under `mantine-color-scheme-value`), which is
 * also what the inline script in `index.html` reads to paint the first
 * frame. A second copy kept here would be a second source of truth for
 * the same thing — so the tab talks to Mantine directly (see
 * `Settings`), and only the default below is stated on this side.
 */
export type ColorSchemePreference = "auto" | "light" | "dark";

/** Follow the OS until told otherwise — see `main.tsx`'s provider. */
export const DEFAULT_COLOR_SCHEME: ColorSchemePreference = "auto";

/** Whether a side panel (Media, Inspector) starts deployed — see `App`'s
 * own `mediaOpened`/`inspectorOpened`, and each panel's own tab. */
export type PanelState = "open" | "close";

export const DEFAULT_STARTUP_MODE: StartupMode = "layout";
// The Inspector is the one you work with; the Media panel is the one you
// reach for.
export const DEFAULT_MEDIA_PANEL: PanelState = "close";
export const DEFAULT_INSPECTOR_PANEL: PanelState = "open";

const STARTUP_MODE_KEY = "kbrd.startupMode";
const MEDIA_PANEL_KEY = "kbrd.mediaPanel";
const INSPECTOR_PANEL_KEY = "kbrd.inspectorPanel";

/**
 * Falls back to the default for anything unreadable — no stored value
 * yet, a value written by an older/newer version, or a browser that
 * refuses `localStorage` altogether (private windows, blocked site
 * data), where even reading it throws.
 */
function load<T extends string>(key: string, values: readonly T[], fallback: T): T {
  try {
    const value = window.localStorage.getItem(key);
    return values.includes(value as T) ? (value as T) : fallback;
  } catch {
    return fallback;
  }
}

function save(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Nothing to do — the preference just won't survive this reload.
  }
}

const PANEL_STATES = ["open", "close"] as const;

export const loadStartupMode = () =>
  load(STARTUP_MODE_KEY, ["layout", "mapping"] as const, DEFAULT_STARTUP_MODE);

export const saveStartupMode = (mode: StartupMode) =>
  save(STARTUP_MODE_KEY, mode);

export const loadMediaPanel = () =>
  load(MEDIA_PANEL_KEY, PANEL_STATES, DEFAULT_MEDIA_PANEL);

export const saveMediaPanel = (state: PanelState) =>
  save(MEDIA_PANEL_KEY, state);

export const loadInspectorPanel = () =>
  load(INSPECTOR_PANEL_KEY, PANEL_STATES, DEFAULT_INSPECTOR_PANEL);

export const saveInspectorPanel = (state: PanelState) =>
  save(INSPECTOR_PANEL_KEY, state);
