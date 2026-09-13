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
 * An empty field is not a mistake to shout at — it is one not filled in
 * yet, and what holds the step short of done is `isPasswordComplete`
 * rather than a message under an untouched box. The same rule the Wi-Fi
 * step's own fields follow (see `networkDraftErrors`).
 */
export function passwordDraftErrors(draft: PasswordDraft): PasswordDraftErrors {
  const errors: PasswordDraftErrors = {};

  if (draft.password && draft.password.length < PASSWORD_MIN) {
    errors.password = `At least ${PASSWORD_MIN} characters`;
  } else if (draft.password.length > PASSWORD_MAX) {
    errors.password = `At most ${PASSWORD_MAX} characters`;
  }

  if (draft.confirm && draft.confirm !== draft.password) {
    errors.confirm = "The two don't match";
  }

  return errors;
}

/** Whether the step has been answered: a password KBRD-API would take,
 * typed the same way twice. */
export function isPasswordComplete(draft: PasswordDraft) {
  return (
    draft.password.length >= PASSWORD_MIN &&
    draft.password.length <= PASSWORD_MAX &&
    draft.confirm === draft.password
  );
}
