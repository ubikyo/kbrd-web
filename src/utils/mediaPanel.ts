/**
 * The Media panel's own geometry — what `App` opens its track to, and
 * what `App.css` lays its squares out across (`.media-list`). Kept here
 * rather than in `Media` itself so both the panel and the track around it
 * read it from one place.
 */

/** How many squares the library is laid out across. */
export type MediaColumns = 1 | 2;

/** One column's worth of panel — what it opens to with a single column of
 * squares in it. */
export const MEDIA_PANEL_WIDTH = 200;

/**
 * How wide the panel opens for a given column count — one column's worth
 * per column, no room taken off either side: the squares run the full
 * width of the panel, flush against its edges and against each other, and
 * are told apart by the rules between them (see `.media-list` in
 * App.css).
 *
 * So a square is `MEDIA_PANEL_WIDTH` across whatever the count, and each
 * one sits on exactly its share of the panel — half of it at two
 * columns. A second column widens the panel to make room for one more
 * square rather than resizing the ones already there.
 */
export const mediaPanelWidth = (columns: MediaColumns) =>
  columns * MEDIA_PANEL_WIDTH;
