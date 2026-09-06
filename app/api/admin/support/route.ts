import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/require-role";
import { createAdminClient } from "@/lib/supabase/admin";
import { HOTEL_MANAGER_INTEREST_MESSAGE_PREFIX } from "@/lib/hotels/manager-interest";

const inboxLimit = 200;
const responseHeaders = { "Cache-Control": "no-store" };

function escapeLike(value: string) {
  return value.replace(/[\\%_]/g, "\\$&");
}

function quoteFilterValue(value: string) {
  return `"${value.replace(/[\\"]/g, "\\$&")}"`;
}

function exactCount(value: number | null) {
  if (!Number.isSafeInteger(value) || value === null || value < 0) {
    throw new Error("Support count unavailable");
  }
  return value;
}

export async function GET(request: Request) {
  try {
    const auth = await requireRole(["admin"]);
    if ("error" in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status, headers: responseHeaders });
    }

    const params = new URL(request.url).searchParams;
    const status = params.get("status") ?? "all";
    const queue = params.get("queue") ?? "all";
    const search = (params.get("q") ?? "").trim();
    const offsetText = params.get("offset") ?? "0";
    const offset = Number(offsetText);
    if (
      ["status", "queue", "q", "offset"].some((key) => params.getAll(key).length > 1)
      || !["all", "new", "in_progress", "resolved"].includes(status)
      || !["all", "hotel_manager_interest", "general_support"].includes(queue)
      || search.length > 200 || search.includes("\0")
      || !/^\d+$/.test(offsetText) || !Number.isSafeInteger(offset)
      || offset > Number.MAX_SAFE_INTEGER - (inboxLimit - 1)
    ) {
      return NextResponse.json({ error: "Invalid support filters." }, { status: 400, headers: responseHeaders });
    }

    const admin = createAdminClient();
    const filteredMessages = (head = false) => {
      let query = admin.from("contact_messages")
        .select("id,name,email,message,status,created_at", { count: "exact", head });
      if (status !== "all") query = query.eq("status", status);
      const hotelPrefixPattern = `${escapeLike(HOTEL_MANAGER_INTEREST_MESSAGE_PREFIX)}%`;
      if (queue === "hotel_manager_interest") query = query.like("message", hotelPrefixPattern);
      if (queue === "general_support") query = query.not("message", "like", hotelPrefixPattern);
      if (search) {
        // PostgREST aliases '*' to '%' in LIKE patterns. Literal regex handles that case.
        const operator = search.includes("*") ? "imatch" : "ilike";
        const pattern = operator === "imatch"
          ? search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
          : `%${escapeLike(search)}%`;
        const value = quoteFilterValue(pattern);
        query = query.or(["name", "email", "message"].map((column) => `${column}.${operator}.${value}`).join(","));
      }
      return query;
    };
    const statusCount = (status: string) => admin.from("contact_messages")
      .select("id", { count: "exact", head: true })
      .eq("status", status);
    const [messages, allCases, newCases, inProgressCases, resolvedCases] = await Promise.all([
      filteredMessages().order("created_at", { ascending: false }).order("id", { ascending: false })
        .range(offset, offset + inboxLimit - 1),
      admin.from("contact_messages").select("id", { count: "exact", head: true }),
      statusCount("new"),
      statusCount("in_progress"),
      statusCount("resolved"),
    ]);
    const pageOutOfRange = messages.status === 416 && messages.error?.code === "PGRST103";
    const error = (!pageOutOfRange && messages.error) || allCases.error || newCases.error || inProgressCases.error || resolvedCases.error;
    if (error) throw error;
    if (!pageOutOfRange && !Array.isArray(messages.data)) {
      throw new Error("Support rows unavailable");
    }
    let totalMatches: number;
    if (pageOutOfRange) {
      // Status changes can remove the final page between loads. Supply a fresh
      // matching count so the client can move back to an existing page.
      const remaining = await filteredMessages(true);
      if (remaining.error) throw remaining.error;
      totalMatches = exactCount(remaining.count);
    } else {
      totalMatches = exactCount(messages.count);
    }

    return NextResponse.json({
      data: pageOutOfRange ? [] : messages.data,
      summary: {
        total: exactCount(allCases.count),
        new: exactCount(newCases.count),
        inProgress: exactCount(inProgressCases.count),
        resolved: exactCount(resolvedCases.count),
      },
      limit: inboxLimit,
      offset,
      totalMatches,
      hasMore: totalMatches - offset > inboxLimit,
      truncated: totalMatches > inboxLimit,
    }, { headers: responseHeaders });
  } catch (error) {
    console.error("Admin support inbox failed", error);
    return NextResponse.json({ error: "Support cases could not be loaded." }, { status: 503, headers: responseHeaders });
  }
}
