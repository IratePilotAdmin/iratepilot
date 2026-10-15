const TOKEN_ENDPOINT = "https://connectivity-authentication.booking.com/token-based-authentication/exchange";
const MAX_RESPONSE_BYTES = 16_000;
const TOKEN_CACHE_LIFETIME_MS = 55 * 60 * 1000;

type BookingComTokenExchangeInput = {
  clientId: string;
  clientSecret: string;
};

type BookingComTokenExchangeOptions = {
  fetcher?: typeof fetch;
  timeoutMs?: number;
  now?: () => number;
};

export type BookingComMachineAccountToken = {
  accessToken: string;
  expiresAt: number;
};

function boundedText(value: unknown, min: number, max: number) {
  return typeof value === "string" && value.length >= min && value.length <= max
    && !/[\u0000-\u001f\u007f]/.test(value);
}

async function readBoundedJson(response: Response) {
  if (!response.body) return null;
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_RESPONSE_BYTES) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) as unknown;
  } catch {
    return null;
  }
}

/** Exchanges Booking.com machine-account credentials for the provider's one-hour JWT.
 * The caller must supply credentials from a server-side secret vault and persist any
 * resulting token only in an encrypted store. This helper never logs either value.
 */
export async function exchangeBookingComMachineAccountToken(
  input: BookingComTokenExchangeInput,
  options: BookingComTokenExchangeOptions = {},
): Promise<BookingComMachineAccountToken> {
  if (!input || !boundedText(input.clientId, 1, 200) || !boundedText(input.clientSecret, 1, 4096)) {
    throw new Error("booking_com_credentials_invalid");
  }
  const timeoutMs = options.timeoutMs ?? 10_000;
  if (!Number.isInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > 30_000) {
    throw new Error("booking_com_auth_timeout_invalid");
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await (options.fetcher ?? fetch)(TOKEN_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ client_id: input.clientId, client_secret: input.clientSecret }),
      redirect: "error",
      signal: controller.signal,
    });
    if (!response.ok) {
      await response.body?.cancel();
      throw new Error(response.status === 429 || response.status >= 500
        ? "booking_com_auth_temporarily_unavailable"
        : "booking_com_auth_rejected");
    }
    const body = await readBoundedJson(response);
    const accessToken = body && typeof body === "object" && !Array.isArray(body)
      ? (body as Record<string, unknown>).jwt
      : undefined;
    if (typeof accessToken !== "string" || accessToken.length < 40 || accessToken.length > 8192
      || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(accessToken)) {
      throw new Error("booking_com_auth_response_invalid");
    }
    const now = options.now?.() ?? Date.now();
    if (!Number.isSafeInteger(now) || now <= 0) throw new Error("booking_com_auth_clock_invalid");
    return { accessToken, expiresAt: now + TOKEN_CACHE_LIFETIME_MS };
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("booking_com_auth_")) throw error;
    throw new Error(controller.signal.aborted
      ? "booking_com_auth_timeout"
      : "booking_com_auth_transport_failed");
  } finally {
    clearTimeout(timer);
  }
}
