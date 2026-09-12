import { afterEach, beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  role: vi.fn(),
  client: vi.fn(() => { throw new Error("Unexpected database access"); }),
  resend: vi.fn(function () { throw new Error("Unexpected provider access"); }),
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
