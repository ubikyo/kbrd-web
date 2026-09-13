/**
 * Sizing a run of SVG text to the box it has to sit in.
 *
 * The grid is drawn in millimetres of real glass, and a cell's own size
 * varies by an order of magnitude across one layout — a 1U key and a 9U
 * spacebar merged three rows tall are the same `<text>` element with the
 * same two lines in it. A fixed font size can only be right for one of
 * them: chosen for the small cell it leaves the large one nearly empty,
 * chosen for the large one it overflows the small one.
 *
 * So the size is computed per cell instead, from the box the label is
 * given and the strings actually in it. That needs the strings' widths,
 * which nothing about them predicts — "1.25U" is not five times the
 * width of "1U", and the app's font is a system stack that differs by
 * machine. They are measured, once each, off a hidden `<text>` node in
 * the document: the same renderer and the same inherited font as the
 * real label, so what comes back is what the real label will do.
 *
 * The measuring is split from the arithmetic on purpose — `fitFontSize`
 * takes whatever `measure` it is handed, which is what lets it be tested
 * without a browser.
 */

const SVG_NS = "http://www.w3.org/2000/svg";

/**
 * The size the probe measures at. Large enough that a width comes back
 * with digits to spare — the ratio is what's kept, and measuring at 1
 * would round most of it away.
 */
const PROBE_FONT_SIZE = 100;

/**
 * Width of one character, in ems, where nothing can be measured — no
 * document (a test, a server render), or a probe the browser won't lay
 * out. A rough average for the Latin text these labels are: enough to
 * keep a label roughly the right size rather than correct.
 */
const ESTIMATED_WIDTH_RATIO = 0.6;

/**
 * One line of a label: its text, whether it reads bold, and its size
 * relative to the block's own.
 *
 * `scale` is what lets a label mix sizes — a caption line set smaller
 * than the line it captions — while still being fitted as one block: the
 * size that comes back is the one a `scale` of 1 is drawn at, and every
 * other line is drawn at its own multiple of it.
 */
export type FittedLine = { text: string; bold?: boolean; scale?: number };

const scaleOf = (line: FittedLine) => line.scale ?? 1;

// Keyed by weight and string together, since the two weights measure
// differently. The distinct strings across a whole layout are a handful
// ("1U", "1.25U", "Key", "Space"…), so this stops growing almost at once
// and every later cell measures nothing at all.
const ratios = new Map<string, number>();

let probe: SVGTextElement | null = null;

/**
 * The hidden `<text>` every measurement is taken from, made on first use
 * and kept.
 *
 * On `document.body` rather than inside the grid's own SVG, so it
 * inherits the app's font exactly as the real labels do without needing
 * a ref to reach into. Hidden by `visibility` and a zero-sized box — not
 * by `display: none`, which would stop the browser laying the text out
 * and leave every measurement at zero.
 */
function probeNode(): SVGTextElement | null {
  if (probe) return probe;
  if (typeof document === "undefined" || !document.body) return null;
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("aria-hidden", "true");
  svg.style.position = "absolute";
  svg.style.width = "0";
  svg.style.height = "0";
  svg.style.overflow = "hidden";
  svg.style.visibility = "hidden";
  svg.style.pointerEvents = "none";
  const text = document.createElementNS(SVG_NS, "text");
  text.setAttribute("font-size", String(PROBE_FONT_SIZE));
  svg.appendChild(text);
  document.body.appendChild(svg);
  probe = text;
  return text;
}

/**
 * How wide a line is as a multiple of its own font size — so a 5mm font
 * draws it 5 × this wide.
 *
 * A width that can't be taken is estimated and *not* cached: a browser
 * that hasn't laid the probe out yet would otherwise be wrong about that
 * string for the rest of the session.
 */
export function textWidthRatio({ text, bold = false }: FittedLine): number {
  if (text === "") return 0;
  const key = `${bold ? "b" : "r"}:${text}`;
  const cached = ratios.get(key);
  if (cached !== undefined) return cached;
  const node = probeNode();
  if (node) {
    node.setAttribute("font-weight", bold ? "bold" : "normal");
    node.textContent = text;
    // jsdom has the method but no text layout behind it, and answers 0.
    const width = node.getComputedTextLength?.() ?? 0;
    if (width > 0) {
      const ratio = width / PROBE_FONT_SIZE;
      ratios.set(key, ratio);
      return ratio;
    }
  }
  return text.length * ESTIMATED_WIDTH_RATIO;
}

type FitOptions = {
  /**
   * How much of the box the block of lines is allowed to take, on
   * whichever axis binds first — the other one comes out smaller, since
   * one font size has to serve both.
   */
  fill: number;
  /** Baseline-to-baseline distance, as a multiple of the font size. */
  lineHeightRatio: number;
  /** Never smaller than this, however little room there is. */
  min: number;
  /** Swapped out in tests; defaults to measuring the real font. */
  measure?: (line: FittedLine) => number;
};

/**
 * The font size at which `lines` fill `fill` of `box` — the largest that
 * fits both across and down.
 *
 * Height is counted as the gaps between the baselines plus one em for
 * the last line, which is a little more than the lines actually ink (a
 * capital reaches about 0.7em): the block comes out slightly inside the
 * fraction asked for rather than slightly over it, which is the side to
 * be wrong on when the box is a keycap the text must not spill out of.
 */
export function fitFontSize(
  lines: FittedLine[],
  box: { width: number; height: number },
  { fill, lineHeightRatio, min, measure = textWidthRatio }: FitOptions,
): number {
  if (lines.length === 0) return min;
  // Each line's own width is its text's times the size *it* is drawn at,
  // so a long line set small can stop being the one that binds.
  const widest = Math.max(...lines.map((line) => measure(line) * scaleOf(line)));
  // The gaps between the baselines — each one taken at the size of the
  // line it drops *to*, so a smaller line follows more closely, the way
  // leading works on paper — plus one em of the last line for the line
  // itself.
  const tall =
    lines.reduce(
      (total, line, index) =>
        index === 0 ? total : total + lineHeightRatio * scaleOf(line),
      0,
    ) + scaleOf(lines[lines.length - 1]);
  // A block of empty strings has no width to be bound by — only the
  // height says anything, and dividing by zero here would say Infinity.
  const byWidth = widest > 0 ? (box.width * fill) / widest : Infinity;
  const byHeight = (box.height * fill) / tall;
  return Math.max(min, Math.min(byWidth, byHeight));
}
