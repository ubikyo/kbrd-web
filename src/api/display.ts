import { api } from "./client";
import type { DisplayData, DisplayWrite } from "../types/layout";

const DISPLAY_URL = "/api/display";

export const getDisplay = () => api<DisplayData>(DISPLAY_URL);

export const updateDisplay = (payload: DisplayWrite) =>
  api<DisplayData>(DISPLAY_URL, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
