export type SupportStatus = "new" | "in_progress" | "resolved";

export const SUPPORT_STATUS_UNCONFIRMED =
  "This status change could not be confirmed. Refresh cases to check its current status before trying again.";

type StatusUpdateResult = { confirmed: boolean; message: string };

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

export async function updateSupportCaseStatus(id: string, status: SupportStatus): Promise<StatusUpdateResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);
  try {
    const response = await fetch(`/api/admin/support/${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
      signal: controller.signal,
    });
    const body = record(await response.json().catch(() => null));
    if (response.ok) {
      const data = record(body?.data);
      if (response.status !== 200 || data?.id !== id || data.status !== status) {
        return { confirmed: false, message: SUPPORT_STATUS_UNCONFIRMED };
      }
      const message = status === "resolved" ? "Support case resolved."
        : status === "in_progress" ? "Support case marked in progress." : "Support case reopened.";
      return { confirmed: true, message };
    }
    const error = typeof body?.error === "string" ? body.error.replace(/\s+/g, " ").trim() : "";
    return {
      confirmed: false,
      message: error && error.length <= 300 ? error : "Support case could not be updated. Please refresh cases and try again.",
    };
  } catch {
    return { confirmed: false, message: SUPPORT_STATUS_UNCONFIRMED };
  } finally {
    clearTimeout(timeout);
  }
}
