import type { SynxisAriOperation, SynxisTrafficMode } from "./transport";

const BEGIN_FUNCTION = "begin_synxis_request_attempt";
const COMPLETE_FUNCTION = "complete_synxis_request_attempt";

export type SynxisJournalRpcClient = {
  rpc(
    functionName: string,
    parameters: Record<string, unknown>,
  ): Promise<{ data: unknown; error: { message?: string } | null }>;
};

export type SynxisAttemptReceipt = {
  requestId: string;
  attemptNumber: number;
  operation: SynxisAriOperation;
  trafficMode: SynxisTrafficMode;
};

export type SynxisExecutionJournal = {
  begin(receipt: SynxisAttemptReceipt): Promise<string>;
  complete(id: string, status: "succeeded" | "failed", httpStatus?: number): Promise<void>;
};

export class SynxisRequestJournal implements SynxisExecutionJournal {
  constructor(private readonly client: SynxisJournalRpcClient) {}

  async begin(receipt: SynxisAttemptReceipt) {
    const result = await this.client.rpc(BEGIN_FUNCTION, {
      p_request_id: receipt.requestId,
      p_attempt_number: receipt.attemptNumber,
      p_operation: receipt.operation,
      p_traffic_mode: receipt.trafficMode,
    });
    if (result.error || typeof result.data !== "string" || !result.data.trim()) {
      throw new Error("SynXis traffic is blocked because its request receipt could not be created");
    }
    return result.data;
  }

  async complete(id: string, status: "succeeded" | "failed", httpStatus?: number) {
    const result = await this.client.rpc(COMPLETE_FUNCTION, {
      p_id: id,
      p_status: status,
      p_http_status: httpStatus ?? null,
    });
    if (result.error) {
      throw new Error("SynXis request receipt could not be completed");
    }
  }
}
