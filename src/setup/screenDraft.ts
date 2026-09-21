import { findPanel, panelName } from "./panels";
import type { DisplayData } from "../types/layout";

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

/** What a screen described by hand is called. It isn't asked for — the
 * two measurements are the whole of that path (see `ScreenPicker`) — but
 * the device stores a name for every screen, so there is one here to
 * store. A name already on the device is kept rather than overwritten
 * with it (see `screenName`). */
export const CUSTOM_SCREEN_NAME = "Custom screen";

export type ScreenDraft = {
  mode: ScreenMode;
  brand: string;
  model: string;
  /** Only used by the custom path, and only ever what the device already
   * had: nothing types one any more, and an unnamed custom screen is
   * called `CUSTOM_SCREEN_NAME`. A panel off the list is named after its
   * brand and model instead (see `panelName`). */
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
 * one — a brand on its own doesn't name a screen, while a screen
 * described by hand always has `CUSTOM_SCREEN_NAME` to fall back on. */
export function screenName(draft: ScreenDraft) {
  if (draft.mode !== "known") return draft.name.trim() || CUSTOM_SCREEN_NAME;
  return draft.brand && draft.model
    ? panelName(draft.brand, draft.model)
    : "";
}

/** Whether the step has been answered: a screen with a name and a size
 * KBRD-API would take. Only the size is ever missing on the custom path
 * — the name there is a constant (see `CUSTOM_SCREEN_NAME`). */
export function isScreenComplete(draft: ScreenDraft) {
  const { widthMm, heightMm } = screenSize(draft);
  return (
    screenName(draft).length > 0 &&
    sizeInRange(widthMm) &&
    sizeInRange(heightMm)
  );
}

/**
 * The screen the device has stored, as a draft to edit (see
 * `components/modals/Settings`, which asks the same question the wizard
 * does and off the same list).
 *
 * A row carrying a brand and a model was picked off that list, and goes
 * back to it — its size is the list's rather than the row's, so a panel
 * whose measurements are corrected in `panels.ts` corrects itself here.
 * Anything else was described by hand: its name and its millimetres are
 * all there is, and there is no entry behind them.
 *
 * A device that has never been set up has neither, and comes back as the
 * empty draft rather than as a custom screen named "".
 */
export function screenDraftFrom(display: DisplayData): ScreenDraft {
  if (display.brand && display.model && findPanel(display.brand, display.model)) {
    return {
      ...EMPTY_SCREEN_DRAFT,
      mode: "known",
      brand: display.brand,
      model: display.model,
    };
  }
  if (!display.name) return EMPTY_SCREEN_DRAFT;
  return {
    ...EMPTY_SCREEN_DRAFT,
    mode: "custom",
    name: display.name,
    widthMm: display.physical_width_mm,
    heightMm: display.physical_height_mm,
  };
}
