import { findPanel, panelName } from "./panels";

/**
 * The screen as it is being declared, kept apart from the step that asks
 * for it the way the network's own draft is (see
 * `components/settings/networkDraft`): the wizard holds it and sends it,
 * `ScreenPicker` fills it in, and neither has to know the other's shape.
 */

// KBRD-API's own bounds for a screen (see `api/setup.py`), so a size it
// would refuse is refused in the field instead.
export const MIN_MM = 10;
export const MAX_MM = 2000;

/** How the screen is being declared: picked off the list of known panels
 * (see `panels.ts`), or described by hand. */
export type ScreenMode = "known" | "custom";

export type ScreenDraft = {
  mode: ScreenMode;
  brand: string;
  model: string;
  /** Only used by the custom path — a panel off the list is named after
   * its brand and model (see `panelName`). */
  name: string;
  /** Likewise: a known panel's size is read off the list, and these two
   * are what the custom path types instead. */
  widthMm: number;
  heightMm: number;
};

export const EMPTY_SCREEN_DRAFT: ScreenDraft = {
  mode: "known",
  brand: "",
  model: "",
  name: "",
  widthMm: 0,
  heightMm: 0,
};

export const sizeInRange = (value: number) =>
  value >= MIN_MM && value <= MAX_MM;

/** The panel the draft points at, or nothing — a screen described by
 * hand has no entry on the list behind it, and neither does a brand
 * whose model is still to be picked. */
export const screenPanel = (draft: ScreenDraft) =>
  draft.mode === "known" ? findPanel(draft.brand, draft.model) : undefined;

/** The size that will be written: the list's for a known panel, the two
 * fields for one described by hand. */
export function screenSize(draft: ScreenDraft) {
  const panel = screenPanel(draft);
  return panel
    ? { widthMm: panel.widthMm, heightMm: panel.heightMm }
    : { widthMm: draft.widthMm, heightMm: draft.heightMm };
}

/** What the device will store as the screen's name. Empty until there is
 * one — a brand on its own doesn't name a screen. */
export function screenName(draft: ScreenDraft) {
  if (draft.mode !== "known") return draft.name.trim();
  return draft.brand && draft.model
    ? panelName(draft.brand, draft.model)
    : "";
}

/** Whether the step has been answered: a screen with a name and a size
 * KBRD-API would take. */
export function isScreenComplete(draft: ScreenDraft) {
  const { widthMm, heightMm } = screenSize(draft);
  return (
    screenName(draft).length > 0 &&
    sizeInRange(widthMm) &&
    sizeInRange(heightMm)
  );
}
