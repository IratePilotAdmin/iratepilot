const SOURCE_PROJECT = "onbdizzwwubfdgkgaphx";
const RECEIVER_PROJECT = "wjosvslkselpauyftias";
const WORKER_PROJECT = "iratepilot-cron-rehearsal-20261005";
const DESTINATION = `https://${RECEIVER_PROJECT}.supabase.co/rest/v1/rpc/irp_pms_ota_gateway`;
const MAX_AGE_MS = 15 * 60 * 1000;

export function checkIsolatedWorkerOff(worker, now = Date.now()) {
  const failures = [];
  if (worker?.workerProject !== WORKER_PROJECT || worker?.environment !== "Production"
    || worker?.sourceProject !== SOURCE_PROJECT || worker?.receiverProject !== RECEIVER_PROJECT
    || worker?.destinationUrl !== DESTINATION) {
    failures.push("worker project, environment, source, or destination does not match the isolated replay");
  }
  if (worker?.deploymentState !== "Ready" || typeof worker?.deploymentId !== "string" || worker.deploymentId.length < 8) {
    failures.push("worker Ready deployment identity is missing");
  }
  if (worker?.syncEnabled !== false) failures.push("isolated scheduled worker must be disabled");
  if (worker?.dataChanged !== false) failures.push("worker evidence must be read-only");
  const checkedAt = Date.parse(worker?.checkedAt ?? "");
  if (!Number.isFinite(checkedAt) || checkedAt > now || now - checkedAt > MAX_AGE_MS) {
    failures.push("worker evidence is missing, future-dated, or older than 15 minutes");
  }
  return failures;
}
