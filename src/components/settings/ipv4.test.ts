import { describe, expect, it } from "vitest";

import { isNetmask, toAddress, toDigits, toMasked } from "./ipv4";

describe("toDigits", () => {
  it("pads every octet to the mask's three slots", () => {
    expect(toDigits("192.168.1.50")).toBe("192168001050");
    expect(toDigits("255.255.255.255")).toBe("255255255255");
    expect(toDigits("0.0.0.0")).toBe("000000000000");
  });

  it("is empty for anything that isn't four octets", () => {
    expect(toDigits("")).toBe("");
    expect(toDigits("192.168.1")).toBe("");
    expect(toDigits("192.168.1.50.7")).toBe("");
    expect(toDigits("192.168.1.x")).toBe("");
  });
});

describe("toAddress", () => {
  it("drops the padding the mask holds", () => {
    expect(toAddress("192168001050")).toBe("192.168.1.50");
    expect(toAddress("000000000000")).toBe("0.0.0.0");
  });

  // A mask reports its digits as they are typed, and a half-typed
  // address is not a mistake — it is just not an address yet.
  it("is empty while the field is still being filled", () => {
    expect(toAddress("")).toBe("");
    expect(toAddress("19216800105")).toBe("");
  });

  it("is empty for an octet above 255", () => {
    expect(toAddress("192168001300")).toBe("");
  });
});

describe("toMasked", () => {
  it("spells an address the way the field shows it", () => {
    expect(toMasked("192.168.1.50")).toBe("192.168.001.050");
    expect(toMasked("")).toBe("");
  });

  it("round-trips through the digits", () => {
    expect(toAddress(toDigits("10.0.0.1"))).toBe("10.0.0.1");
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
