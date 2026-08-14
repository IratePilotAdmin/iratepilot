export type EmailWorkerSummary = {
  processed: number;
  sent: number;
  suppressed: number;
  failed: number;
  deadLettered: number;
};

export function isEmailWorkerEnabled(value = process.env.EMAIL_WORKER_ENABLED) {
  return value === "true";
}

export function emptyEmailWorkerSummary(): EmailWorkerSummary {
  return { processed: 0, sent: 0, suppressed: 0, failed: 0, deadLettered: 0 };
}
