function isPrivateOrReservedIpv4(hostname: string) {
  const octets = hostname.split(".");
  if (octets.length !== 4 || octets.some((value) => !/^\d{1,3}$/.test(value))) return false;
  const values = octets.map(Number);
  if (values.some((value) => value > 255)) return true;
  const [first, second, third] = values;
  return first === 0
    || first === 10
    || first === 127
    || (first === 100 && second >= 64 && second <= 127)
    || (first === 169 && second === 254)
    || (first === 172 && second >= 16 && second <= 31)
    || (first === 192 && second === 0 && third === 0)
    || (first === 192 && second === 0 && third === 2)
    || (first === 192 && second === 168)
    || (first === 198 && (second === 18 || second === 19))
    || (first === 198 && second === 51 && third === 100)
    || (first === 203 && second === 0 && third === 113)
    || first >= 224;
}

function isPublicMediaHostname(hostname: string) {
  const normalized = hostname.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.+$/, "");
  if (!normalized || normalized.includes(":")) return false;
  if (isPrivateOrReservedIpv4(normalized)) return false;
  if (/^\d+(?:\.\d+){3}$/.test(normalized)) return true;
  if (!normalized.includes(".")) return false;
  return ![".localhost", ".local", ".internal", ".lan", ".home.arpa"]
    .some((suffix) => normalized === suffix.slice(1) || normalized.endsWith(suffix));
}

export function isSafePropertyImageUrl(value: string | null | undefined) {
  if (!value) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:"
      && isPublicMediaHostname(url.hostname)
      && !url.username
      && !url.password;
  } catch {
    return false;
  }
}
