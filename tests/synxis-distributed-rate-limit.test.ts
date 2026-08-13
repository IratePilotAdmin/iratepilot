import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import {
  SynxisDistributedRateLimiter,
  type SynxisRateLimitRpcClient,
} from "../services/hotel-suppliers/synxis";

describe("SynXis distributed rate limiting", () => {
  it("reserves every start through the shared database coordinator", async () => {
    const rpc = vi.fn<SynxisRateLimitRpcClient["rpc"]>()
      .mockResolvedValueOnce({ data: 0, error: null })
      .mockResolvedValueOnce({ data: 200, error: null });
    const sleep = vi.fn(async () => undefined);
    const first = new SynxisDistributedRateLimiter({ rpc }, 5, "synxis-certification", sleep);
    const second = new SynxisDistributedRateLimiter({ rpc }, 5, "synxis-certification", sleep);
    const operation = vi.fn(async () => "accepted");

    await expect(Promise.all([
      first.schedule(operation),
      second.schedule(operation),
    ])).resolves.toEqual(["accepted", "accepted"]);

    expect(rpc).toHaveBeenCalledTimes(2);
    expect(rpc).toHaveBeenNthCalledWith(1, "reserve_synxis_rate_limit_slot", {
      p_scope: "synxis-certification",
      p_interval_ms: 200,
    });
    expect(rpc).toHaveBeenNthCalledWith(2, "reserve_synxis_rate_limit_slot", {
      p_scope: "synxis-certification",
      p_interval_ms: 200,
    });
    expect(sleep).toHaveBeenCalledOnce();
    expect(sleep).toHaveBeenCalledWith(200);
  });

  it("fails closed when the coordinator cannot reserve a safe slot", async () => {
    const operation = vi.fn(async () => "must-not-run");
    const failedRpc = vi.fn<SynxisRateLimitRpcClient["rpc"]>(async () => ({
      data: null,
      error: { message: "database unavailable" },
    }));
    const invalidRpc = vi.fn<SynxisRateLimitRpcClient["rpc"]>(async () => ({
      data: -1,
      error: null,
    }));

    await expect(new SynxisDistributedRateLimiter({ rpc: failedRpc }).schedule(operation))
      .rejects.toThrow("reservation failed");
    await expect(new SynxisDistributedRateLimiter({ rpc: invalidRpc }).schedule(operation))
      .rejects.toThrow("invalid delay");
    expect(operation).not.toHaveBeenCalled();
  });

  it("caps distributed throughput at five TPS", () => {
    const rpc = vi.fn<SynxisRateLimitRpcClient["rpc"]>();
    expect(() => new SynxisDistributedRateLimiter({ rpc }, 6)).toThrow("between 1 and 5 TPS");
    expect(() => new SynxisDistributedRateLimiter({ rpc }, 0)).toThrow("between 1 and 5 TPS");
    expect(() => new SynxisDistributedRateLimiter({ rpc }, 5, " ")).toThrow("scope");
  });
});

describe("SynXis rate-limit migration", () => {
  const migration = readFileSync(
    "supabase/migrations/202608130039_synxis_distributed_rate_limit.sql",
    "utf8",
  );

  it("serializes reservations and restricts access to the service role", () => {
    expect(migration).toContain("pg_advisory_xact_lock");
    expect(migration).toContain("for update");
    expect(migration).toContain("security definer");
    expect(migration).toContain("enable row level security");
    expect(migration).toContain("to service_role");
    expect(migration).toContain("p_interval_ms not between 200 and 1000");
  });
});
