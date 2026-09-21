import { useEffect, useRef, useState } from "react";

import { getNetwork, saveNetwork, type NetworkStatus } from "../../api/network";
import {
  EMPTY_NETWORK_DRAFT,
  isNetworkDraftComplete,
  networkBody,
  networkDraftFrom,
  type NetworkDraft,
} from "./networkDraft";

// Same cadence as the device and storage readings in `Settings`. Nothing
// of the reading is shown as such — what it is for is filling the fields
// the first time, and the line the Wi-Fi tab holds while the keyboard is
// on its own hotspot, which it can fall back to under an open tab.
const STATUS_POLL_INTERVAL_MS = 5000;

export type NetworkTabs = {
  draft: NetworkDraft;
  status: NetworkStatus | null;
  patch: (data: Partial<NetworkDraft>) => void;
  /** The access point the keyboard falls back to — `null` off a device,
   * where there is no interface to have one. */
  hotspot: { ssid: string; address: string } | null;
  /** Whether either tab has been changed from what the device holds.
   * What Save reads to know whether there is a network to apply at all —
   * a modal saved for a preference has no business taking the interface
   * down. */
  dirty: boolean;
  /** Whether the draft is one KBRD-API would take — both halves of it. */
  ready: boolean;
  /** Sends the two tabs as one body. Only Save calls this, and only
   * behind its confirmation. */
  apply: () => Promise<void>;
  saving: boolean;
  error: string | null;
  /** For Save to say why it did not get as far as the device. */
  setError: (message: string | null) => void;
  /** Back to what the device holds — what Cancel does, and what a modal
   * opened again starts from. */
  reset: () => void;
  /** The device took it and is joining the network: the tab says where
   * to find the keyboard afterwards, and this page stops answering. */
  applied: boolean;
};

/**
 * The one network form, behind the two tabs that edit it: which Wi-Fi the
 * keyboard joins (see `NetworkWifiTab`) and how it addresses itself on it
 * (see `NetworkIpv4Tab`).
 *
 * A hook rather than state in either tab, because the two are one
 * setting. KBRD-API takes the radio and the addressing in a single body
 * and applies them together (see `networkBody`), and the modal's own
 * Save is what sends it — a draft living in one of the tabs would be
 * half a form, and gone the moment the other was picked. Held in
 * `Settings`, which outlives both pages and owns the Save.
 *
 * Out of the box — and whenever a saved network can't be joined — the
 * keyboard broadcasts an access point of its own and serves DHCP on it,
 * so the app is reachable at a fixed address to be told where to go next
 * (see KBRD-OS's `/usr/bin/kbrd-network`). That is the state most of
 * these settings are filled in from.
 *
 * Applying is the last thing Save does and it is done behind a
 * confirmation: it takes the interface down — usually the very one this
 * browser is on — so the modal stays open afterwards to say where the
 * keyboard will be, rather than closing onto a page that has stopped
 * answering.
 */
export function useNetwork(active: boolean): NetworkTabs {
  const [status, setStatus] = useState<NetworkStatus | null>(null);
  const [draft, setDraft] = useState<NetworkDraft>(EMPTY_NETWORK_DRAFT);
  // The first reading fills the form, and only the first: every later one
  // would overwrite what is being typed. A ref rather than state — it is
  // read and set inside the poll's own callback, and nothing renders off
  // it.
  const seeded = useRef(false);

  // What the device holds, as a draft — the thing `dirty` is measured
  // against. Set from the first reading and again whenever one is
  // applied, so a tab left exactly as it was found asks for nothing.
  const [saved, setSaved] = useState<NetworkDraft | null>(null);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [applied, setApplied] = useState(false);

  // Polled while either tab is open, like the device and storage
  // readings — a connection comes up or falls back to the hotspot on its
  // own.
  useEffect(() => {
    if (!active) return;
    let cancelled = false;

    function poll() {
      getNetwork().then(
        (next) => {
          if (cancelled) return;
          setStatus(next);
          if (seeded.current) return;
          seeded.current = true;
          const opened = networkDraftFrom(next.config);
          setDraft(opened);
          setSaved(opened);
        },
        () => {},
      );
    }

    poll();
    const timer = window.setInterval(poll, STATUS_POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [active]);

  function patch(data: Partial<NetworkDraft>) {
    setDraft((current) => ({ ...current, ...data }));
    setApplied(false);
  }

  async function apply() {
    setSaving(true);
    setError(null);
    try {
      await saveNetwork(networkBody(draft));
    } catch (failure) {
      setError(
        failure instanceof Error ? failure.message : "The change was refused",
      );
      setSaving(false);
      return;
    }
    setSaving(false);
    setSaved(draft);
    setApplied(true);
  }

  function reset() {
    if (saved) setDraft(saved);
    setError(null);
    setApplied(false);
  }

  return {
    draft,
    status,
    patch,
    hotspot: status?.available ? status.hotspot : null,
    // Field for field, the key's own "has it been typed in" included:
    // an untouched form is the one case where the two are the same
    // object, and every other comparison here is of plain strings.
    dirty: saved !== null && JSON.stringify(draft) !== JSON.stringify(saved),
    ready: isNetworkDraftComplete(draft),
    apply,
    saving,
    error,
    setError,
    reset,
    applied,
  };
}
