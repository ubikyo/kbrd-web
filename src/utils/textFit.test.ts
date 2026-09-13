import { expect, test } from "vitest";
import { fitFontSize, type FittedLine } from "./textFit";

// A stand-in for the browser's own measurement: one em per character,
// which makes every expected size below arithmetic anyone can check.
const perCharacter = (line: FittedLine) => line.text.length;

const OPTIONS = {
  fill: 0.8,
  lineHeightRatio: 1.2,
  min: 1,
  measure: perCharacter,
};

test("fills the asked-for fraction of whichever axis binds", () => {
  const lines = [{ text: "1U", bold: true }, { text: "Key" }];

  // Square, and the widest line is "Key" at 3 ems under this stub: the
  // width allows 16 × 0.8 / 3 ≈ 4.27 and the height 16 × 0.8 / 2.2 ≈
  // 5.82, so the width is what binds. (2.2 = one 1.2 gap between the
  // baselines, plus one em for the last line itself.)
  expect(fitFontSize(lines, { width: 16, height: 16 }, OPTIONS)).toBeCloseTo(
    (16 * 0.8) / 3,
  );
  // The same cell made spacebar-wide: the width stops binding and the
  // height does instead — which is why a 9U key doesn't shout.
  expect(fitFontSize(lines, { width: 100, height: 16 }, OPTIONS)).toBeCloseTo(
    (16 * 0.8) / 2.2,
  );
});

test("grows with the cell it is given", () => {
  const lines = [{ text: "1U", bold: true }, { text: "Key" }];
  // Wide enough that the height binds in both, which is the case the
  // grid is actually in: a label is far easier to fit across a keycap
  // than down it.
  const small = fitFontSize(lines, { width: 100, height: 16 }, OPTIONS);
  const tall = fitFontSize(lines, { width: 100, height: 48 }, OPTIONS);

  // Three rows tall: the label is three times the size, which is the
  // whole point of fitting it per cell.
  expect(tall).toBeCloseTo(small * 3);
});

test("a line set smaller is measured and stacked at its own size", () => {
  // Under this stub "Key" is 3 ems and "1U" is 2. Dropping "Key" to 0.8
  // of the block's size takes it to 2.4 — still the wider of the two, so
  // it still binds, but at 2.4 where it bound at 3 before.
  const lines = [{ text: "1U", bold: true }, { text: "Key", scale: 0.8 }];

  expect(fitFontSize(lines, { width: 16, height: 16 }, OPTIONS)).toBeCloseTo(
    (16 * 0.8) / 2.4,
  );
  // Down the page: one 1.2 gap taken at the smaller line's own size,
  // plus that line's own 0.8 em = 1.76, against the 2.2 the two would
  // come to at equal sizes.
  expect(fitFontSize(lines, { width: 100, height: 16 }, OPTIONS)).toBeCloseTo(
    (16 * 0.8) / 1.76,
  );
});

test("a longer line is set smaller in the same box", () => {
  const box = { width: 16, height: 16 };
  const short = fitFontSize([{ text: "1U", bold: true }], box, OPTIONS);
  const long = fitFontSize([{ text: "6.25U", bold: true }], box, OPTIONS);

  expect(long).toBeLessThan(short);
  expect(long).toBeCloseTo((16 * 0.8) / 5);
});

test("stops shrinking at the floor", () => {
  // A sliver of a cell: the fit would be a fraction of a millimetre,
  // which is a smudge whatever it says.
  const fitted = fitFontSize(
    [{ text: "1U", bold: true }, { text: "Key" }],
    { width: 0.5, height: 0.5 },
    OPTIONS,
  );

  expect(fitted).toBe(1);
});

test("a block with nothing in it falls to the floor", () => {
  expect(fitFontSize([], { width: 16, height: 16 }, OPTIONS)).toBe(1);
});

test("a line with no width is bound by the height alone", () => {
  // Not a case the grid produces, but the one that would divide by zero.
  const fitted = fitFontSize([{ text: "" }], { width: 16, height: 16 }, OPTIONS);

  expect(fitted).toBeCloseTo(16 * 0.8);
});
