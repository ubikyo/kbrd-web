import { describe, expect, it } from "vitest";

import {
  EMPTY_PASSWORD_DRAFT,
  PASSWORD_MAX,
  PASSWORD_MIN,
  isPasswordComplete,
  meetsPasswordRules,
  passwordDraftErrors,
  passwordRules,
  type PasswordDraft,
} from "./passwordDraft";

const draft = (patch: Partial<PasswordDraft>): PasswordDraft => ({
  ...EMPTY_PASSWORD_DRAFT,
  ...patch,
});

const typed = (password: string): PasswordDraft =>
  draft({ password, confirm: password });

/** One that meets all five rules, at exactly the floor. */
const GOOD = "Kbrd-42x";

/** Which rules a password fails, by their own labels. */
const unmet = (value: string) =>
  passwordRules(value)
    .filter((rule) => !rule.met)
    .map((rule) => rule.label);

describe("the five rules", () => {
  it("reads an empty password as meeting none of them", () => {
    expect(unmet("")).toHaveLength(5);
    expect(meetsPasswordRules("")).toBe(false);
  });

  it("wants a length, a case either way, a digit and a symbol", () => {
    expect(GOOD).toHaveLength(PASSWORD_MIN);
    expect(unmet(GOOD)).toEqual([]);
    expect(unmet("Kbrd-4x")).toEqual([`${PASSWORD_MIN} characters minimum`]);
    expect(unmet("kbrd-42x")).toEqual(["1 uppercase letter"]);
    expect(unmet("KBRD-42X")).toEqual(["1 lowercase letter"]);
    expect(unmet("Kbrd-xxx")).toEqual(["1 digit"]);
    expect(unmet("Kbrd42xx")).toEqual(["1 symbol"]);
  });

  it("counts a letter or a digit the keyboard can type, not an ASCII one", () => {
    // The device is a keyboard and is set up from whatever is plugged
    // into it: an accented capital is a capital, and a digit written in
    // another script is a digit.
    expect(unmet("Étoile-9a")).toEqual([]);
    // A space is neither a letter nor a number, so it is a symbol — and
    // nothing here trims it (see KBRD-API's `password.py`).
    expect(unmet("Kbrd 42x")).toEqual([]);
  });

  it("refuses a password past the ceiling however well it reads", () => {
    const long = GOOD + "x".repeat(PASSWORD_MAX);
    expect(unmet(long)).toEqual([]);
    expect(meetsPasswordRules(long)).toBe(false);
  });
});

describe("the password step", () => {
  it("is answered by a password KBRD-API would take, typed twice", () => {
    expect(isPasswordComplete(typed(GOOD))).toBe(true);
    expect(passwordDraftErrors(typed(GOOD))).toEqual({});
  });

  it("is unanswered until both fields say the same thing", () => {
    expect(isPasswordComplete(EMPTY_PASSWORD_DRAFT)).toBe(false);
    expect(isPasswordComplete(draft({ password: GOOD }))).toBe(false);
    expect(
      isPasswordComplete(draft({ password: GOOD, confirm: GOOD + "x" })),
    ).toBe(false);
  });

  it("is unanswered by a password that meets four of the five", () => {
    expect(isPasswordComplete(typed("kbrd-42x"))).toBe(false);
    expect(isPasswordComplete(typed("Kbrd-4x"))).toBe(false);
  });

  it("takes the password exactly as it was typed", () => {
    // Untrimmed, unchanged: what is sent is the string in the field, and
    // a password stored as something else is one nobody can type again.
    expect(isPasswordComplete(typed(" Kbrd-42x "))).toBe(true);
  });
});

describe("what the fields are told", () => {
  it("says nothing about a password not finished yet", () => {
    expect(passwordDraftErrors(EMPTY_PASSWORD_DRAFT)).toEqual({});
    expect(passwordDraftErrors(draft({ password: "Kb" }))).toEqual({});
    expect(passwordDraftErrors(draft({ password: GOOD }))).toEqual({});
  });

  it("holds the mismatch back while the retype is still on its way", () => {
    // Every confirmation disagrees with the password above it while it is
    // still being typed, so a message from the first character would be
    // one the step takes back at the last.
    expect(
      passwordDraftErrors({ password: GOOD, confirm: GOOD.slice(0, 4) }),
    ).toEqual({});
  });

  it("says so once the retype can no longer become the password", () => {
    expect(
      passwordDraftErrors({ password: GOOD, confirm: "Kbrd-4y" }),
    ).toEqual({ confirm: "The two don't match" });
    // Longer than the password, and right up to where it ends: still
    // something else.
    expect(
      passwordDraftErrors({ password: GOOD, confirm: GOOD + "x" }),
    ).toEqual({ confirm: "The two don't match" });
  });

  it("marks a password past the ceiling even before it is confirmed", () => {
    expect(
      passwordDraftErrors(draft({ password: "x".repeat(PASSWORD_MAX + 1) }))
        .password,
    ).toBe(`At most ${PASSWORD_MAX} characters`);
  });
});
