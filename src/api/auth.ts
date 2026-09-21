import { api } from "./client";

/**
 * The code KBRD-WEB asks for before the app, and the one way to change
 * it (see KBRD-API's `api/auth.py`).
 *
 * The code itself never comes back out of the device — what is stored is
 * a digest — so nothing here reads one. It is proved by sending what was
 * typed, and changed by proving the old one first.
 *
 * The session rides on a cookie the device sets, which the browser
 * attaches to same-origin requests on its own: there is no token to hold
 * on to here, and nothing to put in a header.
 */

const SESSION_URL = "/api/session";
const LOGIN_URL = "/api/login";
const LOGOUT_URL = "/api/logout";
const PASSWORD_URL = "/api/password";

export type SessionState = {
  /** Whether this browser has proved the code. */
  authenticated: boolean;
  /** Whether there is one to prove. False on a device the wizard has
   * never set one on, where the door opens to anyone. */
  password_set: boolean;
};

/**
 * The device said that isn't the code.
 *
 * A class of its own rather than the plain `Error` the shared client
 * throws, and it carries nothing: what it is for is the difference
 * between "that isn't the code" and "the keyboard didn't answer". The
 * two want different words on screen, and only one of them is worth
 * asking the user to try again after.
 */
export class CodeRefused extends Error {
  constructor(message = "wrong code") {
    super(message);
    this.name = "CodeRefused";
  }
}

async function send(url: string, body: unknown): Promise<void> {
  const response = await fetch(url, {
    method: url === PASSWORD_URL ? "PUT" : "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (response.ok) return;

  const data = (await response.json().catch(() => null)) as {
    error?: string;
  } | null;

  // 401 and nothing else: a device that didn't answer at all is not a
  // wrong code, and saying so would send the user hunting for a typo in
  // something they got right.
  if (response.status === 401) throw new CodeRefused(data?.error);
  throw new Error(data?.error ?? `HTTP ${response.status}`);
}

export const getSession = () => api<SessionState>(SESSION_URL);

/** Prove the code. Throws `CodeRefused` for a wrong one, and a plain
 * `Error` for anything else. */
export const login = (password: string) => send(LOGIN_URL, { password });

export const logout = () =>
  api<{ ok: true }>(LOGOUT_URL, { method: "POST" });

/** Replace the code, against the one in place. The old one is asked for
 * even from a browser already signed in — see `api/auth.py` for why. */
export const changePassword = (current: string, password: string) =>
  send(PASSWORD_URL, { current, password });
