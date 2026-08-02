export const FALLBACK_PROPERTY_IMAGE =
  "https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=1200&q=80";

export function isSafeRemoteImageUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;

  try {
    const url = new URL(value);
    const hostname = url.hostname.toLowerCase();
    const isIpAddress = /^\d{1,3}(?:\.\d{1,3}){3}$/.test(hostname) || hostname.includes(":");

    return url.protocol === "https:"
      && !url.username
      && !url.password
      && !url.port
      && hostname.includes(".")
      && hostname !== "localhost"
      && !hostname.endsWith(".localhost")
      && !isIpAddress;
  } catch {
    return false;
  }
}

export function getSafePropertyImageUrl(value: unknown) {
  return isSafeRemoteImageUrl(value) ? value : FALLBACK_PROPERTY_IMAGE;
}

export function canOptimizePropertyImage(value: string) {
  try {
    return new URL(value).hostname.toLowerCase() === "images.unsplash.com";
  } catch {
    return false;
  }
}
