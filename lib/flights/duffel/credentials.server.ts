import "server-only";

export type DuffelSandboxTokenRequest = Readonly<{
  version: "duffel-sandbox-token-request-v1";
  requestDigest: string;
  authorizationReceiptDigest: string;
  journalReceiptDigest: string;
}>;

/**
 * Server-side credential port only. Implementations must use an approved secret
 * store; this module deliberately contains no environment or credential reader.
 */
export interface DuffelSandboxCredentialProvider {
  readSandboxAccessToken(input: DuffelSandboxTokenRequest): Promise<string>;
}

export class DuffelLiveCredentialUnavailableError extends Error {
  constructor() {
    super("Duffel live credential is unavailable.");
    this.name = "DuffelLiveCredentialUnavailableError";
  }
}

export class DuffelCredentialUnavailableError extends Error {
  constructor() {
    super("Duffel sandbox credential is unavailable.");
    this.name = "DuffelCredentialUnavailableError";
  }
}

export function validateDuffelSandboxAccessToken(value: unknown): string {
  if (
    typeof value !== "string"
    || !/^duffel_test_[A-Za-z0-9_-]{16,500}$/.test(value)
  ) {
    throw new DuffelCredentialUnavailableError();
  }
  return value;
}

/**
 * Validates only the credential envelope. Callers must still prove an exact
 * production runtime authority before the returned token can reach a transport.
 */
export function validateDuffelLiveAccessToken(value: unknown): string {
  if (
    typeof value !== "string"
    || !/^duffel_live_[A-Za-z0-9_-]{16,500}$/.test(value)
  ) {
    throw new DuffelLiveCredentialUnavailableError();
  }
  return value;
}
