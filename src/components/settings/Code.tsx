import { Group, PasswordInput, Stack, Text, Title } from "@mantine/core";

import PasswordRules from "../../setup/PasswordRules";
import { PASSWORD_MAX, passwordsDisagree } from "../../setup/passwordDraft";
import type { CodeDraft } from "./codeDraft";

type Props = {
  draft: CodeDraft;
  onChange: (patch: Partial<CodeDraft>) => void;
  /** What the device said when Save last tried to change the password,
   *  or what this form is still missing for it to try at all. */
  error: string | null;
  busy: boolean;
};

/**
 * Settings' own password, changed the way KBRD-API insists it is changed:
 * the one in place first, then the new one twice (see its `api/auth.py`).
 *
 * The old password is asked for even here, inside an app this browser is
 * already signed in to. A session says a password was proved at some
 * point on this machine, and an unattended machine is the case the
 * question is there for — the device refuses a body without it whatever
 * this form did, so asking is the honest shape rather than an extra
 * hurdle.
 *
 * The new one is held to the same five rules the wizard's step asks for,
 * off the same list (see `setup/PasswordRules`): a password can be
 * changed here, not escaped.
 *
 * What is typed is a draft like every other field in the modal, and the
 * modal's own Save is what sends it — this tab has no button of its own.
 * The draft therefore lives in `Settings`, which is also what keeps it
 * through the tab being left and come back to.
 */
export default function Code({ draft, onChange, error, busy }: Props) {
  // Only once the retype has gone somewhere the password can't follow:
  // every confirmation differs from it while it is still being typed
  // (see `passwordsDisagree`).
  const mismatch = passwordsDisagree(draft.next, draft.confirm);

  return (
    <Stack className="settings-code" gap="md">
      <Title order={4}>Password</Title>

      <PasswordInput
        label="Current password"
        w={188}
        maxLength={PASSWORD_MAX}
        value={draft.current}
        disabled={busy}
        onChange={(event) => onChange({ current: event.currentTarget.value })}
      />

      {/* The new password and its retype side by side, the way the
          wizard's own step puts them (see `setup/PasswordPicker`), with
          that step's own 40px gutter between them (see
          `.setup-columns`). A row rather than the wizard's grid: these
          fields carry a width of their own, so halving the tab would
          only push the retype away from the password it belongs to.

          The five rules sit under the password rather than beside the
          retype, again as in the wizard: they are about what is being
          chosen, and the retype only has to match it. */}
      <Group align="flex-start" gap={40} wrap="nowrap">
        <Stack gap="xs">
          <PasswordInput
            label="New password"
            w={188}
            maxLength={PASSWORD_MAX}
            value={draft.next}
            disabled={busy}
            onChange={(event) => onChange({ next: event.currentTarget.value })}
          />
          <PasswordRules value={draft.next} />
        </Stack>

        <PasswordInput
          label="Confirm new password"
          w={188}
          maxLength={PASSWORD_MAX}
          value={draft.confirm}
          error={mismatch ? "The two don't match" : undefined}
          disabled={busy}
          onChange={(event) => onChange({ confirm: event.currentTarget.value })}
        />
      </Group>

      {error && (
        <Text size="sm" c="red">
          {error}
        </Text>
      )}
    </Stack>
  );
}
