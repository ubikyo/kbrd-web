/**
 * The IPv4 fields of the Network tab are masked inputs (`999.999.999.999`),
 * and a mask holds one character per slot: twelve digits, every octet
 * padded to three. That spelling is what the field works in, and it is
 * never what an address *is* — hence this pair of conversions, and a
 * draft that keeps the digits rather than the address.
 *
 * Keeping the digits matters: "19216800105" is eleven slots of a real
 * address being typed, and turning it into an address on every keystroke
 * would throw away the difference between half-typed and empty.
 */

/** The number of digit slots in `999.999.999.999`. */
export const IPV4_DIGITS = 12;

export const IPV4_MASK = "999.999.999.999";

/** `"192.168.1.50"` → `"192168001050"`. Empty for anything that isn't
 * four octets — including the empty string a field starts on. */
export function toDigits(address: string): string {
  const octets = address.split(".");
  if (octets.length !== 4) return "";
  if (octets.some((octet) => !/^\d{1,3}$/.test(octet))) return "";
  return octets.map((octet) => octet.padStart(3, "0")).join("");
}

/** `"192168001050"` → `"192.168.1.50"`, and `""` while the address is
 * still being typed or an octet is above 255. */
export function toAddress(digits: string): string {
  if (digits.length !== IPV4_DIGITS) return "";
  const octets = [0, 3, 6, 9].map((at) => Number(digits.slice(at, at + 3)));
  if (octets.some((octet) => octet > 255)) return "";
  return octets.join(".");
}

/** What the field is mounted with: `"192.168.1.50"` → `"192.168.001.050"`. */
export function toMasked(address: string): string {
  const digits = toDigits(address);
  return digits ? digits.replace(/(\d{3})(?=\d)/g, "$1.") : "";
}

/**
 * A netmask is an address whose set bits are contiguous: `255.255.255.0`
 * is one, `255.0.255.0` only looks like one — and the second would be
 * taken by iwd and produce a keyboard nobody can reach. KBRD-API refuses
 * it too; this is so the field says so before the save is attempted.
 */
export function isNetmask(address: string): boolean {
  if (!address) return false;
  const bits = address
    .split(".")
    .reduce((accumulator, octet) => accumulator * 256 + Number(octet), 0);
  const inverted = ~bits >>> 0;
  return (inverted & (inverted + 1)) === 0;
}
