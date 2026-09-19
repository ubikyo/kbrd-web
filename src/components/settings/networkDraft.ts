import type {
  Ipv4Mode,
  NetworkConfig,
  NetworkWrite,
} from "../../api/network";
import { isIpv4, isNetmask } from "./ipv4";

/**
 * The Wi-Fi form as it is being filled in, shared by the two places that
 * ask for one: Settings' Network tab, which shows the whole of it at
 * once, and the first-run wizard, which asks the radio and the addressing
 * as two steps (see `NetworkWifiFields` and `NetworkIpv4Fields`).
 *
 * Addresses are held exactly as they are typed and checked against
 * `ipv4.ts`; `networkBody` is what turns a finished draft back into
 * something KBRD-API takes.
 */

// WPA2's own range, and KBRD-API's (see `api/network.py`).
export const PASSPHRASE_MIN = 8;
export const PASSPHRASE_MAX = 63;

export type NetworkDraft = {
  ssid: string;
  passphrase: string;
  /**
   * The key never comes back from the device, so an untouched field and
   * an empty one are not the same thing: untouched means "keep what is
   * saved" and is sent by leaving `passphrase` out of the body, while
   * emptied means "this network is open". This is what tells them apart.
   */
  passphraseTouched: boolean;
  mode: Ipv4Mode;
  address: string;
  netmask: string;
  gateway: string;
  dns1: string;
  dns2: string;
};

export const EMPTY_NETWORK_DRAFT: NetworkDraft = {
  ssid: "",
  passphrase: "",
  passphraseTouched: false,
  mode: "dhcp",
  address: "",
  netmask: "",
  gateway: "",
  dns1: "",
  dns2: "",
};

/** The saved configuration, opened up for editing. */
export function networkDraftFrom(config: NetworkConfig): NetworkDraft {
  return {
    ...EMPTY_NETWORK_DRAFT,
    ssid: config.ssid,
    mode: config.ipv4.mode,
    address: config.ipv4.address,
    netmask: config.ipv4.netmask,
    gateway: config.ipv4.gateway,
    dns1: config.ipv4.dns1,
    dns2: config.ipv4.dns2,
  };
}

export type NetworkDraftErrors = {
  passphrase?: string;
  address?: string;
  netmask?: string;
  gateway?: string;
  dns1?: string;
  dns2?: string;
};

/** The five addresses a static configuration is made of, in the order
 * they are asked for. All of them: a keyboard with no gateway and no
 * resolver answers on its own network and nowhere else, which is not a
 * configuration anyone means to end up with. */
export type Ipv4Field = "address" | "netmask" | "gateway" | "dns1" | "dns2";

export const IPV4_FIELDS = [
  { key: "address", label: "Address" },
  { key: "netmask", label: "Netmask" },
  { key: "gateway", label: "Gateway" },
  { key: "dns1", label: "DNS 1" },
  { key: "dns2", label: "DNS 2" },
] as const satisfies readonly { key: Ipv4Field; label: string }[];

/**
 * A field is only in error once it holds something that isn't an
 * address. An empty one is not a mistake to shout at — it is a field not
 * filled in yet, and what says the configuration is short of one is
 * `ipv4Missing` rather than a mark under every untouched box.
 */
function addressError(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return isIpv4(trimmed) ? undefined : "Not an IPv4 address";
}

/**
 * The unspecified address: a valid address and a useless setting. The
 * fields start on it as a shape to type over, so it counts as one not
 * filled in rather than as one filled in wrongly.
 */
const UNSPECIFIED = "0.0.0.0";

/** Which of the five are still missing, still `0.0.0.0`, or not an
 * address at all — the fields whose names are marked. */
export function ipv4Problems(draft: NetworkDraft): Ipv4Field[] {
  if (draft.mode !== "static") return [];
  const errors = networkDraftErrors(draft);
  return IPV4_FIELDS.filter(({ key }) => {
    const value = draft[key].toString().trim();
    return !value || value === UNSPECIFIED || errors[key];
  }).map(({ key }) => key);
}

export function networkDraftErrors(draft: NetworkDraft): NetworkDraftErrors {
  const errors: NetworkDraftErrors = {};

  if (
    draft.passphraseTouched &&
    draft.passphrase.length > 0 &&
    (draft.passphrase.length < PASSPHRASE_MIN ||
      draft.passphrase.length > PASSPHRASE_MAX)
  ) {
    errors.passphrase = `Between ${PASSPHRASE_MIN} and ${PASSPHRASE_MAX} characters`;
  }

  if (draft.mode !== "static") return errors;

  errors.address = addressError(draft.address);
  errors.netmask =
    addressError(draft.netmask) ??
    (!draft.netmask.trim() || isNetmask(draft.netmask.trim())
      ? undefined
      : "Not a netmask");
  errors.gateway = addressError(draft.gateway);
  errors.dns1 = addressError(draft.dns1);
  errors.dns2 = addressError(draft.dns2);
  return errors;
}

/**
 * Enough of a radio to try: a network, and a key that is either absent or
 * a length WPA2 takes. The first-run wizard asks for this before it asks
 * how to address it (see `setup/SetupWizard`), so the two halves answer
 * separately.
 */
export function isWifiComplete(draft: NetworkDraft): boolean {
  if (!draft.ssid.trim()) return false;
  return networkDraftErrors(draft).passphrase === undefined;
}

/**
 * The same, and a key that is actually there.
 *
 * An empty passphrase field means two different things in the two places
 * this draft is edited. In Settings it means "keep the one the device
 * already holds", which is why the check above lets it through — the key
 * is never sent back out to be shown, so an untouched field is the only
 * way to say "leave it". On a first run there is no such key: nothing has
 * been configured, so an empty field is an unanswered question and the
 * wizard has no business going on to the next step (see
 * `setup/SetupWizard`).
 *
 * An open network is not a case this takes: KBRD joins one network, and
 * the key is asked for outright rather than offered.
 */
export function isWifiCompleteWithKey(draft: NetworkDraft): boolean {
  if (draft.passphrase.length < PASSPHRASE_MIN) return false;
  return isWifiComplete(draft);
}

/** Addressing KBRD-API would take — always true under DHCP. */
export function isIpv4Complete(draft: NetworkDraft): boolean {
  return ipv4Problems(draft).length === 0;
}

/** Whether the whole draft is one KBRD-API would take. */
export function isNetworkDraftComplete(draft: NetworkDraft): boolean {
  return isWifiComplete(draft) && isIpv4Complete(draft);
}

export function networkBody(draft: NetworkDraft): NetworkWrite {
  const static_ = draft.mode === "static";
  const body: NetworkWrite = {
    ssid: draft.ssid.trim(),
    ipv4: {
      mode: draft.mode,
      address: static_ ? draft.address.trim() : "",
      netmask: static_ ? draft.netmask.trim() : "",
      gateway: static_ ? draft.gateway.trim() : "",
      dns1: static_ ? draft.dns1.trim() : "",
      dns2: static_ ? draft.dns2.trim() : "",
    },
  };
  // Left out entirely while untouched — that is what keeps the saved key,
  // which is never sent back out to be shown in the field.
  if (draft.passphraseTouched) body.passphrase = draft.passphrase;
  return body;
}
