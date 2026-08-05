import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const route = readFileSync(
  new URL("../app/api/email/process/route.ts", import.meta.url),
  "utf8",
);
const migration = readFileSync(
  new URL("../supabase/migrations/202608020020_secure_email_worker.sql", import.meta.url),
  "utf8",
);
const schema = readFileSync(
  new URL("../supabase/schema.sql", import.meta.url),
  "utf8",
);
const vercel = JSON.parse(readFileSync(
  new URL("../vercel.json", import.meta.url),
  "utf8",
)) as { crons: Array<{ path: string; schedule: string }> };

describe("secure transactional email worker", () => {
  it("authenticates cron and manual requests before service-role access", () => {
    expect(route).toContain("process.env.CRON_SECRET");
    expect(route).toContain('request.headers.get("authorization")');
    expect(route).toContain("`Bearer ${cronSecret}`");
    expect(route).toContain("status: 401");
    expect(route.indexOf('request.headers.get("authorization")'))
      .toBeLessThan(route.indexOf("createClient(supabaseUrl, serviceRoleKey"));
    expect(route).toContain("export async function GET");
    expect(route).toContain("export async function POST");
  });

  it("claims and updates the real email_outbox schema", () => {
    expect(route.match(/\.from\("email_outbox"\)/g)).toHaveLength(2);
    expect(route).not.toContain("transactional_email_jobs");
    expect(route).toContain("resend_email_id");
    expect(route).toContain("processed_at");
  });

  it("atomically claims retryable jobs and recovers stale workers", () => {
    expect(migration).toContain("function public.claim_transactional_email_job");
    expect(migration).toContain("for update skip locked");
    expect(migration).toContain("attempts < 3");
    expect(migration).toContain("interval '15 minutes'");
    expect(migration).toContain("grant execute on function public.claim_transactional_email_job() to service_role");
    expect(schema).toContain("function public.claim_transactional_email_job");
  });

  it("schedules only the authenticated email endpoint", () => {
    expect(vercel.crons).toEqual([{
      path: "/api/email/process",
      schedule: "0 8 * * *",
    }]);
  });
});
