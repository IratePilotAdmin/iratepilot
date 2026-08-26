import { requireUser } from "@/lib/auth/require-user";
import { privateNoStoreJson } from "@/lib/flights/consumer-preview/http.server";
import { getConsumerFlightOrder } from "@/lib/flights/consumer-preview/repository.server";
import { requireFlightConsumerPreviewRequestRuntime } from "@/lib/flights/consumer-preview/runtime-authority.server";

export const dynamic = "force-dynamic";

type Params = Promise<{ orderId: string }>;

export async function GET(request: Request, { params }: { params: Params }) {
  const authentication = await requireUser(request);
  if ("error" in authentication) {
    return privateNoStoreJson({ error: authentication.error }, authentication.status);
  }
  try {
    await requireFlightConsumerPreviewRequestRuntime();
    const { orderId } = await params;
    if (!/^[0-9a-f-]{36}$/i.test(orderId)) {
      return privateNoStoreJson({ error: "Test order not found." }, 404);
    }
    const order = await getConsumerFlightOrder(orderId);
    if (!order) return privateNoStoreJson({ error: "Test order not found." }, 404);
    return privateNoStoreJson({
      data: {
        order: {
          status: order.status,
          paymentStatus: order.payment?.status ?? null,
          ticketCount: order.tickets.filter((ticket) => ticket.status === "issued").length,
          updatedAt: order.updatedAt,
        },
      },
    });
  } catch {
    return privateNoStoreJson({ error: "Flight Consumer Preview is unavailable." }, 503);
  }
}
