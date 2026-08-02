import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const route = readFileSync(
  new URL("../app/api/contact/route.ts", import.meta.url),
  "utf8",
);
const migration = readFileSync(
  new URL("../supabase/migrations/202608020012_secure_contact_submissions.sql", import.meta.url),
  "utf8",
);
const schema = readFileSync(
  new URL("../supabase/schema.sql", import.meta.url),
  "utf8",
);

describe("contact submission security", () => {
  it("keeps validated contact writes behind the server-only admin client", () => {
    expect(route).toContain('import { createAdminClient } from "@/lib/supabase/admin"');
    expect(route).toContain("contactSchema.safeParse");
    expect(route).toContain("const admin = createAdminClient()");
    expect(route).toContain('admin.from("contact_messages").insert(parsed.data)');
    expect(route).not.toContain("createClient");
  });

  it("removes direct anonymous contact-message insertion", () => {
    expect(migration).toContain('drop policy if exists "Public can submit contact messages"');
    expect(schema).not.toContain('create policy "Public can submit contact messages"');
  });
});
