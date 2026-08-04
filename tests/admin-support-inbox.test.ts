import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const listRoute = readFileSync(new URL("../app/api/admin/support/route.ts", import.meta.url), "utf8");
const updateRoute = readFileSync(new URL("../app/api/admin/support/[id]/route.ts", import.meta.url), "utf8");
const page = readFileSync(new URL("../app/admin/support/page.tsx", import.meta.url), "utf8");
const navigation = readFileSync(new URL("../data/navigation.ts", import.meta.url), "utf8");

describe("admin support inbox", () => {
  it("requires admin authorization before service-role reads and writes", () => {
    for (const route of [listRoute, updateRoute]) {
      expect(route).toContain('requireRole(["admin"])');
      expect(route.indexOf('requireRole(["admin"])')).toBeLessThan(route.indexOf("createAdminClient()"));
    }
  });

  it("limits status updates to the supported case lifecycle", () => {
    expect(updateRoute).toContain('z.enum(["new", "in_progress", "resolved"])');
    expect(updateRoute).toContain(".maybeSingle()");
    expect(updateRoute).toContain('status: 404');
  });

  it("loads exact queue counts in parallel and limits the inbox", () => {
    expect(listRoute).toContain("Promise.all([");
    expect(listRoute).toContain('statusCount("new")');
    expect(listRoute).toContain('statusCount("in_progress")');
    expect(listRoute).toContain('statusCount("resolved")');
    expect(listRoute).toContain(".limit(inboxLimit)");
  });

  it("replaces the placeholder and exposes support in admin navigation", () => {
    expect(page).toContain("<AdminSupport />");
    expect(page).not.toContain("Administrative module placeholder");
    expect(navigation).toContain('{ href: "/admin/support", label: "Support" }');
  });
});
