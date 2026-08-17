import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { resolveTransactionalEmailWorkerOrigin } from "../lib/email/worker-origin";

const read = (file: string) => fs.readFileSync(path.join(process.cwd(), file), "utf8");

describe("immediate transactional email delivery", () => {
  it("wakes the secured worker after booking notifications are queued", () => {
    const outbox = read("lib/email/outbox.ts");
    const workerOrigin = read("lib/email/worker-origin.ts");
    const booking = read("lib/email/booking-notifications.ts");
    expect(outbox).toContain("wakeTransactionalEmailWorker");
    expect(outbox).toContain("resolveTransactionalEmailWorkerOrigin");
    expect(workerOrigin).toContain("VERCEL_URL");
    expect(workerOrigin).toContain("NEXT_PUBLIC_APP_URL");
    expect(outbox).toContain("authorization: `Bearer ${cronSecret}`");
    expect(booking).toContain("await wakeTransactionalEmailWorker()");
  });

  it("provides an admin-only test endpoint and control", () => {
    const route = read("app/api/admin/email-test/route.ts");
    const settings = read("components/dashboard/admin-settings.tsx");
    expect(route).toContain('requireRole(["admin"])');
    expect(route).toContain("auth.user.email");
    expect(route).toContain("No booking or payment was created");
    expect(route).toContain('.eq("template_name", "launch_delivery_test")');
    expect(route).toContain('.in("status", ["pending", "processing"])');
    expect(route).toContain("reusedPendingJob");
    expect(settings).toContain("/api/admin/email-test");
    expect(settings).toContain("/api/email/process");
    expect(settings).toContain("Test email sent. Check the administrator inbox.");
    expect(settings).toContain("Send test email");
  });

  it("allows a signed-in administrator to run the worker without exposing the cron secret", () => {
    const workerRoute = read("app/api/email/process/route.ts");
    expect(workerRoute).toContain('requireRole(["admin"])');
    expect(workerRoute).toContain("authorizedByCron");
    expect(workerRoute).toContain('request.headers.get("authorization")');
  });

  it("uses a stable Preview application URL before the production fallback", () => {
    expect(resolveTransactionalEmailWorkerOrigin({
      VERCEL_URL: undefined,
      VERCEL_BRANCH_URL: undefined,
      NEXT_PUBLIC_APP_URL: "https://iratepilotadmin-preview-20260817.vercel.app/path",
      VERCEL_PROJECT_PRODUCTION_URL: "www.iratepilot.com",
    })).toBe("https://iratepilotadmin-preview-20260817.vercel.app");
  });

  it("uses the incoming request origin before deployment environment fallbacks", () => {
    expect(resolveTransactionalEmailWorkerOrigin({
      VERCEL_URL: "preview-deployment.vercel.app",
      NEXT_PUBLIC_APP_URL: "https://preview-alias.vercel.app",
      VERCEL_PROJECT_PRODUCTION_URL: "www.iratepilot.com",
    }, "https://request-preview.vercel.app/admin/settings")).toBe(
      "https://request-preview.vercel.app",
    );
  });

  it("prefers immutable or branch deployment hosts and rejects insecure app URLs", () => {
    expect(resolveTransactionalEmailWorkerOrigin({
      VERCEL_URL: "preview-deployment.vercel.app",
      VERCEL_BRANCH_URL: "preview-branch.vercel.app",
      NEXT_PUBLIC_APP_URL: "https://preview-alias.vercel.app",
      VERCEL_PROJECT_PRODUCTION_URL: "www.iratepilot.com",
    })).toBe("https://preview-deployment.vercel.app");

    expect(resolveTransactionalEmailWorkerOrigin({
      VERCEL_URL: undefined,
      VERCEL_BRANCH_URL: undefined,
      NEXT_PUBLIC_APP_URL: "http://localhost:3000",
      VERCEL_PROJECT_PRODUCTION_URL: undefined,
    })).toBeNull();
  });
});
