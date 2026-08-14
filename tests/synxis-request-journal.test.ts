import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import {
  SynxisRequestJournal,
  type SynxisJournalRpcClient,
} from "../services/hotel-suppliers/synxis";

const migration = readFileSync(
  new URL("../supabase/migrations/202608130042_synxis_request_journal.sql", import.meta.url),
  "utf8",
);
const rollback = readFileSync(
  new URL("../supabase/rollbacks/202608130042_synxis_request_journal.rollback.sql", import.meta.url),
  "utf8",
);

describe("SynXis request journal", () => {
  it("creates and completes non-secret attempt receipts through RPCs", async () => {
    const rpc = vi.fn<SynxisJournalRpcClient["rpc"]>()
      .mockResolvedValueOnce({ data: "receipt-1", error: null })
      .mockResolvedValueOnce({ data: null, error: null });
    const journal = new SynxisRequestJournal({ rpc });
    const id = await journal.begin({
      requestId: "IRP-CERT-10",
      attemptNumber: 2,
      operation: "rate_push",
      trafficMode: "certification",
    });
    await journal.complete(id, "succeeded", 200);
    expect(rpc).toHaveBeenNthCalledWith(1, "begin_synxis_request_attempt", {
      p_request_id: "IRP-CERT-10",
      p_attempt_number: 2,
      p_operation: "rate_push",
      p_traffic_mode: "certification",
    });
    expect(rpc).toHaveBeenNthCalledWith(2, "complete_synxis_request_attempt", {
      p_id: "receipt-1",
      p_status: "succeeded",
      p_http_status: 200,
    });
  });

  it("fails closed when either journal RPC fails", async () => {
    const failed = vi.fn<SynxisJournalRpcClient["rpc"]>(async () => ({
      data: null,
      error: { message: "database unavailable" },
    }));
    const journal = new SynxisRequestJournal({ rpc: failed });
    await expect(journal.begin({
      requestId: "IRP-CERT-11",
      attemptNumber: 1,
      operation: "inventory_push",
      trafficMode: "certification",
    })).rejects.toThrow("request receipt could not be created");
    await expect(journal.complete("receipt-1", "failed", 503))
      .rejects.toThrow("receipt could not be completed");
  });

  it("enforces unique attempts, one completion, privacy, and retention in PostgreSQL", () => {
    expect(migration).toContain("default gen_random_uuid()");
    expect(migration).not.toContain("uuid_generate_v4()");
    expect(migration).toContain("unique (request_id, attempt_number)");
    expect(migration).toContain("Duplicate SynXis request attempt");
    expect(migration).toContain("status = 'started'");
    expect(migration).toContain("immutable after one completion");
    expect(migration).toContain("SOAP bodies and credentials are prohibited");
    expect(migration).toContain("revoke all on table public.synxis_request_journal from public, anon, authenticated");
    expect(rollback).toContain("Refusing rollback: SynXis request journal receipts exist");
  });
});
