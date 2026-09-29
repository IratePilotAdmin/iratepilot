import { afterEach, describe, expect, it, vi } from "vitest";
import { addDays, format } from "date-fns";

vi.mock("@/lib/auth/require-role", () => ({ requireRole: vi.fn() }));

import { requireRole } from "@/lib/auth/require-role";
import { POST } from "../app/api/revenue/upload/route";

const propertyId = "d498ed39-d34f-498f-84d3-9fe523f8ce65";
const roomId = "e498ed39-d34f-498f-84d3-9fe523f8ce66";
const upsert = vi.fn().mockResolvedValue({ error: null });
const insert = vi.fn().mockResolvedValue({ error: null });

function request(validateOnly: boolean) {
  const date = format(addDays(new Date(), 1), "yyyy-MM-dd");
  const csv = `property_id,room_id,stay_date,rooms_available,rooms_sold,current_rate\n${propertyId},${roomId},${date},10,7,100\n`;
  const form = new FormData();
  form.append("file", new File([csv], "revenue.csv", { type: "text/csv" }));
  if (validateOnly) form.append("validateOnly", "true");
  return new Request("http://localhost/api/revenue/upload", { method: "POST", body: form });
}

afterEach(() => vi.clearAllMocks());

describe("Revenue CSV validation gate", () => {
  it("checks ownership and room mapping without writing in validation mode", async () => {
    vi.mocked(requireRole).mockResolvedValue({
      user: { id: "owner" }, profile: { role: "partner" },
      supabase: {
        from: (table: string) => table === "properties"
          ? { select: () => ({ in: async () => ({ data: [{ id: propertyId, partners: { owner_id: "owner", status: "approved" } }], error: null }) }) }
          : table === "rooms"
            ? { select: () => ({ in: async () => ({ data: [{ id: roomId, property_id: propertyId }], error: null }) }) }
            : { upsert, insert },
      },
    } as never);
    const response = await POST(request(true));
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.validation).toMatchObject({ schemaVersion: 1, rowCount: 1, propertyCount: 1, roomTypeCount: 1, source: "CSV import", reconciliation: "Not reconciled with a PMS" });
    expect(upsert).not.toHaveBeenCalled();
    expect(insert).not.toHaveBeenCalled();

    const imported = await POST(request(false));
    expect(imported.status).toBe(200);
    expect(upsert).toHaveBeenCalledOnce();
    expect(insert).toHaveBeenCalledOnce();
  });
});
