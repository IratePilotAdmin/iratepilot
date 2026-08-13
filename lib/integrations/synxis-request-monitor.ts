export type SynxisRequestJournalRow = {
  id: string;
  request_id: string;
  attempt_number: number;
  operation: "rate_push" | "inventory_push";
  traffic_mode: "certification" | "production_smoke" | "live";
  status: "started" | "succeeded" | "failed";
  http_status: number | null;
  started_at: string;
  completed_at: string | null;
};

const staleThresholdMs = 5 * 60 * 1_000;

export function buildSynxisRequestMonitor(
  rows: SynxisRequestJournalRow[],
  now = Date.now(),
) {
  const requests = rows.map((row) => {
    const started = Date.parse(row.started_at);
    const completed = row.completed_at ? Date.parse(row.completed_at) : Number.NaN;
    const durationMs = Number.isFinite(started) && Number.isFinite(completed)
      ? Math.max(0, completed - started)
      : null;
    const stale = row.status === "started"
      && Number.isFinite(started)
      && now - started >= staleThresholdMs;
    return {
      id: row.id,
      requestId: row.request_id,
      attemptNumber: row.attempt_number,
      operation: row.operation,
      trafficMode: row.traffic_mode,
      status: row.status,
      httpStatus: row.http_status,
      startedAt: row.started_at,
      completedAt: row.completed_at,
      durationMs,
      stale,
    };
  });
  return {
    requests,
    summary: {
      total: requests.length,
      succeeded: requests.filter((request) => request.status === "succeeded").length,
      failed: requests.filter((request) => request.status === "failed").length,
      inFlight: requests.filter((request) => request.status === "started").length,
      stale: requests.filter((request) => request.stale).length,
    },
  };
}
