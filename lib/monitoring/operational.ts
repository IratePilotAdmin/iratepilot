type OperationalLevel = "info" | "warning" | "error";

const sensitiveKey = /authorization|cookie|password|secret|token|credential|card|client_secret/i;

function safeContext(context: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(context).map(([key, value]) => [
    key,
    sensitiveKey.test(key) ? "[redacted]" : value,
  ]));
}

export function logOperationalEvent(
  level: OperationalLevel,
  event: string,
  context: Record<string, unknown> = {},
) {
  const payload = JSON.stringify({
    level,
    event,
    timestamp: new Date().toISOString(),
    ...safeContext(context),
  });
  if (level === "error") console.error(payload);
  else if (level === "warning") console.warn(payload);
  else console.log(payload);
}

export async function reportOperationalError(
  event: string,
  error: unknown,
  context: Record<string, unknown> = {},
) {
  const message = error instanceof Error ? error.message : String(error);
  const safe = safeContext({ ...context, message });
  logOperationalEvent("error", event, safe);

  const url = process.env.ERROR_WEBHOOK_URL;
  if (!url) return;

  try {
    await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(process.env.ERROR_WEBHOOK_TOKEN
          ? { Authorization: `Bearer ${process.env.ERROR_WEBHOOK_TOKEN}` }
          : {}),
      },
      body: JSON.stringify({ event, timestamp: new Date().toISOString(), ...safe }),
      signal: AbortSignal.timeout(4_000),
    });
  } catch (reportingError) {
    logOperationalEvent("warning", "operational_alert_delivery_failed", {
      sourceEvent: event,
      message: reportingError instanceof Error ? reportingError.message : String(reportingError),
    });
  }
}
