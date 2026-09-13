import { Box, PasswordInput, Stack } from "@mantine/core";

import { passwordDraftErrors, type PasswordDraft } from "./passwordDraft";

type Props = {
  draft: PasswordDraft;
  onChange: (patch: Partial<PasswordDraft>) => void;
};

/**
 * The wizard's password step: what KBRD-WEB will ask for before it hands
 * the app over.
 *
 * The two fields on the left and nothing opposite them — the same two
 * columns as the steps before it, with the right-hand one left empty the
 * way the addressing step leaves it under DHCP.
 *
 * Typed twice because it is never shown again and nothing on the device
 * can say what it was (see KBRD-API's `password.py` — what is stored is a
 * digest): a slip in the one field it would otherwise be would only turn
 * up at the sign-in that no longer works.
 */
export default function PasswordPicker({ draft, onChange }: Props) {
  const errors = passwordDraftErrors(draft);

  return (
    <Box className="setup-columns">
      <Stack gap="md">
        <PasswordInput
          label="Password"
          value={draft.password}
          error={errors.password}
          onChange={(event) =>
            onChange({ password: event.currentTarget.value })
          }
        />
        <PasswordInput
          label="Confirm password"
          value={draft.confirm}
          error={errors.confirm}
          onChange={(event) => onChange({ confirm: event.currentTarget.value })}
        />
      </Stack>
    </Box>
  );
}
