/**
 * The screens KBRD is known to be built on, so the first run is a pick
 * from a list rather than two numbers off a datasheet.
 *
 * Reference data, and it lives here rather than in KBRD-API because that
 * is all it is: the device stores the screen it was told about (name,
 * brand, model and size — see `api/setup.ts`), never this list, so a
 * panel added here is available immediately and a device already set up
 * is unaffected by it.
 *
 * Sizes are the panel's *active area* in millimetres, which is what the
 * display grid is laid out against — not the bezel, and not the diagonal
 * the model name quotes.
 */

export type Panel = {
  model: string;
  widthMm: number;
  heightMm: number;
  /** What the model is, in the words someone picking it would use. */
  note?: string;
};

export type Brand = {
  brand: string;
  panels: Panel[];
};

export const PANELS: Brand[] = [
  {
    brand: "Waveshare",
    panels: [
      {
        // KBRD's own development panel (see the project README), and the
        // same 216 × 135 mm KBRD-API's `display` row starts on and
        // KBRD-DEV falls back to while no screen has reported itself.
        model: "10.1-DSI-TOUCH-A",
        widthMm: 216,
        heightMm: 135,
        note: "10.1″ DSI, 1280 × 800",
      },
      {
        model: "7inch-DSI-LCD-C",
        widthMm: 154,
        heightMm: 86,
        note: "7″ DSI, 1024 × 600",
      },
      {
        model: "5inch-DSI-LCD",
        widthMm: 110,
        heightMm: 62,
        note: "5″ DSI, 800 × 480",
      },
    ],
  },
  {
    brand: "Raspberry Pi",
    panels: [
      {
        model: "Touch Display 2",
        widthMm: 155,
        heightMm: 86,
        note: "7″ DSI, 1280 × 720",
      },
      {
        model: "Touch Display",
        widthMm: 154,
        heightMm: 86,
        note: "7″ DSI, 800 × 480",
      },
    ],
  },
];

export const BRANDS = PANELS.map((entry) => entry.brand);

export const panelsOf = (brand: string): Panel[] =>
  PANELS.find((entry) => entry.brand === brand)?.panels ?? [];

export const findPanel = (brand: string, model: string): Panel | undefined =>
  panelsOf(brand).find((panel) => panel.model === model);

/** What the device stores as the screen's name for a panel off this list
 * — brand and model together, since either alone would be ambiguous next
 * to a name someone typed themselves. */
export const panelName = (brand: string, model: string) => `${brand} ${model}`;
