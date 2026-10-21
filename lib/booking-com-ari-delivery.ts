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
  validateScope(job: AriJob): Promise<"ready" | "paused" | "stale" | "unavailable">;
  finish(jobId: string, leaseToken: string, outcome: "sent" | "retry" | "review", httpStatus: number | null, safeResult: Record<string, unknown>): Promise<void>;
};

type AriConnection = {
  connection_id: string;
  property_id: string;
  machine_account_id: string | null;
  provider_property_id: string;
  provider: string;
  environment: string;
  enabled: boolean;
  partner_approved: boolean;
  ari_endpoint_approved: boolean;
  certification_complete: boolean;
};

type AriProperty = { id: string; partner_id: string; active: boolean };
type AriPartner = { id: string; status: string };
type AriMachineAccount = {
  id: string;
  property_id: string;
  provider: string;
  environment: string;
  enabled: boolean;
  partner_approved: boolean;
  approved_at: string | null;
};
type AriDispatchScope = {
  connection: AriConnection | null;
  property: AriProperty | null;
  partner: AriPartner | null;
  machineAccount: AriMachineAccount | null;
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

export function assessBookingComAriScope(job: AriJob, scope: AriDispatchScope): "ready" | "paused" | "stale" {
  const { connection, property, partner, machineAccount } = scope;
  if (!connection || connection.connection_id !== job.connectionId
    || connection.property_id !== job.propertyId
    || connection.machine_account_id !== job.machineAccountId
    || connection.provider_property_id !== job.providerPropertyId
    || connection.provider !== "booking_com" || connection.environment !== "test"
    || !property || property.id !== job.propertyId || !property.partner_id
    || !partner || partner.id !== property.partner_id
    || !machineAccount || machineAccount.id !== job.machineAccountId
    || machineAccount.property_id !== job.propertyId
    || machineAccount.provider !== "booking_com" || machineAccount.environment !== "test") return "stale";
  if (!connection.enabled || !connection.partner_approved
    || !connection.ari_endpoint_approved || !connection.certification_complete
    || !property.active || partner.status !== "approved"
    || !machineAccount.enabled || !machineAccount.partner_approved || !machineAccount.approved_at) return "paused";
  return "ready";
}

function createStore(): AriStore {
  return {
    async claim(limit) {
      const { data, error } = await createAdminClient().rpc("irp_ota_claim_booking_com_ari", { p_limit: limit });
      if (error) throw new Error("booking_com_ari_claim_failed");
      if (!Array.isArray(data)) throw new Error("booking_com_ari_claim_response_invalid");
      return data as AriJob[];
    },
    async validateScope(job) {
      try {
        const admin = createAdminClient();
        const { data: connection, error: connectionError } = await admin
          .from("irp_ota_channel_connections")
          .select("connection_id,property_id,machine_account_id,provider_property_id,provider,environment,enabled,partner_approved,ari_endpoint_approved,certification_complete")
          .eq("connection_id", job.connectionId)
          .maybeSingle();
        if (connectionError) return "unavailable";
        if (!connection) return "stale";
        const [propertyResult, accountResult] = await Promise.all([
          admin.from("properties").select("id,partner_id,active").eq("id", job.propertyId).maybeSingle(),
          admin.from("irp_ota_machine_accounts")
            .select("id,property_id,provider,environment,enabled,partner_approved,approved_at")
            .eq("id", job.machineAccountId).maybeSingle(),
        ]);
        if (propertyResult.error || accountResult.error) return "unavailable";
        const property = propertyResult.data as AriProperty | null;
        if (!property) return "stale";
        const { data: partner, error: partnerError } = await admin.from("partners")
          .select("id,status").eq("id", property.partner_id).maybeSingle();
        if (partnerError) return "unavailable";
        return assessBookingComAriScope(job, {
          connection: connection as AriConnection,
          property,
          partner: partner as AriPartner | null,
          machineAccount: accountResult.data as AriMachineAccount | null,
        });
      } catch {
        return "unavailable";
      }
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
    // Provider-supplied codes and prose are untrusted and can contain guest identifiers.
    errorCount: result.errors.length,
    warningCount: result.warnings.length,
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
      const actualHash = createHash("sha256").update(job.requestXml, "utf8").digest("hex");
      if (actualHash !== job.requestSha256) throw new Error("booking_com_ari_payload_integrity_failed");
      const month = /\bStart="(\d{4}-\d{2})-\d{2}"/.exec(job.requestXml)?.[1];
      if (!month) throw new Error("booking_com_ari_payload_invalid");
      // A queued job can outlive its connection's approval or property mapping.
      // Recheck the exact scope before loading credentials or contacting the provider.
      const scope = await store.validateScope(job);
      if (scope !== "ready") throw new Error(`booking_com_ari_scope_${scope}`);
      const token = await getToken(job.machineAccountId, fetcher);
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
      const code = error instanceof Error && /^(booking_com_auth_temporarily_unavailable|booking_com_auth_transport_failed|booking_com_auth_timeout|booking_com_ari_scope_paused|booking_com_ari_scope_stale|booking_com_ari_scope_unavailable)$/.test(error.message)
        ? error.message
        : error instanceof Error && /^(booking_com_ari_payload_integrity_failed|booking_com_ari_payload_invalid)$/.test(error.message)
          ? error.message : "provider_auth_or_dispatch_rejected";
      outcome = /^(booking_com_auth_(temporarily_unavailable|transport_failed|timeout)|booking_com_ari_scope_(paused|unavailable))$/.test(code) ? "retry" : "review";
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
