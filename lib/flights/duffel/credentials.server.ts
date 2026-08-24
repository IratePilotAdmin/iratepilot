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
