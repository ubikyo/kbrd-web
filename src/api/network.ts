import { api } from "./client";

const NETWORK_URL = "/api/network";
const SCAN_URL = "/api/network/scan";

export type Ipv4Mode = "dhcp" | "static";

/** A static IPv4 configuration as it is stored, addresses as plain
 * strings. Every field but `mode` is empty under `dhcp`. */
export type NetworkIpv4Config = {
  mode: Ipv4Mode;
  address: string;
  netmask: string;
  gateway: string;
  dns1: string;
  dns2: string;
};

export type NetworkConfig = {
  ssid: string;
  /** Whether a key is stored. The key itself never comes back out. */
  secured: boolean;
  ipv4: NetworkIpv4Config;
};

/** What the interface is actually doing, as opposed to `config`, which is
 * what it was last told to do — a network that couldn't be joined leaves
 * the configuration in place and the hotspot up. */
export type NetworkStatus =
  | {
      // Off the device: `/usr/bin/kbrd-network` only exists on the
      // keyboard, so there is nothing to read but the saved settings.
      available: false;
      config: NetworkConfig;
    }
  | {
      available: true;
      interface: string;
      mode: "wifi" | "hotspot" | "unknown";
      connected: boolean;
      /** The network joined, or the hotspot's own name while it is up. */
      ssid: string;
      ipv4: {
        address: string;
        netmask: string;
        gateway: string;
        dns: string[];
      };
      /** The access point the keyboard falls back to. */
      hotspot: { ssid: string; address: string };
      config: NetworkConfig;
    };

export type ScannedNetwork = {
  ssid: string;
  /** As iwd names it — `psk`, `open`, `8021x`. */
  security: string;
};

export type NetworkWrite = {
  ssid: string;
  /**
   * Left out to keep the key already saved — it is never sent back out,
   * so there is nothing to put in the field for the user to leave alone.
   * An empty string is a different answer: it says the network is open.
   */
  passphrase?: string;
  ipv4: NetworkIpv4Config;
};

export const getNetwork = () => api<NetworkStatus>(NETWORK_URL);

/** Takes a few seconds: the radio has to scan. */
export const scanNetworks = () =>
  api<{ networks: ScannedNetwork[] }>(SCAN_URL, { method: "POST" });

/**
 * Saved at once, applied about a second later — which drops the interface
 * this very request came in on. Expect the connection to go away.
 */
export const saveNetwork = (settings: NetworkWrite) =>
  api<{ ok: true; config: NetworkConfig }>(NETWORK_URL, {
    method: "PUT",
    body: JSON.stringify(settings),
  });
