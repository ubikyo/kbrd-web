import { api } from "./client";
import type { NetworkWrite } from "./network";

const SETUP_URL = "/api/setup";

/** The screen as it stands, name included. `name` is empty on a device
 * that has never been through the wizard; `brand`/`model` are only set
 * when the screen was picked out of the known-panel list rather than
 * described by hand. */
export type SetupDisplay = {
  physical_width_mm: number;
  physical_height_mm: number;
  name: string;
  brand: string;
  model: string;
};

export type SetupState = {
  /** False only on a device that has never been set up — a fresh one, or
   * one whose `/data` has been wiped. */
  configured: boolean;
  /** Whether the device has a password at all. Never anything about it:
   * KBRD-API stores a digest and hands nothing back. */
  password_set: boolean;
  display: SetupDisplay;
};

export type SetupWrite = {
  display: {
    name: string;
    brand?: string;
    model?: string;
    physical_width_mm: number;
    physical_height_mm: number;
  };
  /** What KBRD-WEB is to ask for from now on, exactly as it was typed —
   * KBRD-API is what turns it into a digest, and nothing reads it back
   * out. `null` or left out says this device has none. */
  password?: string | null;
  /** `null` says to stay on the hotspot for now. Anything else is saved
   * and joined a moment after this answers. */
  network: NetworkWrite | null;
};

export type SetupResult = {
  ok: true;
  configured: true;
  display: SetupDisplay;
  /** Whether the keyboard is about to leave the network this request came
   * in on. */
  network_applied: boolean;
};

export const getSetup = () => api<SetupState>(SETUP_URL);

/**
 * The wizard's one and only write. Everything is validated before
 * anything is stored: a body KBRD-API refuses leaves the device exactly
 * as it was, still unconfigured, and the wizard starts over rather than
 * handing over a device that is part set up.
 */
export const completeSetup = (payload: SetupWrite) =>
  api<SetupResult>(SETUP_URL, {
    method: "POST",
    body: JSON.stringify(payload),
  });
