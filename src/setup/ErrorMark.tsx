import { MdError } from "react-icons/md";

/**
 * The mark a field still to be answered carries at the end of its row,
 * and the one the line under those fields repeats — the same glyph in
 * both places, so the message and the rows it is about read as one
 * thing.
 *
 * It is here rather than in either step because both of them want it (see
 * `Ipv4Picker` and `WifiPicker`), and the two have to draw the same mark
 * for that pairing to hold across the wizard.
 */
export default function ErrorMark() {
  // The same red the messages beside it are set in (see
  // `--kbrd-error-color` in App.css), with Mantine's own behind it for
  // anywhere this is ever drawn outside the surfaces that define it.
  return (
    <MdError
      size={16}
      color="var(--kbrd-error-color, var(--mantine-color-red-6))"
    />
  );
}
