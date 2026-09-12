import { afterEach, beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  role: vi.fn(),
  client: vi.fn<(...args: unknown[]) => unknown>(() => { throw new Error("Unexpected database access"); }),
  resend: vi.fn<(...args: unknown[]) => unknown>(function () { throw new Error("Unexpected provider access"); }),
}));
vi.mock("@/lib/auth/require-role", () => ({ requireRole: mocks.role }));
vi.mock("@supabase/supabase-js", () => ({ createClient: mocks.client }));
vi.mock("resend", () => ({ Resend: mocks.resend }));
vi.mock("@/lib/monitoring/operational", () => ({ logOperationalEvent: vi.fn(), reportOperationalError: vi.fn() }));
import { GET, POST } from "../app/api/email/process/route";

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("CRON_SECRET", "test-cron-secret");
  vi.stubEnv("EMAIL_WORKER_ENABLED", "true");
  mocks.role.mockResolvedValue({ error: "Unauthorized" });
});

it.each([false, true])("uses server credentials and handles claim failure=%s", async (failure) => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://database.example.test");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "synthetic-server-key");
  vi.stubEnv("RESEND_API_KEY", "synthetic-provider-key");
  vi.stubEnv("RESEND_FROM_EMAIL", "test@example.test");
  const rpc = vi.fn().mockResolvedValue(failure
    ? { data: null, error: { message: "synthetic claim failure" } }
    : { data: [], error: null });
  const send = vi.fn(() => { throw new Error("No job may be sent"); });
  mocks.client.mockImplementationOnce(() => ({ rpc }));
  mocks.resend.mockImplementationOnce(function () { return { emails: { send } }; });
  const response = await POST(new Request("https://example.test/api/email/process", {
    headers: { authorization: "Bearer test-cron-secret" },
  }));
  expect(response.status).toBe(failure ? 500 : 200);
  expect(mocks.client).toHaveBeenCalledWith("https://database.example.test", "synthetic-server-key", {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  expect(rpc).toHaveBeenCalledExactlyOnceWith("claim_transactional_email_job");
  expect(send).not.toHaveBeenCalled();
  expect(mocks.role).not.toHaveBeenCalled();
  expect(await response.json()).toMatchObject({ success: !failure, summary: { processed: 0, sent: 0 } });
});
afterEach(() => vi.unstubAllEnvs());

it.each([GET, POST])("rejects unauthorized requests before creating external clients", async (handler) => {
  const response = await handler(new Request("https://example.test/api/email/process", {
    headers: { authorization: "Bearer incorrect" },
  }));
  expect(response.status).toBe(401);
  expect(mocks.role).toHaveBeenCalledWith(["admin"]);
  expect(mocks.client).not.toHaveBeenCalled();
  expect(mocks.resend).not.toHaveBeenCalled();
});

it("honors the disabled-worker hold for an authorized cron request", async () => {
  vi.stubEnv("EMAIL_WORKER_ENABLED", "false");
  const response = await POST(new Request("https://example.test/api/email/process", {
    headers: { authorization: "Bearer test-cron-secret" },
  }));
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ disabled: true });
  expect(mocks.role).not.toHaveBeenCalled();
  expect(mocks.client).not.toHaveBeenCalled();
  expect(mocks.resend).not.toHaveBeenCalled();
});
