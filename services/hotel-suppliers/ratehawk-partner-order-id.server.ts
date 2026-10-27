import "server-only";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const safePartnerOrderIdPattern = /^[A-Za-z0-9][A-Za-z0-9_-]{0,255}$/;

// ETG requires these suffixes to exercise the asynchronous `unknown` booking
// outcomes during sandbox certification.
const sandboxCertificationSuffixes = [
  "unknown_success",
  "unknown_provider",
  "unknown_soldout",
  "unknown_book_limit",
] as const;

export function isRatehawkSandboxPartnerOrderId(value: string) {
  if (!safePartnerOrderIdPattern.test(value)) return false;
  return uuidPattern.test(value)
    || sandboxCertificationSuffixes.some((suffix) => value.endsWith(suffix));
}
