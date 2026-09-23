type OperationalLevel = "info" | "warning" | "error";

const sensitiveKey = /authorization|cookie|password|secret|token|credential|card|client_secret|api[-_]?key/i;
const sensitiveValue = /(?:duffel_(?:live|test)_[A-Za-z0-9_-]{16,}|(?:sk|rk)_(?:live|test)_[A-Za-z0-9_-]{16,}|whsec_[A-Za-z0-9_-]{16,}|Bearer\s+[A-Za-z0-9._~+/=-]{16,})/gi;
const sensitiveQueryValue = /([?&](?:token|access_token|api_key|key|secret|signature)=)[^&\s]+/gi;

function redactString(value: string) {
  return value
    .replace(sensitiveValue, "[redacted]")
    .replace(sensitiveQueryValue, "$1[redacted]");
}

function safeValue(value: unknown, seen: WeakSet<object>): unknown {
  if (typeof value === "string") return redactString(value);
  if (typeof value === "bigint") return `[bigint:${value.toString()}]`;
  if (value === null || typeof value === "number" || typeof value === "boolean") return value;
  if (value === undefined) return undefined;
  if (value instanceof Error) {
    return {
      name: redactString(value.name),
      message: redactString(value.message),
    };
  }
  if (typeof value !== "object") return `[unserializable:${typeof value}]`;
  if (seen.has(value)) return "[circular]";
  seen.add(value);
  if (Array.isArray(value)) return value.map((item) => safeValue(item, seen));
  const result: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    result[key] = sensitiveKey.test(key) ? "[redacted]" : safeValue(item, seen);
  }
  return result;
}

function safeContext(context: Record<string, unknown>) {
  return safeValue(context, new WeakSet<object>()) as Record<string, unknown>;
}

export function logOperationalEvent(
  level: OperationalLevel,
  event: string,
  context: Record<string, unknown> = {},
) {
  const payload = JSON.stringify({
    level,
    event: redactString(event),
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
  const safe = safeContext({ ...context, message: redactString(message) });
  logOperationalEvent("error", event, safe);

  const url = process.env.ERROR_WEBHOOK_URL;
  if (!url) return;

  try {
    const response = await fetch(url, {
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
    if (!response.ok) {
      throw new Error(`Operational alert delivery failed with HTTP ${response.status}.`);
    }
  } catch (reportingError) {
    logOperationalEvent("warning", "operational_alert_delivery_failed", {
      sourceEvent: event,
      message: reportingError instanceof Error ? reportingError.message : String(reportingError),
    });
  }
}
