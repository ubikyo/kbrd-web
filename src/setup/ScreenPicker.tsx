import { useState } from "react";
import {
  Box,
  Group,
  Input,
  NumberInput,
  Radio,
  ScrollArea,
  Stack,
  Text,
  UnstyledButton,
} from "@mantine/core";
import { MdChevronRight, MdMonitor } from "react-icons/md";

import { PANELS } from "./panels";
import {
  MAX_MM,
  MIN_MM,
  screenPanel,
  sizeInRange,
  type ScreenDraft,
} from "./screenDraft";

/** One more reading to hang under the column on the right — what the
 * screen picked here comes to on the device attached now. The wizard
 * has none of these (nothing is attached yet); Settings passes the
 * resolution and the DPI. */
export type ScreenFact = {
  label: string;
  value: string;
};

type Props = {
  draft: ScreenDraft;
  onChange: (patch: Partial<ScreenDraft>) => void;
  facts?: ScreenFact[];
};

/**
 * The wizard's own way of picking a screen: the panels KBRD knows down
 * the left, what that choice comes to down the right.
 *
 * The list cascades — brands at the top level, the models under the one
 * that is open — because a model only means anything under its own brand
 * and the two as a pair of dropdowns asked the same question twice. One
 * brand is open at a time, and none of them to begin with: the frame is
 * eight rows tall, and a list that unfolded anything on its own would
 * push the brands below it out of the frame before they had been read.
 *
 * A screen that isn't on the list is the row under it, the way a hidden
 * network is on the Wi-Fi step (see `WifiPicker`): the same question,
 * described by hand instead of picked — and the fields for it take the
 * column opposite rather than growing this one.
 */
export default function ScreenPicker({ draft, onChange, facts = [] }: Props) {
  // Which brand is unfolded. Only ever a display state: it starts on the
  // brand already picked, so coming back to the step shows the choice in
  // place, and on nothing otherwise — the list opens as the brands
  // alone, which is the question it is really asking first.
  const [open, setOpen] = useState(draft.brand || "");

  const panel = screenPanel(draft);
  const custom = draft.mode === "custom";

  // Read the same way as the facts above them — the label over the
  // value — whichever of the two branches the column is showing.
  const factRows = facts.map((fact) => (
    <Box key={fact.label}>
      <Input.Label>{fact.label}</Input.Label>
      <Text className="setup-fact" size="sm" c="dimmed">
        {fact.value}
      </Text>
    </Box>
  ));

  /** Moving to a screen described by hand starts from nothing: the panel
   * that was selected is not a first guess at another one, it is the
   * thing being moved away from. Already being in the mode is not a
   * move, so refocusing a field leaves what is typed alone. */
  function chooseCustom() {
    if (custom) return;
    onChange({ mode: "custom", brand: "", model: "" });
  }

  return (
    <Box className="setup-columns">
      <Stack gap={0}>
        <Input.Label>Model</Input.Label>

        <Box className="setup-list">
          <ScrollArea className="setup-scroll" type="scroll">
            {PANELS.map((entry) => {
              const unfolded = entry.brand === open;
              return (
                <Box key={entry.brand}>
                  <UnstyledButton
                    className="screen-row"
                    aria-expanded={unfolded}
                    // Folding the brand that is open leaves the list with
                    // nothing unfolded, which is a fair thing to want.
                    onClick={() => setOpen(unfolded ? "" : entry.brand)}
                  >
                    <MdChevronRight
                      className="screen-caret"
                      size={18}
                      data-open={unfolded || undefined}
                    />
                    <Text size="sm" truncate style={{ flex: 1 }}>
                      {entry.brand}
                    </Text>
                  </UnstyledButton>

                  {unfolded &&
                    entry.panels.map((item) => {
                      const selected =
                        !custom &&
                        draft.brand === entry.brand &&
                        draft.model === item.model;
                      return (
                        <UnstyledButton
                          key={item.model}
                          className="screen-row screen-model"
                          data-selected={selected || undefined}
                          onClick={() =>
                            onChange({
                              mode: "known",
                              brand: entry.brand,
                              model: item.model,
                            })
                          }
                        >
                          {/* Display-only: the whole row is what takes
                              the click, so the radio says which one is
                              picked rather than being a second thing to
                              hit. */}
                          <Radio
                            size="xs"
                            color="green"
                            checked={selected}
                            readOnly
                            tabIndex={-1}
                            aria-hidden
                          />
                          <MdMonitor size={16} />
                          <Text size="sm" truncate style={{ flex: 1 }}>
                            {item.model}
                          </Text>
                        </UnstyledButton>
                      );
                    })}
                </Box>
              );
            })}
          </ScrollArea>

          {/* Under the list and inside the same frame: a screen that is
              not on it is still the same question, answered by hand. */}
          <Group className="setup-other" gap="sm" wrap="nowrap">
            <Radio
              size="xs"
              color="green"
              aria-label="Another model"
              checked={custom}
              onChange={chooseCustom}
            />
            <Text size="sm" c="dimmed">
              Another model
            </Text>
          </Group>
        </Box>
      </Stack>

      <Stack gap="md">
        {custom ? (
          <>
            <NumberInput
              label="Width (mm)"
              suffix=" mm"
              min={MIN_MM}
              max={MAX_MM}
              decimalScale={1}
              value={draft.widthMm || ""}
              error={
                draft.widthMm && !sizeInRange(draft.widthMm)
                  ? `Between ${MIN_MM} and ${MAX_MM} mm`
                  : undefined
              }
              onChange={(value) =>
                onChange({ widthMm: typeof value === "number" ? value : 0 })
              }
            />
            <NumberInput
              label="Height (mm)"
              suffix=" mm"
              min={MIN_MM}
              max={MAX_MM}
              decimalScale={1}
              value={draft.heightMm || ""}
              error={
                draft.heightMm && !sizeInRange(draft.heightMm)
                  ? `Between ${MIN_MM} and ${MAX_MM} mm`
                  : undefined
              }
              onChange={(value) =>
                onChange({ heightMm: typeof value === "number" ? value : 0 })
              }
            />
            <Text size="xs" c="dimmed">
              The screen's active area — what it actually draws on, bezel
              excluded.
            </Text>
            {factRows}
          </>
        ) : (
          <>
            {/* What the row on the left comes to, rather than a second
                place to change it: the size every layout is then drawn
                against, and whatever else the panel is worth saying. */}
            <Box>
              <Input.Label>Size</Input.Label>
              <Text className="setup-fact" size="sm" c="dimmed">
                {panel ? `${panel.widthMm} × ${panel.heightMm} mm` : "—"}
              </Text>
            </Box>
            {panel?.note && (
              <Box>
                <Input.Label>Panel</Input.Label>
                <Text className="setup-fact" size="sm" c="dimmed">
                  {panel.note}
                </Text>
              </Box>
            )}
            {factRows}
          </>
        )}
      </Stack>
    </Box>
  );
}
