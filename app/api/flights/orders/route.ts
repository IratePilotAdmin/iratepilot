export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const privateNoStoreHeaders = Object.freeze({
  "Cache-Control": "no-store, private, max-age=0",
  "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
});

export async function POST() {
  return Response.json(
    {
      error:
        "Flight booking is not open. No passenger or payment payload was inspected.",
      code: "flight_consumer_production_order_endpoint_locked",
      mode: "consumer_production_launch_locked",
      capabilities: {
        requestBodyRead: false,
        externalRequestMade: false,
        providerRequestCount: 0,
        paymentProcessorRequestCount: 0,
        passengerDataAccepted: false,
        orderAuthorized: false,
        paymentAuthorized: false,
        ticketingAuthorized: false,
        consumerReleaseEnabled: false,
      },
    },
    {
      status: 503,
      headers: privateNoStoreHeaders,
    },
  );
}
