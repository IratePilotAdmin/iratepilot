import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function read(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

const completeRoute = read("app/api/flights/preview/orders/[orderId]/complete/route.ts");
const resumeRoute = read("app/api/flights/preview/orders/[orderId]/resume/route.ts");
const compensationRoute = read(
  "app/api/admin/flights/consumer-preview/reconciliation/[caseId]/compensate/route.ts",
);
const adminReconciliation = read("lib/flights/consumer-preview/admin-reconciliation.server.ts");
const delivery = read("lib/email/flight-notification-delivery.server.ts");
const duffelWebhook = read("lib/flights/consumer-preview/duffel-webhook.server.ts");
const duffelWebhookRoute = read("app/api/flights/preview/webhooks/duffel/route.ts");

describe("Flight Consumer Preview notification wiring", () => {
  it("schedules ticketed and review-pending delivery only after complete-order settles", () => {
    expect(completeRoute).toContain('import { after } from "next/server"');
    expect(completeRoute).toContain("scheduleFlightNotification");
    const completed = completeRoute.indexOf("await completeFlightConsumerPreviewOrder({");
    expect(completed).toBeGreaterThan(0);
    expect(completeRoute.indexOf('event: "ticketed"', completed)).toBeGreaterThan(completed);
    expect(completeRoute).toContain('event: "order_pending"');
    expect(completeRoute).toContain('event: "order_failed"');
    expect(completeRoute).toContain("Notification scheduling must never change the committed booking result");
    expect(completeRoute).toContain("export const maxDuration = 300");
  });

  it("keeps both order-finalization routes above the reviewed 130-second provider timeout", () => {
    for (const route of [completeRoute, resumeRoute]) {
      expect(route).toContain('export const runtime = "nodejs"');
      const seconds = Number(/export const maxDuration = (\d+);/.exec(route)?.[1]);
      expect(seconds * 1_000 - 130_000).toBeGreaterThanOrEqual(60_000);
    }
  });

  it("schedules failed/refunded outcomes after compensation without changing its response", () => {
    expect(compensationRoute).toContain('import { after } from "next/server"');
    expect(compensationRoute).toContain('event: "order_failed"');
    expect(compensationRoute).toContain('event: "refund_completed"');
    expect(compensationRoute).toContain('event: "order_pending"');
    expect(compensationRoute).toContain("The committed compensation response is independent of email");
    expect(adminReconciliation.indexOf("result = await reconcile({"))
      .toBeLessThan(adminReconciliation.indexOf("onCommitted?.({"));
    expect(adminReconciliation).toContain("A post-commit notification scheduler cannot change compensation state");
  });

  it("schedules ticketed delivery after authoritative asynchronous Duffel convergence", () => {
    expect(duffelWebhookRoute).toContain('import { after, NextResponse } from "next/server"');
    expect(duffelWebhookRoute).toContain("onOrderTicketed: ({ customerId, orderId }) => {");
    expect(duffelWebhookRoute).toContain("queueFlightConsumerPreviewNotification({");
    expect(duffelWebhookRoute).toContain('event: "ticketed"');
    expect(duffelWebhook.match(/await input\.orderConvergence\.converge\(/g)).toHaveLength(2);
    expect(duffelWebhook.match(/input\.onOrderTicketed\?\.\(/g)).toHaveLength(4);
    expect(duffelWebhook).toContain(
      "Ticket state is authoritative; notification scheduling is fail-open.",
    );
  });

  it("keeps delivery fail-open and the worker wake explicitly best effort", () => {
    expect(delivery).toContain("return null;");
    expect(delivery).toContain("worker wake-up is best effort");
    expect(delivery).toContain("wakeTransactionalEmailWorker()");
    expect(delivery).not.toContain("RESEND_API_KEY");
    expect(delivery).not.toContain("resend.emails.send");
    const failureLog = delivery.slice(
      delivery.indexOf('console.error("Flight Consumer Preview notification could not be queued"'),
      delivery.indexOf("return null;", delivery.indexOf(
        'console.error("Flight Consumer Preview notification could not be queued"',
      )),
    );
    expect(failureLog).not.toMatch(/customerId|orderId|paymentId|provider/i);
    expect(failureLog).toContain("event: input.event");
    expect(failureLog).toContain('error instanceof Error ? error.name : "UnknownError"');
  });
});
