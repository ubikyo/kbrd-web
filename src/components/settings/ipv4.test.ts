import { describe, expect, it } from "vitest";

import { gatewayFor, isIpv4, isNetmask } from "./ipv4";

describe("isIpv4", () => {
  it("accepts four octets, however they are written", () => {
    expect(isIpv4("192.168.1.50")).toBe(true);
    expect(isIpv4("0.0.0.0")).toBe(true);
    expect(isIpv4("255.255.255.255")).toBe(true);
    // Padded is still the same address — it is what a mask used to make
    // of every field, and nothing should have to unlearn it.
    expect(isIpv4("192.168.001.050")).toBe(true);
  });

  it("refuses an octet above 255", () => {
    expect(isIpv4("192.168.1.256")).toBe(false);
    expect(isIpv4("300.1.1.1")).toBe(false);
  });

  it("refuses anything that isn't four octets of digits", () => {
    expect(isIpv4("")).toBe(false);
    expect(isIpv4("192.168.1")).toBe(false);
    expect(isIpv4("192.168.1.50.7")).toBe(false);
    expect(isIpv4("192.168.1.")).toBe(false);
    expect(isIpv4("192.168.1.x")).toBe(false);
    expect(isIpv4(" 192.168.1.50")).toBe(false);
    expect(isIpv4("1920.168.1.50")).toBe(false);
  });
});

describe("isNetmask", () => {
  it("accepts a mask whose set bits are contiguous", () => {
    expect(isNetmask("255.255.255.0")).toBe(true);
    expect(isNetmask("255.255.0.0")).toBe(true);
    expect(isNetmask("255.255.255.192")).toBe(true);
  });

  // The one this is really here for: iwd would take it, and the keyboard
  // would come back up on a network nothing can reach it on.
  it("refuses an address that only looks like a mask", () => {
    expect(isNetmask("255.0.255.0")).toBe(false);
    expect(isNetmask("255.255.255.1")).toBe(false);
    expect(isNetmask("192.168.1.50")).toBe(false);
    expect(isNetmask("")).toBe(false);
  });
});

describe("gatewayFor", () => {
  it("puts the router on the network's first address", () => {
    expect(gatewayFor("192.168.1.50", "255.255.255.0")).toBe("192.168.1.1");
    expect(gatewayFor("10.4.7.200", "255.255.0.0")).toBe("10.4.0.1");
    expect(gatewayFor("172.16.34.9", "255.240.0.0")).toBe("172.16.0.1");
  });

  it("guesses nothing from half an address", () => {
    expect(gatewayFor("192.168.1", "255.255.255.0")).toBeUndefined();
    expect(gatewayFor("192.168.1.50", "")).toBeUndefined();
    // Not a mask, so not a network either.
    expect(gatewayFor("192.168.1.50", "255.0.255.0")).toBeUndefined();
  });
});
