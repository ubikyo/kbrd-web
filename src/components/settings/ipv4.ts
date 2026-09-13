/**
 * What counts as an IPv4 address, and what counts as a netmask.
 *
 * Addresses are held and shown exactly as they are typed — there is no
 * mask over these fields, so `192.168.1.50` stays `192.168.1.50` rather
 * than being padded out to fill a fixed run of slots. Everything below is
 * only ever asked whether what is there is an address yet.
 */

/** Four runs of one to three digits, separated by dots, and nothing
 * else. The range of each octet is checked in `isIpv4` — a regular
 * expression that also ruled out 256 would be write-only. */
const IPV4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;

export function isIpv4(value: string): boolean {
  const match = IPV4.exec(value);
  if (!match) return false;
  return match.slice(1).every((octet) => Number(octet) <= 255);
}

/**
 * A netmask is an address whose set bits are contiguous: `255.255.255.0`
 * is one, `255.0.255.0` only looks like one — and the second would be
 * taken by iwd and produce a keyboard nobody can reach. KBRD-API refuses
 * it too; this is so the field says so before the save is attempted.
 */
export function isNetmask(value: string): boolean {
  if (!isIpv4(value)) return false;
  const bits = value
    .split(".")
    .reduce((accumulator, octet) => accumulator * 256 + Number(octet), 0);
  const inverted = ~bits >>> 0;
  return (inverted & (inverted + 1)) === 0;
}

/**
 * The gateway a network of this shape almost always has: the address and
 * the mask give the network, and the router sits on its first host —
 * `192.168.1.50/255.255.255.0` puts it at `192.168.1.1`.
 *
 * A guess, and offered as one: the field stays editable, and a network
 * whose router lives somewhere else is simply typed over. `undefined`
 * when either half isn't one yet, so nothing is guessed from half an
 * address.
 */
export function gatewayFor(
  address: string,
  netmask: string,
): string | undefined {
  if (!isIpv4(address) || !isNetmask(netmask)) return undefined;
  const host = address.split(".").map(Number);
  const mask = netmask.split(".").map(Number);
  const network = host.map((octet, at) => octet & mask[at]);
  // The last octet rather than the first host of the network: on
  // anything wider than a /24 the two differ, and this is the one that
  // reads as "the router".
  network[3] = 1;
  return network.join(".");
}
