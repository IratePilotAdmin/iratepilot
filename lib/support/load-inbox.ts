import type { SupportStatus } from "@/lib/support/status-update";

export type SupportCase = { id: string; name: string; email: string; message: string; status: SupportStatus; created_at: string };
export type SupportSummary = { total: number; new: number; inProgress: number; resolved: number };
export type SupportQueue = "all" | "hotel_manager_interest" | "general_support";
type InboxFilters = { status: "all" | SupportStatus; queue: SupportQueue; q: string; offset: number };
type SupportInbox = { data: SupportCase[]; summary: SupportSummary; limit: number; offset: number; totalMatches: number; hasMore: boolean };

export const SUPPORT_LOAD_ERROR = "Support cases could not be loaded. Please refresh and try again.";
export const SUPPORT_LOAD_TIMEOUT = "Support cases took too long to load. Please refresh and try again.";

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function count(value: unknown) {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function validInbox(value: unknown, offset: number): value is SupportInbox {
  const body = record(value);
  const summary = record(body?.summary);
  if (!body || !summary || !["total", "new", "inProgress", "resolved"].every((key) => count(summary[key]))
    || body.limit !== 200 || body.offset !== offset || !count(body.totalMatches) || typeof body.hasMore !== "boolean"
    || !Array.isArray(body.data) || body.data.length > 200) return false;
  const ids = new Set<string>();
  return body.data.every((value) => {
    const item = record(value);
    if (!item || typeof item.id !== "string" || !item.id || ids.has(item.id)
      || typeof item.name !== "string" || typeof item.email !== "string" || typeof item.message !== "string"
      || typeof item.status !== "string" || !["new", "in_progress", "resolved"].includes(item.status)
      || typeof item.created_at !== "string" || !Number.isFinite(Date.parse(item.created_at))) return false;
    // Hotel reply links URI-encode the name; malformed UTF-16 would throw during render.
    try { encodeURIComponent(item.name); } catch { return false; }
    ids.add(item.id);
    return true;
  });
}

export async function loadSupportInbox(filters: InboxFilters, signal: AbortSignal): Promise<SupportInbox> {
  if (signal.aborted) throw new Error(SUPPORT_LOAD_ERROR);
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal.addEventListener("abort", abort, { once: true });
  let timedOut = false;
  const timeout = setTimeout(() => { timedOut = true; controller.abort(); }, 30_000);
  try {
    const params = new URLSearchParams({ ...filters, offset: String(filters.offset) });
    const response = await fetch(`/api/admin/support?${params}`, { signal: controller.signal })
      .catch(() => { throw new Error(SUPPORT_LOAD_ERROR); });
    const body: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      const error = record(body)?.error;
      const message = typeof error === "string" ? error.replace(/\s+/g, " ").trim() : "";
      throw new Error(message && message.length <= 300 ? message : SUPPORT_LOAD_ERROR);
    }
    if (response.status !== 200 || !validInbox(body, filters.offset)) throw new Error(SUPPORT_LOAD_ERROR);
    return body;
  } catch (error) {
    if (timedOut) throw new Error(SUPPORT_LOAD_TIMEOUT);
    throw error;
  } finally {
    clearTimeout(timeout);
    signal.removeEventListener("abort", abort);
  }
}
