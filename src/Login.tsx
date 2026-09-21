import { useRef, useState } from "react";
import { Box, Button, PasswordInput, Stack, Text } from "@mantine/core";

import kbrdLogo from "./assets/media/KBRD-Alt.svg";
import { CodeRefused, login } from "./api/auth";
import { PASSWORD_MAX } from "./setup/passwordDraft";

/**
 * What stands between a configured keyboard and the app: the password the
 * wizard asked for, typed back (see `setup/PasswordPicker`).
 *
 * The device is what says whether it is right — nothing here compares
 * anything, and nothing here ever holds the password that was set.
 * Nothing bounds the guessing either, on the device or here (see
 * KBRD-API's `api/auth.py`): a wrong password is answered as a wrong
 * password, as many times as one is typed.
 *
 * The field empties itself on a refusal and takes the caret back: the
 * next thing to do is type it again, and a field still holding the wrong
 * password is one to clear before that can start.
 *
 * A form, and a button under the field. A password has no length that
 * could finish it the way the row of four boxes this page used to be
 * finished itself, so saying when it is typed is the user's to do —
 * Enter or the button, which is one thing in two places rather than two.
 * The form is also what lets a password manager fill the page and submit
 * it.
 *
 * No name over the field: there is one thing to type here and nothing it
 * could be mistaken for, so the placeholder says it and the label lives
 * only for a screen reader.
 */
export default function Login({ onDone }: { onDone: () => void }) {
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const field = useRef<HTMLInputElement>(null);

  async function submit() {
    if (code === "" || busy) return;
    setBusy(true);
    setError(null);
    try {
      await login(code);
      onDone();
    } catch (failure) {
      setError(
        failure instanceof CodeRefused
          ? "Incorrect password"
          : failure instanceof Error
            ? failure.message
            : "The password was refused",
      );
      setCode("");
      field.current?.focus();
    }
    setBusy(false);
  }

  return (
    <Box className="login-page" bg="var(--kbrd-color-body)">
      {/* One gap for the whole column, the same one the field and its
          button are set apart by inside the form below: four things
          stacked on one rhythm rather than a mark held off at arm's
          length from a form with its own spacing.

          `xl` is Mantine's 2rem against `md`'s 1rem — twice the gap, and
          both sides of the form have to name it or the rhythm breaks at
          the seam between them. */}
      <Stack className="login-form" align="center" gap="xl">
        <img className="login-logo" src={kbrdLogo} alt="KBRD" />

        <form
          style={{ width: "100%" }}
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <Stack gap="xl">
            <PasswordInput
              ref={field}
              // The name the field hasn't got on screen.
              aria-label="Password"
              placeholder="Password"
              maxLength={PASSWORD_MAX}
              autoFocus
              disabled={busy}
              // Red while the refusal is still the last thing that
              // happened, and not a moment longer: once a character has
              // been typed the field is a fresh answer, and colouring it
              // by the old one would be the page judging something
              // nobody has finished saying.
              error={error !== null && code.length === 0}
              value={code}
              onChange={(event) => setCode(event.currentTarget.value)}
            />
            <Button
              type="submit"
              color="green"
              fullWidth
              disabled={code === ""}
              loading={busy}
            >
              Unlock
            </Button>
          </Stack>
        </form>

        {/* The line is always here and the message is what comes and
            goes, so nothing above it moves when a password is refused
            (see `.login-message`): a logo that jumped up the page at the
            moment of being told you were wrong would be the page
            flinching.

            It stays through the retype rather than going at the first
            keystroke. That the last password was wrong is exactly what is
            worth having in front of you while typing the next one; the
            next attempt is what clears it, because that is what makes it
            out of date. */}
        <Text className="login-message" size="sm">
          {error}
        </Text>
      </Stack>
    </Box>
  );
}
