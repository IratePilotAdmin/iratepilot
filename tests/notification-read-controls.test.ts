import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const route = readFileSync(new URL("../app/api/notifications/route.ts", import.meta.url), "utf8");
const overview = readFileSync(new URL("../components/account/customer-account-overview.tsx", import.meta.url), "utf8");
const schema = readFileSync(new URL("../supabase/schema.sql", import.meta.url), "utf8");

describe("customer notification read controls", () => {
  it("accepts exactly one owned-notification update mode", () => {
    expect(route).toContain("Boolean(value.id) !== Boolean(value.all)");
    expect(route).toContain('z.string().uuid().optional()');
    expect(route).toContain('.eq("user_id", user.id)');
    expect(route).toContain('.is("read_at", null)');
    expect(route).toContain('update = update.eq("id", parsed.data.id)');
    expect(route).toContain('error: "Unread notification not found."');
  });

  it("relies on the existing owner-only update policy", () => {
    expect(schema).toContain('create policy "Users can update own notifications"');
    expect(schema).toContain("using (user_id = auth.uid()) with check (user_id = auth.uid())");
    expect(route).not.toContain("createAdminClient");
  });

  it("offers single and bulk controls and updates unread state immediately", () => {
    expect(overview).toContain('method: "PATCH"');
    expect(overview).toContain("id ? { id } : { all: true }");
    expect(overview).toContain("Mark all read");
    expect(overview).toContain("Mark read");
    expect(overview).toContain("Math.max(0, current.summary.unreadUpdates - body.updated)");
    expect(overview).toContain("unreadUpdates: id ?");
  });

  it("does not cache notification state", () => {
    expect(route.match(/"Cache-Control": "no-store"/g)?.length).toBeGreaterThanOrEqual(2);
  });
});
