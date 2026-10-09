import "server-only";
import { createHash } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { getBookingComMachineAccountToken } from "@/services/hotel-channels/booking-com/machine-account";
import { postBookingComAriTestRequest, type BookingComAcknowledgement } from "@/services/hotel-channels/booking-com/client";

type AriJob = {
  jobId: string;
  connectionId: string;
  propertyId: string;
  machineAccountId: string;
  providerPropertyId: string;
  kind: "availability" | "rate";
  requestSha256: string;
  endpoint: string;
  requestXml: string;
  attempt: number;
  leaseToken: string;
};

type AriStore = {
  claim(limit: number): Promise<AriJob[]>;
  finish(jobId: string, leaseToken: string, outcome: "sent" | "retry" | "review", httpStatus: number | null, safeResult: Record<string, unknown>): Promise<void>;
};

type WorkerOptions = {
  store?: AriStore;
  fetcher?: typeof fetch;
  getToken?: (accountId: string, fetcher: typeof fetch) => Promise<string>;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ID = /^[A-Za-z0-9_-]{1,80}$/;
const ENDPOINTS = {
  availability: "https://supply-xml.booking.com/hotels/ota/OTA_HotelAvailNotif",
  rate: "https://supply-xml.booking.com/hotels/ota/OTA_HotelRateAmountNotif",
} as const;

function parseJob(value: unknown): AriJob | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  if (typeof row.jobId !== "string" || !UUID.test(row.jobId)
    || typeof row.connectionId !== "string" || !ID.test(row.connectionId)
    || typeof row.propertyId !== "string" || !UUID.test(row.propertyId)
    || typeof row.machineAccountId !== "string" || !UUID.test(row.machineAccountId)
    || typeof row.providerPropertyId !== "string" || !ID.test(row.providerPropertyId)
    || (row.kind !== "availability" && row.kind !== "rate")
    || row.endpoint !== ENDPOINTS[row.kind]
    || typeof row.requestSha256 !== "string" || !/^[a-f0-9]{64}$/.test(row.requestSha256)
    || typeof row.requestXml !== "string" || row.requestXml.length < 1 || row.requestXml.length > 1_000_000
    || /<!\s*(?:DOCTYPE|ENTITY)\b/i.test(row.requestXml)
    || typeof row.attempt !== "number" || !Number.isInteger(row.attempt) || row.attempt < 1 || row.attempt > 8
    || typeof row.leaseToken !== "string" || !UUID.test(row.leaseToken)) return null;
  return row as unknown as AriJob;
}

function createStore(): AriStore {
  return {
    async claim(limit) {
      const { data, error } = await createAdminClient().rpc("irp_ota_claim_booking_com_ari", { p_limit: limit });
      if (error) throw new Error("booking_com_ari_claim_failed");
      if (!Array.isArray(data)) throw new Error("booking_com_ari_claim_response_invalid");
      return data as AriJob[];
    },
    async finish(jobId, leaseToken, outcome, httpStatus, safeResult) {
      const { data, error } = await createAdminClient().rpc("irp_ota_finish_booking_com_ari", {
        p_job_id: jobId, p_lease_token: leaseToken, p_outcome: outcome,
        p_http_status: httpStatus, p_safe_result: safeResult,
      });
      if (error || (data as { outcome?: unknown } | null)?.outcome === "lease_lost") {
        throw new Error("booking_com_ari_finish_failed");
      }
    },
  };
}

function safeAcknowledgement(result: BookingComAcknowledgement) {
  return {
    outcome: result.outcome,
    errors: result.errors.slice(0, 25).map(({ code, message }) => ({ code: code?.slice(0, 100), message: message?.slice(0, 300) })),
    warnings: result.warnings.slice(0, 25).map(({ code, message }) => ({ code: code?.slice(0, 100), message: message?.slice(0, 300) })),
  };
}

/** Dispatches only jobs returned by the database's service-role claim RPC.
 * The SQL function is the approval gate; the transport still enforces test mode.
 */
export async function runBookingComAriDelivery(options: WorkerOptions = {}) {
  const store = options.store ?? createStore();
  const fetcher = options.fetcher ?? fetch;
  const getToken = options.getToken ?? ((accountId, transport) => getBookingComMachineAccountToken(accountId, { fetcher: transport }));
  const claimed = await store.claim(10);
  let sent = 0;
  let retry = 0;
  let review = 0;
  let leaseLost = 0;

  for (const raw of claimed) {
    const job = parseJob(raw);
    if (!job) {
      // A malformed claim is not dispatched. We cannot safely finish without a trusted lease.
      review += 1;
      continue;
    }
    let outcome: "sent" | "retry" | "review" = "review";
    let httpStatus: number | null = null;
    let result: Record<string, unknown> = { code: "job_invalid" };
    try {
      const token = await getToken(job.machineAccountId, fetcher);
      const actualHash = createHash("sha256").update(job.requestXml, "utf8").digest("hex");
      if (actualHash !== job.requestSha256) throw new Error("booking_com_ari_payload_integrity_failed");
      const month = /\bStart="(\d{4}-\d{2})-\d{2}"/.exec(job.requestXml)?.[1];
      if (!month) throw new Error("booking_com_ari_payload_invalid");
      const ack = await postBookingComAriTestRequest({
        channelPropertyId: job.providerPropertyId,
        month,
        kind: job.kind,
        endpoint: job.endpoint,
        headers: { "Accept-Version": "1.1", "Content-Type": "application/xml" },
        body: job.requestXml,
      }, {
        mode: "test", propertyId: job.providerPropertyId, machineAccountPropertyScope: job.providerPropertyId,
        partnerApproved: true, propertyConnectionApproved: true, endpointEnabled: true,
        certificationComplete: true, testProperty: true,
      }, { bearerToken: token, fetcher });
      httpStatus = ack.httpStatus;
      result = safeAcknowledgement(ack);
      outcome = ack.outcome === "accepted" || ack.outcome === "accepted_with_warnings"
        ? "sent" : ack.outcome === "retryable" ? "retry" : "review";
    } catch (error) {
      const code = error instanceof Error && /^(booking_com_auth_temporarily_unavailable|booking_com_auth_transport_failed|booking_com_auth_timeout)$/.test(error.message)
        ? error.message
        : error instanceof Error && /^(booking_com_ari_payload_integrity_failed|booking_com_ari_payload_invalid)$/.test(error.message)
          ? error.message : "provider_auth_or_dispatch_rejected";
      outcome = /^booking_com_auth_(temporarily_unavailable|transport_failed|timeout)$/.test(code) ? "retry" : "review";
      result = { code };
    }

    try {
      await store.finish(job.jobId, job.leaseToken, outcome, httpStatus, result);
      if (outcome === "sent") sent += 1;
      else if (outcome === "retry") retry += 1;
      else review += 1;
    } catch {
      leaseLost += 1;
    }
  }
  return { claimed: claimed.length, sent, retry, review, leaseLost };
}
