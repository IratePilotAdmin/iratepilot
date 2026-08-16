import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getResendOutboxIdFromTags,
  hasResendOutboxSourceTag,
  isNewerResendDeliveryEvent,
  isRetryableResendWebhookClaim,
  resendOutboxIdTagName,
  resendOutboxSourceTag,
  resendSourceTagName,
  resendWebhookClaimTimeoutMs,
} from "../lib/email/webhook-reliability";
import { reportOperationalError } from "../lib/monitoring/operational";

const webhook = readFileSync(
  new URL("../app/api/webhooks/resend/route.ts", import.meta.url),
  "utf8",
);
const worker = readFileSync(
  new URL("../app/api/email/process/route.ts", import.meta.url),
  "utf8",
);

describe("Resend webhook reliability", () => {
  const now = Date.parse("2026-08-14T12:00:00.000Z");

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    delete process.env.ERROR_WEBHOOK_URL;
    delete process.env.ERROR_WEBHOOK_TOKEN;
  });

  it("reclaims failed and expired processing leases without stealing active claims", () => {
    expect(isRetryableResendWebhookClaim("failed", "2026-08-14T11:59:59.000Z", now)).toBe(true);
    expect(isRetryableResendWebhookClaim(
      "processing",
      new Date(now - resendWebhookClaimTimeoutMs).toISOString(),
      now,
    )).toBe(true);
    expect(isRetryableResendWebhookClaim("processing", "2026-08-14T11:59:00.000Z", now)).toBe(false);
    expect(isRetryableResendWebhookClaim("processed", "2026-08-14T11:00:00.000Z", now)).toBe(false);
  });

  it("accepts only delivery events newer than the outbox state", () => {
    expect(isNewerResendDeliveryEvent("2026-08-14T12:00:00.000Z", null)).toBe(true);
    expect(isNewerResendDeliveryEvent(
      "2026-08-14T12:00:00.000Z",
      "2026-08-14T11:59:59.000Z",
    )).toBe(true);
    expect(isNewerResendDeliveryEvent(
      "2026-08-14T12:00:00.000Z",
      "2026-08-14T12:00:00.000Z",
    )).toBe(false);
    expect(isNewerResendDeliveryEvent(
      "2026-08-14T11:59:59.000Z",
      "2026-08-14T12:00:00.000Z",
    )).toBe(false);
  });

  it("recognizes only valid iRatePilot outbox correlation tags", () => {
    const outboxId = "f7f5ca3e-979a-4d55-90da-584c5085495d";
    const tags = {
      [resendSourceTagName]: resendOutboxSourceTag,
      [resendOutboxIdTagName]: outboxId,
    };

    expect(hasResendOutboxSourceTag(tags)).toBe(true);
    expect(getResendOutboxIdFromTags(tags)).toBe(outboxId);
    expect(hasResendOutboxSourceTag({ source: "supabase_auth" })).toBe(false);
    expect(getResendOutboxIdFromTags({ ...tags, outbox_id: "not-a-uuid" })).toBeNull();
    expect(getResendOutboxIdFromTags(null)).toBeNull();
  });

  it("tags worker sends and prevents later worker updates from downgrading webhook state", () => {
    expect(worker).toContain("resendSourceTagName");
    expect(worker).toContain("resendOutboxIdTagName");
    expect(worker).toContain("resendOutboxSourceTag");
    expect(worker).toContain('.is("delivery_status", null)');
    expect(worker).toContain('.is("delivery_event_at", null)');
    expect(worker).not.toMatch(/status: "sent",\s+delivery_status: "sent"/);
  });

  it("uses compare-and-set ownership while acknowledging legitimate non-outbox messages", () => {
    expect(webhook).toContain('.select("processing_status,attempt_count,updated_at")');
    expect(webhook).toContain('.eq("processing_status", existing.data.processing_status)');
    expect(webhook).toContain('.eq("updated_at", existing.data.updated_at)');
    expect(webhook).toContain("hasResendOutboxSourceTag(eventTags)");
    expect(webhook).toContain('await outboxLookup.eq("id", taggedOutboxId as string)');
    expect(webhook).toContain('await outboxLookup.eq("resend_email_id", event.data.email_id)');
    expect(webhook).toContain("Tagged delivery event has no associated email outbox record.");
    expect(webhook).toContain('"resend_delivery_event_untracked"');
    expect(webhook).toContain("outboxTracked: Boolean(outboxRecord)");
    expect(webhook).toContain("delivery_event_at.is.null,delivery_event_at.lt.${event.created_at}");
    expect(webhook.match(/\.eq\("updated_at", claimUpdatedAt\)/g)).toHaveLength(2);
  });

  it("keeps suppression processing independent from outbox correlation", () => {
    const untrackedLog = webhook.indexOf('"resend_delivery_event_untracked"');
    const suppressionWrite = webhook.indexOf('.from("email_suppressions")');
    const completionWrite = webhook.indexOf('processing_status: "processed"');

    expect(untrackedLog).toBeGreaterThan(-1);
    expect(suppressionWrite).toBeGreaterThan(untrackedLog);
    expect(completionWrite).toBeGreaterThan(suppressionWrite);
  });

  it("reports non-success operational alert responses as delivery failures", async () => {
    process.env.ERROR_WEBHOOK_URL = "https://alerts.example.test/operational";
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 503 }));
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const warning = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    await reportOperationalError("test_operational_event", new Error("source failed"));

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(warning.mock.calls.some(([payload]) => (
      String(payload).includes("operational_alert_delivery_failed")
      && String(payload).includes("HTTP 503")
    ))).toBe(true);
  });
});
