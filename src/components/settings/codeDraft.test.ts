import { describe, expect, it } from "vitest";

import {
  EMPTY_CODE_DRAFT,
  codeDraftReady,
  codeDraftTouched,
} from "./codeDraft";

const GOOD = "Sesame-1234";

describe("codeDraftTouched", () => {
  it("is false for a form nobody has typed in", () => {
    expect(codeDraftTouched(EMPTY_CODE_DRAFT)).toBe(false);
  });

  it("is true as soon as any one of the three has something in it", () => {
    expect(codeDraftTouched({ ...EMPTY_CODE_DRAFT, current: "x" })).toBe(true);
    expect(codeDraftTouched({ ...EMPTY_CODE_DRAFT, next: "x" })).toBe(true);
    expect(codeDraftTouched({ ...EMPTY_CODE_DRAFT, confirm: "x" })).toBe(true);
  });
});

describe("codeDraftReady", () => {
  it("takes the three filled in, the new one to the rules and retyped", () => {
    expect(
      codeDraftReady({ current: "whatever", next: GOOD, confirm: GOOD }),
    ).toBe(true);
  });

  it("asks for the password in place, whatever the new one is", () => {
    expect(codeDraftReady({ current: "", next: GOOD, confirm: GOOD })).toBe(
      false,
    );
  });

  it("holds the new one to the five rules", () => {
    expect(
      codeDraftReady({ current: "whatever", next: "short", confirm: "short" }),
    ).toBe(false);
  });

  it("refuses a retype that isn't the password, half typed or not", () => {
    expect(
      codeDraftReady({ current: "whatever", next: GOOD, confirm: "Sesame-12" }),
    ).toBe(false);
    expect(
      codeDraftReady({
        current: "whatever",
        next: GOOD,
        confirm: "Other-1234",
      }),
    ).toBe(false);
  });
});
