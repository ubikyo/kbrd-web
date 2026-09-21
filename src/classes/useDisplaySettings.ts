import { useEffect, useState } from "react";

import { getDisplay, updateDisplay } from "../api/display";
import {
  EMPTY_SCREEN_DRAFT,
  isScreenComplete,
  screenDraftFrom,
  screenName,
  screenSize,
  type ScreenDraft,
} from "../setup/screenDraft";
import { DEFAULT_LAYOUT_SETTINGS } from "../types/layout";
import type { LayoutSettings } from "../types/layout";

/**
 * Physical grid settings (Settings' own physical width/height, plus each
 * layout's Caps size / Gap size) as one bag of numbers, the shape
 * `<Display>`/`<LayoutEditor>` share regardless of where each field
 * is actually edited or persisted (see `LayoutSettings`). The physical
 * screen's width/height (`display`, see KBRD-API) are one row for the
 * whole device, loaded once here rather than re-seeded on every layout
 * switch the way Caps size / Gap size are (see `App`'s own `changeLayout`,
 * which folds a layout's `unit_mm`/`gap_mm` into `setLayoutSettings`
 * itself instead of going through this hook) — switching layouts must
 * never resize the physical screen out from under the display.
 *
 * That same row says *which* screen it is, and `screen` is it: the
 * panel it was picked as, in the shape the wizard's own picker edits
 * (see `setup/ScreenPicker`). Settings asks the question the same way
 * the first run does, so the two share the draft and the list behind it
 * rather than each having their own idea of what a screen is.
 */
export function useDisplaySettings() {
  const [layoutSettings, setLayoutSettings] = useState<LayoutSettings>(
    DEFAULT_LAYOUT_SETTINGS,
  );
  const [screen, setScreen] = useState<ScreenDraft>(EMPTY_SCREEN_DRAFT);

  useEffect(() => {
    let cancelled = false;
    void getDisplay().then((data) => {
      if (cancelled) return;
      setLayoutSettings((current) => ({
        ...current,
        physicalWidthMm: data.physical_width_mm,
        physicalHeightMm: data.physical_height_mm,
      }));
      setScreen(screenDraftFrom(data));
    });
    return () => {
      cancelled = true;
    };
  }, []);

  /**
   * Write the size, and the screen it belongs to when one was picked.
   *
   * `nextScreen` left out is a caller changing numbers and nothing else,
   * and KBRD-API leaves the name alone for exactly that body (see its
   * `api/display.py`). Passed but incomplete — a brand chosen with no
   * model yet — is the same case: there is no screen to name until both
   * halves are there, and sending half of one would store a row that
   * describes nothing.
   *
   * A picked panel's millimetres come off the list rather than out of
   * the form, so the two can never disagree.
   */
  async function saveDisplaySettings(
    settings: LayoutSettings,
    nextScreen?: ScreenDraft,
  ) {
    const named = nextScreen !== undefined && isScreenComplete(nextScreen);
    const size = named
      ? screenSize(nextScreen)
      : {
          widthMm: settings.physicalWidthMm,
          heightMm: settings.physicalHeightMm,
        };

    setLayoutSettings({
      ...settings,
      physicalWidthMm: size.widthMm,
      physicalHeightMm: size.heightMm,
    });
    if (nextScreen) setScreen(nextScreen);

    const updated = await updateDisplay({
      physical_width_mm: size.widthMm,
      physical_height_mm: size.heightMm,
      ...(named
        ? {
            name: screenName(nextScreen),
            // Empty for a screen described by hand: there is no entry on
            // the list it came from to point back at.
            brand: nextScreen.mode === "known" ? nextScreen.brand : "",
            model: nextScreen.mode === "known" ? nextScreen.model : "",
          }
        : {}),
    });

    setLayoutSettings((current) => ({
      ...current,
      physicalWidthMm: updated.physical_width_mm,
      physicalHeightMm: updated.physical_height_mm,
    }));
    setScreen(screenDraftFrom(updated));
  }

  return { layoutSettings, setLayoutSettings, screen, saveDisplaySettings };
}
