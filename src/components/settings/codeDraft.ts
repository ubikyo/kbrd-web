import {
  meetsPasswordRules,
  passwordsDisagree,
} from "../../setup/passwordDraft";

/**
 * What the Password tab holds while the Settings modal is open, and the
 * two questions the modal's Save asks of it.
 *
 * Beside the tab rather than in it (see `Code`, and `networkDraft` for
 * the same split on the tab above): the draft lives in `Settings`, which
 * is what reads these.
 */
export type CodeDraft = {
  current: string;
  next: string;
  confirm: string;
};

export const EMPTY_CODE_DRAFT: CodeDraft = {
  current: "",
  next: "",
  confirm: "",
};

/** Whether the tab has been typed in at all. An untouched form is one
 *  Save has nothing to do about, which is the usual case: the modal is
 *  saved far more often than the password is changed. */
export function codeDraftTouched(draft: CodeDraft): boolean {
  return draft.current !== "" || draft.next !== "" || draft.confirm !== "";
}

/** Whether what is typed is a change the device could take: the password
 *  in place is there — an old one, set before these rules were, is still
 *  the one that has to be proved, so it is only ever asked to be there —
 *  the new one meets the five rules, and the retype matches it (see
 *  `setup/passwordDraft`, which the wizard's own step is held to). */
export function codeDraftReady(draft: CodeDraft): boolean {
  return (
    draft.current !== "" &&
    meetsPasswordRules(draft.next) &&
    !passwordsDisagree(draft.next, draft.confirm) &&
    draft.confirm === draft.next
  );
}
