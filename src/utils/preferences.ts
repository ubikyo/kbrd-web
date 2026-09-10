/**
 * App-level preferences (Settings' own Preferences tab) — the handful of
 * choices that belong to whoever is using the app rather than to a
 * layout or to the device, so they're kept in `localStorage` instead of
 * going through KBRD-API the way `display`/`layout` rows do.
 */

/** Which mode `App` starts in — see its own `mode`. */
export type StartupMode = "layout" | "mapping";

export const DEFAULT_STARTUP_MODE: StartupMode = "layout";

const STARTUP_MODE_KEY = "kbrd.startupMode";

/**
 * Falls back to the default for anything unreadable — no stored value
 * yet, a value written by an older/newer version, or a browser that
 * refuses `localStorage` altogether (private windows, blocked site
 * data), where even reading it throws.
 */
export function loadStartupMode(): StartupMode {
  try {
    const value = window.localStorage.getItem(STARTUP_MODE_KEY);
    return value === "layout" || value === "mapping"
      ? value
      : DEFAULT_STARTUP_MODE;
  } catch {
    return DEFAULT_STARTUP_MODE;
  }
}

export function saveStartupMode(mode: StartupMode) {
  try {
    window.localStorage.setItem(STARTUP_MODE_KEY, mode);
  } catch {
    // Nothing to do — the preference just won't survive this reload.
  }
}
