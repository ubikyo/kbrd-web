import { useRef } from "react";
import { Box, PasswordInput, Stack } from "@mantine/core";

import PasswordRules from "./PasswordRules";
import {
  PASSWORD_MAX,
  passwordDraftErrors,
  type PasswordDraft,
} from "./passwordDraft";

type Props = {
  draft: PasswordDraft;
  onChange: (patch: Partial<PasswordDraft>) => void;
};

/**
 * The wizard's password step: what KBRD-WEB will ask for before it hands
 * the app over.
 *
 * A password and the same password again beside it, one field to a
 * column — which is the one step in the wizard whose second column has
 * something in it (see `.setup-columns`).
 *
 * Typed twice because it is never shown again and nothing on the device
 * can say what it was (see KBRD-API's `password.py` — what is stored is a
 * digest): a slip in the one field it would otherwise be would only turn
 * up at the sign-in that no longer works.
 *
 * The five rules sit under the password rather than beside the
 * confirmation: they are about what is being chosen, and the retype only
 * has to match it (see `PasswordRules`).
 */
export default function PasswordPicker({ draft, onChange }: Props) {
  const errors = passwordDraftErrors(draft);

  // The field opposite, for the caret to be handed to as the password is
  // finished — Enter is what says it is (see `onKeyDown` below). A
  // password has no length that could finish it on its own, which the row
  // of boxes this step used to be did have.
  const confirmRef = useRef<HTMLInputElement>(null);

  return (
    <Box className="setup-columns">
      <Stack gap="xs">
        <PasswordInput
          label="Password"
          maxLength={PASSWORD_MAX}
          // The whole of the answer is typed here, so a device set up
          // from a phone or a shared screen gets the same reveal the
          // Settings form has: the eye is Mantine's own, and it is the
          // only way to read back something that is never shown again.
          value={draft.password}
          error={errors.password}
          onChange={(event) =>
            onChange({ password: event.currentTarget.value })
          }
          onKeyDown={(event) => {
            // Enter moves to the retype rather than finishing the step:
            // the wizard's own Next is a button, and the next thing
            // there is to do here is always to type it again.
            if (event.key === "Enter") {
              event.preventDefault();
              confirmRef.current?.focus();
            }
          }}
        />
        <PasswordRules value={draft.password} />
      </Stack>

      <PasswordInput
        ref={confirmRef}
        label="Confirm password"
        maxLength={PASSWORD_MAX}
        value={draft.confirm}
        error={errors.confirm}
        onChange={(event) => onChange({ confirm: event.currentTarget.value })}
      />
    </Box>
  );
}
