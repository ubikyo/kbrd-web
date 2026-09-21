import { Stack, Text } from "@mantine/core";
import { MdCheckCircle, MdRadioButtonUnchecked } from "react-icons/md";

import { passwordRules } from "./passwordDraft";

/**
 * The five things a password has to be, under the field that takes it —
 * on the wizard's step and on the Settings form that changes it alike
 * (see `PasswordPicker` and `components/settings/Code`).
 *
 * A list rather than a message: these are what is being asked for, not
 * five things done wrong, and each one turns green as it is met so the
 * list reads as progress while the password is typed. Which is why it is
 * there from the first keystroke rather than held back until something
 * is submitted.
 *
 * Nothing at all until then, though: an empty field has been asked
 * nothing yet, and five grey rules under it would be a form telling
 * somebody off for not having started.
 */
export default function PasswordRules({ value }: { value: string }) {
  if (value === "") return null;

  return (
    <Stack gap={2} aria-label="Password rules">
      {passwordRules(value).map((rule) => (
        <Text
          key={rule.label}
          size="xs"
          c={rule.met ? "green" : "dimmed"}
          // The icon sits on the text's own line rather than above it,
          // which is what `inline-flex` and the baseline gap are for.
          style={{ display: "flex", alignItems: "center", gap: 6 }}
        >
          {rule.met ? (
            <MdCheckCircle size={14} />
          ) : (
            <MdRadioButtonUnchecked size={14} />
          )}
          {rule.label}
        </Text>
      ))}
    </Stack>
  );
}
