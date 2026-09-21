import { useEffect, useState } from "react";

import App from "./App";
import Login from "./Login";
import SetupWizard from "./setup/SetupWizard";
import { getSession } from "./api/auth";
import { getSetup } from "./api/setup";

type Stage = "reading" | "setup" | "login" | "app";

/**
 * Which of the three things this page is: the first-run wizard, the code
 * it asked for, or the app.
 *
 * A keyboard that has never been set up has no screen declared and no
 * network but its own hotspot, and the app has nothing useful to do until
 * both are answered — so the wizard comes first and `App` is not mounted
 * at all behind it (see `api/setup.ts` for the flag, and
 * `setup/SetupWizard` for why nothing is written until its last step).
 *
 * A device that is set up is asked for its code before the app, every
 * load, until the browser has proved it once (see `api/auth.ts` — the
 * proof is a cookie the device signs, so it outlives a reload and not a
 * browser closed). Only the device knows whether the code is right; this
 * asks it and shows whichever page the answer calls for.
 *
 * Two questions, one request each, and neither page is shown until both
 * have answered: a wizard that flashed up before the session came back
 * would be one the user started answering for nothing. A device with no
 * code set is one with nothing to ask — the session opens on its own
 * rather than putting up a door with no lock in it.
 *
 * A KBRD-API that doesn't answer — or one too old to know either route —
 * is not a device asking to be set up, and not one asking for a code: the
 * app is shown, and it has its own ways of saying that nothing replied.
 */
export default function Setup() {
  const [stage, setStage] = useState<Stage>("reading");

  useEffect(() => {
    let cancelled = false;

    async function read(): Promise<Stage> {
      const state = await getSetup();
      if (!state.configured) return "setup";
      // Asked second and only of a configured device: a keyboard still
      // on its wizard has no code to prove yet.
      const session = await getSession();
      return session.password_set && !session.authenticated ? "login" : "app";
    }

    read().then(
      (next) => {
        if (!cancelled) setStage(next);
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
  // The wizard hands over to the code it has just set rather than to the
  // app: typing it once is what proves it was the one meant, and it is
  // also what opens the session every load after this one needs.
  if (stage === "setup")
    return <SetupWizard onDone={() => setStage("login")} />;
  if (stage === "login") return <Login onDone={() => setStage("app")} />;
  return <App />;
}
