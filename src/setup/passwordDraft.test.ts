import { describe, expect, it } from "vitest";

import {
  EMPTY_PASSWORD_DRAFT,
  PASSWORD_MAX,
  PASSWORD_MIN,
  isPasswordComplete,
  passwordDraftErrors,
  type PasswordDraft,
} from "./passwordDraft";

const draft = (patch: Partial<PasswordDraft>): PasswordDraft => ({
  ...EMPTY_PASSWORD_DRAFT,
  ...patch,
});

const typed = (password: string): PasswordDraft =>
  draft({ password, confirm: password });

describe("the password step", () => {
  it("is answered by one KBRD-API would take, typed twice", () => {
    expect(isPasswordComplete(typed("hunter22"))).toBe(true);
    expect(passwordDraftErrors(typed("hunter22"))).toEqual({});
  });

  it("is unanswered until both fields say the same thing", () => {
    expect(isPasswordComplete(EMPTY_PASSWORD_DRAFT)).toBe(false);
    expect(isPasswordComplete(draft({ password: "hunter22" }))).toBe(false);
    expect(
      isPasswordComplete(draft({ password: "hunter22", confirm: "hunter23" })),
    ).toBe(false);
  });

  it("takes the password exactly as it was typed", () => {
    // Spaces at either end included — KBRD-API stores what it is sent,
    // so trimming here would store something nobody can type again.
    expect(isPasswordComplete(typed("  spaces  "))).toBe(true);
  });

  it("holds to KBRD-API's own bounds", () => {
    expect(isPasswordComplete(typed("x".repeat(PASSWORD_MIN - 1)))).toBe(false);
    expect(isPasswordComplete(typed("x".repeat(PASSWORD_MIN)))).toBe(true);
    expect(isPasswordComplete(typed("x".repeat(PASSWORD_MAX)))).toBe(true);
    expect(isPasswordComplete(typed("x".repeat(PASSWORD_MAX + 1)))).toBe(false);
  });
});

describe("what the fields are told", () => {
  it("says nothing about a field not filled in yet", () => {
    expect(passwordDraftErrors(EMPTY_PASSWORD_DRAFT)).toEqual({});
    expect(passwordDraftErrors(draft({ password: "hunter22" }))).toEqual({});
  });

  it("says which of the two is wrong", () => {
    expect(passwordDraftErrors(draft({ password: "short" }))).toEqual({
      password: `At least ${PASSWORD_MIN} characters`,
    });
    expect(
      passwordDraftErrors({ password: "hunter22", confirm: "hunter23" }),
    ).toEqual({ confirm: "The two don't match" });
  });

  it("marks a password past the ceiling even before it is confirmed", () => {
    // The only field whose emptiness isn't what is being judged: there
    // is no way to type past the ceiling by accident and no way to fix
    // it by typing more.
    expect(
      passwordDraftErrors(draft({ password: "x".repeat(PASSWORD_MAX + 1) }))
        .password,
    ).toBe(`At most ${PASSWORD_MAX} characters`);
  });
});
