/**
 * The password step's own form, kept apart from the step that asks for it
 * the way the screen's and the network's are (see `screenDraft` and
 * `components/settings/networkDraft`).
 *
 * The bounds are KBRD-API's own (see its `password.py`), so a password it
 * would refuse is refused in the field instead — and nothing here is
 * hashed, trimmed or otherwise touched: what is typed is what is sent,
 * once, and the device is what turns it into a digest.
 */

export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 64;

/** One of the five things a password has to be, and whether it is.
 *
 * The five are shown as a list under the field rather than reported one
 * at a time as an error: they are what is being asked for, and a
 * password is typed against all of them at once (see `PasswordRules`). */
export type PasswordRule = {
  label: string;
  met: boolean;
};

/**
 * The five rules read against what has been typed so far.
 *
 * Unicode classes rather than `A-Z`/`a-z`: a password is whatever can be
 * typed on the keyboard this is opened from, and an accented capital is a
 * capital. A symbol is then anything that is neither a letter nor a
 * number, which takes punctuation, spaces and anything else the
 * character set holds rather than a list of the symbols we thought of.
 */
export function passwordRules(value: string): PasswordRule[] {
  return [
    {
      label: `${PASSWORD_MIN} characters minimum`,
      met: value.length >= PASSWORD_MIN,
    },
    { label: "1 uppercase letter", met: /\p{Lu}/u.test(value) },
    { label: "1 lowercase letter", met: /\p{Ll}/u.test(value) },
    { label: "1 digit", met: /\p{Nd}/u.test(value) },
    { label: "1 symbol", met: /[^\p{L}\p{N}]/u.test(value) },
  ];
}

/** Whether a password is one this app will offer the device at all. The
 * ceiling is not one of the rules above — it is not something to ask for,
 * only something to refuse (see `passwordDraftErrors`). */
export const meetsPasswordRules = (value: string) =>
  passwordRules(value).every((rule) => rule.met) &&
  value.length <= PASSWORD_MAX;

/**
 * Whether the confirmation contradicts the password above it.
 *
 * Not simply "the two differ": every password disagrees with the one
 * being typed under it until the last character lands, and a message
 * that appeared on the first keystroke would be there for the whole of
 * the typing. What is caught instead is a confirmation that can no
 * longer become the password — anything that isn't still on its way to
 * being it.
 *
 * Shared with the Settings form that changes a password (see
 * `components/settings/Code`), so the two judge a retype the same way.
 */
export const passwordsDisagree = (password: string, confirm: string) =>
  confirm !== "" && !password.startsWith(confirm);

export type PasswordDraft = {
  password: string;
  /** Typed a second time. Held in the draft rather than in the field so
   * that stepping away and back shows the step as it was left. */
  confirm: string;
};

export const EMPTY_PASSWORD_DRAFT: PasswordDraft = {
  password: "",
  confirm: "",
};

export type PasswordDraftErrors = {
  password?: string;
  confirm?: string;
};

/**
 * What is wrong with the two fields as they stand.
 *
 * A password still being typed is not a mistake to shout at — it is one
 * not finished yet, and what holds the step short of done is
 * `isPasswordComplete` rather than a message under every password on its
 * way to meeting the five rules. The same rule the Wi-Fi step's own
 * fields follow (see `networkDraftErrors`).
 *
 * So the rules themselves are never an error here: they are the list
 * under the field, which reads as what is being asked for rather than as
 * five things done wrong. What is left to say is the ceiling — a
 * password too long is not on its way to anything — and a retype that
 * has gone somewhere else.
 */
export function passwordDraftErrors(draft: PasswordDraft): PasswordDraftErrors {
  const errors: PasswordDraftErrors = {};

  if (draft.password.length > PASSWORD_MAX) {
    errors.password = `At most ${PASSWORD_MAX} characters`;
  }

  if (passwordsDisagree(draft.password, draft.confirm)) {
    errors.confirm = "The two don't match";
  }

  return errors;
}

/** Whether the step has been answered: a password KBRD-API would take,
 * meeting all five rules, typed the same way twice. */
export function isPasswordComplete(draft: PasswordDraft) {
  return (
    meetsPasswordRules(draft.password) && draft.confirm === draft.password
  );
}
