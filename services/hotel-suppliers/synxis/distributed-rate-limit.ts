import { createAdminClient } from "../../../lib/supabase/admin";
import type { SynxisOperationLimiter } from "./certification";

const RATE_LIMIT_FUNCTION = "reserve_synxis_rate_limit_slot";
const DEFAULT_SCOPE = "sabre-synxis-ari";

type RateLimitError = { message: string };

export type SynxisRateLimitRpcClient = {
  rpc(
    functionName: typeof RATE_LIMIT_FUNCTION,
    parameters: { p_scope: string; p_interval_ms: number },
  ): Promise<{ data: number | null; error: RateLimitError | null }>;
};

export class SynxisDistributedRateLimiter implements SynxisOperationLimiter {
  private readonly intervalMilliseconds: number;

  constructor(
    private readonly client: SynxisRateLimitRpcClient,
    readonly transactionsPerSecond = 5,
    private readonly scope = DEFAULT_SCOPE,
    private readonly sleep: (milliseconds: number) => Promise<void> = (milliseconds) =>
      new Promise((resolve) => setTimeout(resolve, milliseconds)),
  ) {
    if (!Number.isInteger(transactionsPerSecond) || transactionsPerSecond < 1 || transactionsPerSecond > 5) {
      throw new Error("SynXis transaction rate must be between 1 and 5 TPS");
    }
    if (!scope.trim() || scope.length > 120) {
      throw new Error("SynXis rate-limit scope must be between 1 and 120 characters");
    }
    this.intervalMilliseconds = Math.ceil(1_000 / transactionsPerSecond);
  }

  async schedule<T>(operation: () => Promise<T>): Promise<T> {
    const { data, error } = await this.client.rpc(RATE_LIMIT_FUNCTION, {
      p_scope: this.scope,
      p_interval_ms: this.intervalMilliseconds,
    });
    if (error) {
      throw new Error("SynXis distributed rate-limit reservation failed", { cause: error });
    }
    if (!Number.isInteger(data) || data === null || data < 0 || data > 120_000) {
      throw new Error("SynXis distributed rate-limit reservation returned an invalid delay");
    }
    if (data > 0) await this.sleep(data);
    return operation();
  }
}

export function createSynxisDistributedRateLimiter(
  transactionsPerSecond = 5,
  scope = DEFAULT_SCOPE,
) {
  const client = createAdminClient() as unknown as SynxisRateLimitRpcClient;
  return new SynxisDistributedRateLimiter(client, transactionsPerSecond, scope);
}
