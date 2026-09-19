import { useMemo } from "react";

/**
 * How many streaks are in the sky at once. The pen this is a port of
 * (YusukeNakaya's "Only CSS: Shooting Star", codepen.io/YusukeNakaya/pen/
 * XyOaBj) writes out twenty by hand in SCSS; they are generated here
 * instead, because the numbers in them are random and a loop says that
 * where twenty hand-written blocks only imply it.
 *
 * A quarter of its count, over a panel that shows them in its top two
 * thirds only: twenty across that much sky is a shower rather than the
 * occasional streak the pen reads as at a page's size. At five, with the
 * delays spread over eight seconds and a run of three, the panel is more
 * often showing one or two than all of them.
 */
const STAR_COUNT = 5;

/** How long one streak takes to cross, and the window the delays are
 *  drawn from — a little over twice the run, so the sky is never empty
 *  and never all at once. */
const RUN_MS = 3000;
const SPREAD_MS = 8000;

/**
 * One streak's starting place and its turn.
 *
 * Positions are percentages of the panel rather than the pen's pixels:
 * its sky is a whole page and this one is a column beside the wizard, so
 * a fixed scatter would bunch in the middle of a narrow panel and leave
 * the edges of a wide one empty. They are offsets from the centre, which
 * is where the pen puts its own origin.
 *
 * Every streak starts left of that centre because every streak travels
 * right (see `setup-star-shoot`); the sky is turned 45° under them, so
 * right is down-and-across on screen.
 *
 * `top` is weighted upwards for the same reason the sky is masked (see
 * `.setup-sky`): the bottom third of the panel is where the title and the
 * cards are, and a streak drawn there is one the mask is only going to
 * throw away.
 */
type Star = {
  /** Above or below the centre, as a percentage of the panel's height. */
  top: number;
  /** Left of the centre, as a percentage of its width. */
  left: number;
  /** How long before this one first runs, in ms. */
  delay: number;
};

function scatter(): Star[] {
  return Array.from({ length: STAR_COUNT }, () => ({
    top: Math.random() * 55 - 45,
    left: -(10 + Math.random() * 55),
    delay: Math.round(Math.random() * SPREAD_MS),
  }));
}

/**
 * The moving half of the wizard's art (see `.setup-art` in App.css):
 * shooting stars over the panel's green, in CSS alone.
 *
 * Each streak is one element. Its width is what is animated — out from
 * nothing to a tail and back to nothing — while the element itself is
 * carried across, and its two pseudo-elements cross at the head to make
 * the flare. All of that is in App.css under `.setup-star`; what this
 * component supplies is where each one starts and when it goes.
 *
 * It draws over, not instead of, the panel's own background: the green
 * behind it is the panel's own `background-color` (see `.setup-art`), so
 * a browser that renders none of this is left with a plain green panel
 * rather than an empty box.
 *
 * There is nothing to stop and nothing to free — no canvas, no context,
 * no loop. A CSS animation on an offscreen or hidden element is the
 * browser's own business to park, and `prefers-reduced-motion` is handled
 * where the animation is declared.
 */
export default function SetupArt() {
  // Once per mount: a fresh sky each time the wizard is opened, but a
  // stable one while it is being walked — re-rolling these on a render
  // would restart every streak mid-flight.
  const stars = useMemo(() => scatter(), []);

  return (
    <div className="setup-sky" aria-hidden>
      <div className="setup-sky-field">
        {stars.map((star, index) => (
          <span
            key={index}
            className="setup-star"
            style={
              {
                top: `calc(50% + ${star.top}%)`,
                left: `calc(50% + ${star.left}%)`,
                // A custom property rather than `animationDelay`: the two
                // pseudo-elements have to run on the same clock as the
                // element, and inline styles don't reach them — an
                // inherited variable does.
                "--setup-star-delay": `${star.delay}ms`,
                "--setup-star-run": `${RUN_MS}ms`,
              } as React.CSSProperties
            }
          />
        ))}
      </div>
    </div>
  );
}
