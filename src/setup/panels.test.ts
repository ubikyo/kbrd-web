import { describe, expect, it } from "vitest";

import { BRANDS, PANELS, findPanel, panelName, panelsOf } from "./panels";

describe("the known panels", () => {
  it("carries KBRD's own development screen", () => {
    // 216 × 135 mm is also what KBRD-API's `display` row starts on and
    // what KBRD-DEV falls back to — picking this panel has to leave the
    // device exactly where it already was.
    expect(findPanel("Waveshare", "10.1-DSI-TOUCH-A")).toMatchObject({
      widthMm: 216,
      heightMm: 135,
    });
  });

  it("names every entry uniquely within its brand", () => {
    for (const { brand, panels } of PANELS) {
      const models = panels.map((panel) => panel.model);
      expect(new Set(models).size, brand).toBe(models.length);
    }
  });

  it("gives every entry a size KBRD-API would take", () => {
    for (const { panels } of PANELS) {
      for (const panel of panels) {
        expect(panel.widthMm).toBeGreaterThanOrEqual(10);
        expect(panel.widthMm).toBeLessThanOrEqual(2000);
        expect(panel.heightMm).toBeGreaterThanOrEqual(10);
        expect(panel.heightMm).toBeLessThanOrEqual(2000);
        // A screen wider than it is tall, which every one of these is —
        // a portrait entry here would be the numbers swapped.
        expect(panel.widthMm).toBeGreaterThan(panel.heightMm);
      }
    }
  });
});

describe("panelsOf", () => {
  it("answers per brand, and empty for one it doesn't know", () => {
    expect(BRANDS).toContain("Waveshare");
    expect(panelsOf("Waveshare").length).toBeGreaterThan(0);
    expect(panelsOf("")).toEqual([]);
    expect(panelsOf("Nobody")).toEqual([]);
  });
});

describe("findPanel", () => {
  it("only matches a model under its own brand", () => {
    expect(findPanel("Raspberry Pi", "10.1-DSI-TOUCH-A")).toBeUndefined();
  });
});

describe("panelName", () => {
  it("is what the device stores for a screen off the list", () => {
    expect(panelName("Waveshare", "10.1-DSI-TOUCH-A")).toBe(
      "Waveshare 10.1-DSI-TOUCH-A",
    );
  });
});
