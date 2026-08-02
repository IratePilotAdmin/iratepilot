import { timingSafeEqual } from "node:crypto";

export const DEFAULT_EMAIL_ACTION_URL =
  "https://www.iratepilot.com/account/trips";

export function isAuthorizedCronRequest(
  authorizationHeader: string | null,
  cronSecret: string,
) {
  if (!authorizationHeader || !cronSecret) return false;

  const provided = Buffer.from(authorizationHeader);
  const expected = Buffer.from(`Bearer ${cronSecret}`);

  return (
    provided.length === expected.length && timingSafeEqual(provided, expected)
  );
}

export function getSafeEmailActionUrl(value: unknown) {
  if (typeof value !== "string") return DEFAULT_EMAIL_ACTION_URL;

  try {
    const url = new URL(value);
    const isIRatePilotHost =
      url.hostname === "iratepilot.com" ||
      url.hostname.endsWith(".iratepilot.com");

    if (url.protocol === "https:" && isIRatePilotHost) return url.toString();
  } catch {
    // Invalid or relative URLs fall back to the trusted application URL.
  }

  return DEFAULT_EMAIL_ACTION_URL;
}
