import { describe, expect, it } from "vitest";

import {
  EMPTY_SCREEN_DRAFT,
  MAX_MM,
  MIN_MM,
  isScreenComplete,
  screenName,
  screenSize,
  type ScreenDraft,
} from "./screenDraft";

const known = (brand: string, model: string): ScreenDraft => ({
  ...EMPTY_SCREEN_DRAFT,
  brand,
  model,
});

const custom = (patch: Partial<ScreenDraft>): ScreenDraft => ({
  ...EMPTY_SCREEN_DRAFT,
  mode: "custom",
  ...patch,
});

describe("a screen off the list", () => {
  it("takes its name and its size from the entry", () => {
    const draft = known("Waveshare", "10.1-DSI-TOUCH-A");
    expect(screenName(draft)).toBe("Waveshare 10.1-DSI-TOUCH-A");
    expect(screenSize(draft)).toEqual({ widthMm: 216, heightMm: 135 });
    expect(isScreenComplete(draft)).toBe(true);
  });

  it("is unanswered until a model is picked under the brand", () => {
    expect(isScreenComplete(known("Waveshare", ""))).toBe(false);
    expect(screenName(known("Waveshare", ""))).toBe("");
    // A model that isn't this brand's is no screen at all — which is what
    // moving to another brand leaves behind for a moment.
    expect(isScreenComplete(known("Raspberry Pi", "10.1-DSI-TOUCH-A"))).toBe(
      false,
    );
  });
});

describe("a screen described by hand", () => {
  it("takes the name and the size that were typed", () => {
    const draft = custom({ name: " Bench panel ", widthMm: 100, heightMm: 60 });
    expect(screenName(draft)).toBe("Bench panel");
    expect(screenSize(draft)).toEqual({ widthMm: 100, heightMm: 60 });
    expect(isScreenComplete(draft)).toBe(true);
  });

  it("is unanswered without a name, or with a size KBRD-API would refuse", () => {
    expect(
      isScreenComplete(custom({ name: "  ", widthMm: 100, heightMm: 60 })),
    ).toBe(false);
    expect(
      isScreenComplete(
        custom({ name: "Panel", widthMm: MIN_MM - 1, heightMm: 60 }),
      ),
    ).toBe(false);
    expect(
      isScreenComplete(
        custom({ name: "Panel", widthMm: 100, heightMm: MAX_MM + 1 }),
      ),
    ).toBe(false);
  });

  it("keeps nothing from the entry a brand and model still name", () => {
    // Moving to "Another screen" clears both (see `ScreenPicker`), but
    // the draft has to read the same way even if they were left behind.
    const draft = custom({
      brand: "Waveshare",
      model: "10.1-DSI-TOUCH-A",
      name: "Panel",
      widthMm: 100,
      heightMm: 60,
    });
    expect(screenName(draft)).toBe("Panel");
    expect(screenSize(draft)).toEqual({ widthMm: 100, heightMm: 60 });
  });
});

describe("an untouched draft", () => {
  it("answers nothing and is not complete", () => {
    expect(screenName(EMPTY_SCREEN_DRAFT)).toBe("");
    expect(isScreenComplete(EMPTY_SCREEN_DRAFT)).toBe(false);
  });
});
