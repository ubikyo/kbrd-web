import { describe, expect, it } from "vitest";

import {
  EMPTY_NETWORK_DRAFT,
  IPV4_FIELDS,
  ipv4Problems,
  isNetworkDraftComplete,
  isWifiComplete,
  isWifiCompleteWithKey,
  networkBody,
  networkDraftErrors,
  networkDraftFrom,
  type NetworkDraft,
} from "./networkDraft";

const dhcp: NetworkDraft = {
  ...EMPTY_NETWORK_DRAFT,
  ssid: "Unify",
  passphrase: "hunter22",
  passphraseTouched: true,
};

const staticDraft: NetworkDraft = {
  ...dhcp,
  mode: "static",
  address: "192.168.1.50",
  netmask: "255.255.255.0",
  gateway: "192.168.1.1",
  dns1: "1.1.1.1",
  dns2: "8.8.8.8",
};

describe("networkDraftFrom", () => {
  it("opens the saved configuration up for editing", () => {
    const draft = networkDraftFrom({
      ssid: "Unify",
      secured: true,
      ipv4: {
        mode: "static",
        address: "192.168.1.50",
        netmask: "255.255.255.0",
        gateway: "192.168.1.1",
        dns1: "1.1.1.1",
        dns2: "",
      },
    });
    expect(draft.ssid).toBe("Unify");
    expect(draft.mode).toBe("static");
    expect(draft.address).toBe("192.168.1.50");
    expect(draft.dns2).toBe("");
    // The key never comes back, so the field starts untouched — which is
    // what keeps whatever is stored.
    expect(draft.passphrase).toBe("");
    expect(draft.passphraseTouched).toBe(false);
  });
});

describe("networkDraftErrors", () => {
  it("has nothing to say about a DHCP network", () => {
    expect(networkDraftErrors(dhcp)).toEqual({});
  });

  it("refuses a key outside WPA2's range, but not an empty one", () => {
    expect(
      networkDraftErrors({ ...dhcp, passphrase: "short" }).passphrase,
    ).toBeTruthy();
    // Empty is an open network, not a mistake.
    expect(
      networkDraftErrors({ ...dhcp, passphrase: "" }).passphrase,
    ).toBeUndefined();
  });

  it("leaves an untouched key alone whatever is in it", () => {
    // Nothing was typed, so nothing is being set — the stored key stands.
    expect(
      networkDraftErrors({
        ...dhcp,
        passphrase: "x",
        passphraseTouched: false,
      }).passphrase,
    ).toBeUndefined();
  });

  it("says nothing about a field that is simply empty", () => {
    // Every one of the five is required, so an empty box is a step not
    // finished rather than a mistake to mark — `ipv4Problems` is what
    // says the configuration is short of one.
    const errors = networkDraftErrors({
      ...staticDraft,
      address: "",
      netmask: "",
      gateway: "",
    });
    expect(errors.address).toBeUndefined();
    expect(errors.netmask).toBeUndefined();
    expect(errors.gateway).toBeUndefined();
  });

  it("tells something that is not an address from a missing one", () => {
    expect(networkDraftErrors({ ...staticDraft, gateway: "192.168.1" }).gateway)
      .toBe("Not an IPv4 address");
    expect(networkDraftErrors({ ...staticDraft, gateway: "10.0.0.256" }).gateway)
      .toBe("Not an IPv4 address");
  });

  it("refuses a netmask whose bits are not contiguous", () => {
    expect(
      networkDraftErrors({ ...staticDraft, netmask: "255.0.255.0" }).netmask,
    ).toBe("Not a netmask");
  });
});

describe("isNetworkDraftComplete", () => {
  it("needs an SSID", () => {
    expect(isNetworkDraftComplete(dhcp)).toBe(true);
    expect(isNetworkDraftComplete({ ...dhcp, ssid: "  " })).toBe(false);
  });

  it("needs every one of the five under Static but the second resolver", () => {
    expect(isNetworkDraftComplete(staticDraft)).toBe(true);
    for (const { key, label } of IPV4_FIELDS) {
      expect(
        isNetworkDraftComplete({ ...staticDraft, [key]: "" }),
        label,
      ).toBe(key === "dns2");
    }
  });

  it("takes a static configuration with one resolver", () => {
    // A spare, not a requirement: names resolve through the first, and
    // a network with one DNS server is a network that works.
    expect(isNetworkDraftComplete({ ...staticDraft, dns2: "" })).toBe(true);
    expect(isNetworkDraftComplete({ ...staticDraft, dns2: "0.0.0.0" })).toBe(
      true,
    );
    // Optional is not unchecked.
    expect(isNetworkDraftComplete({ ...staticDraft, dns2: "10.0.0.256" })).toBe(
      false,
    );
  });

  it("asks for none of them under DHCP", () => {
    expect(isNetworkDraftComplete({ ...dhcp, mode: "dhcp" })).toBe(true);
  });
});

