import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(new URL(
  "../supabase/migrations/202610160170_apaleo_reservation_reconciliation.sql",
  import.meta.url,
), "utf8");

describe("Apaleo reservation reconciliation migration", () => {
  it("keeps reservation receipts service-role-only and claims them idempotently", () => {
    expect(migration).toContain("provider_entity_id text");
    expect(migration).toContain("processing_status in ('pending', 'processing', 'reconciled', 'ignored', 'failed')");
    expect(migration).toContain("for update of receipt skip locked");
    expect(migration).toContain("processing_attempts < 5");
    expect(migration).toContain("security definer");
    expect(migration).toContain("set search_path = ''");
    expect(migration).toContain("from public, anon, authenticated");
    expect(migration).toContain("to service_role");
    expect(migration).toContain("grant select, insert, update on table public.pms_webhook_event_receipts to service_role");
  });

  it("stores only a digest and operational state after provider retrieval", () => {
    expect(migration).toContain("reservation_snapshot_sha256 text");
    expect(migration).toContain("provider_status text");
    expect(migration).not.toMatch(/guest_name|guest_email|guest_phone|raw_payload/i);
  });
});
