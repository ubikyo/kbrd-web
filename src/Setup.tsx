import { useEffect, useState } from "react";

import App from "./App";
import SetupWizard from "./setup/SetupWizard";
import { getSetup } from "./api/setup";

type Stage = "reading" | "setup" | "app";

/**
 * Which of the two things this page is: the first-run wizard, or the app.
 *
 * A keyboard that has never been set up has no screen declared and no
 * network but its own hotspot, and the app has nothing useful to do until
 * both are answered — so the wizard comes first and `App` is not mounted
 * at all behind it (see `api/setup.ts` for the flag, and
 * `setup/SetupWizard` for why nothing is written until its last step).
 *
 * Nothing is rendered while the answer is on its way: it is one request,
 * and showing the app for a frame before replacing it with a wizard would
 * be worse than a beat of the page's own background.
 *
 * A KBRD-API that doesn't answer — or one too old to know the route — is
 * not a device asking to be set up: the app is shown, and it has its own
 * ways of saying that nothing replied.
 */
export default function Setup() {
  const [stage, setStage] = useState<Stage>("reading");

  useEffect(() => {
    let cancelled = false;
    getSetup().then(
      (state) => {
        if (!cancelled) setStage(state.configured ? "app" : "setup");
      },
      () => {
        if (!cancelled) setStage("app");
      },
    );
    return () => {
      cancelled = true;
    };
  }, []);

  if (stage === "reading") return null;
  if (stage === "setup")
    return <SetupWizard onDone={() => setStage("app")} />;
  return <App />;
}
