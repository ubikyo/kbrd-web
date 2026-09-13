import React from "react";
import ReactDOM from "react-dom/client";
import { MantineProvider } from "@mantine/core";

import Setup from "./Setup";
import { cssVariablesResolver, theme } from "@kbrd/plugins/theme";
import { DEFAULT_COLOR_SCHEME } from "./utils/preferences";

import "@mantine/core/styles.css";
import "./assets/App.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <MantineProvider
      theme={theme}
      cssVariablesResolver={cssVariablesResolver}
      // Which of the two palettes in `@kbrd/plugins/theme` is mounted —
      // Settings' Appearance tab writes this through Mantine's own
      // manager (see `useMantineColorScheme` there), which persists it to
      // `localStorage` under `mantine-color-scheme-value`.
      //
      // `auto` follows the OS and is what an app that has never been told
      // otherwise starts at; the same value is stamped onto `<html>`
      // before this bundle even parses (see the inline script in
      // `index.html`), so the first paint is already the right theme.
      defaultColorScheme={DEFAULT_COLOR_SCHEME}
    >
      <Setup />
    </MantineProvider>
  </React.StrictMode>,
);