describe("isWifiCompleteWithKey", () => {
  it("takes the same draft the settings form would", () => {
    expect(isWifiCompleteWithKey(dhcp)).toBe(true);
  });

  it("refuses the empty passphrase that means \"keep the saved key\"", () => {
    const blank = { ...dhcp, passphrase: "", passphraseTouched: false };
    // Settings takes it: there, an untouched field is how the device's
    // own key is left alone.
    expect(isWifiComplete(blank)).toBe(true);
    // A first run has no such key to leave alone.
    expect(isWifiCompleteWithKey(blank)).toBe(false);
  });

  it("refuses a key too short for WPA2, as the shared rule does", () => {
    expect(isWifiCompleteWithKey({ ...dhcp, passphrase: "short" })).toBe(false);
  });

  it("still needs an SSID", () => {
    expect(isWifiCompleteWithKey({ ...dhcp, ssid: "  " })).toBe(false);
  });
});

describe("ipv4Problems", () => {
  it("is empty for a configuration that holds up", () => {
    expect(ipv4Problems(staticDraft)).toEqual([]);
    // Nothing is asked for under DHCP, whatever the fields hold.
    expect(ipv4Problems({ ...staticDraft, mode: "dhcp" })).toEqual([]);
  });

  it("names what is missing and what is wrong, in the order asked", () => {
    expect(
      ipv4Problems({
        ...staticDraft,
        netmask: "255.0.255.0",
        gateway: "",
        dns2: "10.0.0.256",
      }),
    ).toEqual(["netmask", "gateway", "dns2"]);
  });

  it("counts the unspecified address as one not filled in", () => {
    // A valid address and a useless setting: it is what the fields start
    // on, so leaving it there is leaving the step undone.
    expect(ipv4Problems({ ...staticDraft, address: "0.0.0.0" })).toEqual([
      "address",
    ]);
  });

  it("says nothing about a second resolver left unanswered", () => {
    expect(ipv4Problems({ ...staticDraft, dns2: "" })).toEqual([]);
    expect(ipv4Problems({ ...staticDraft, dns2: "0.0.0.0" })).toEqual([]);
    // And still names it when what is there isn't an address.
    expect(ipv4Problems({ ...staticDraft, dns2: "10.0.0.256" })).toEqual([
      "dns2",
    ]);
  });
});

describe("networkBody", () => {
  it("sends no address at all under DHCP", () => {
    expect(networkBody(dhcp)).toEqual({
      ssid: "Unify",
      passphrase: "hunter22",
      ipv4: {
        mode: "dhcp",
        address: "",
        netmask: "",
        gateway: "",
        dns1: "",
        dns2: "",
      },
    });
  });

  it("sends the addresses as they were written, trimmed", () => {
    expect(networkBody({ ...staticDraft, address: " 192.168.1.50 " }).ipv4).toEqual({
      mode: "static",
      address: "192.168.1.50",
      netmask: "255.255.255.0",
      gateway: "192.168.1.1",
      dns1: "1.1.1.1",
      dns2: "8.8.8.8",
    });
  });

  it("sends no second resolver for one left unanswered", () => {
    // `0.0.0.0` included: the field starts on it, and sending it would
    // hand the keyboard a resolver that resolves nothing rather than
    // telling it there is no second one.
    expect(networkBody({ ...staticDraft, dns2: "" }).ipv4.dns2).toBe("");
    expect(networkBody({ ...staticDraft, dns2: "0.0.0.0" }).ipv4.dns2).toBe("");
  });

  it("leaves the key out entirely while the field is untouched", () => {
    // That is what tells KBRD-API to keep the one it has — an empty
    // string would say the network is open.
    expect(networkBody({ ...dhcp, passphraseTouched: false })).not.toHaveProperty(
      "passphrase",
    );
    expect(networkBody({ ...dhcp, passphrase: "" })).toHaveProperty(
      "passphrase",
      "",
    );
  });
});
