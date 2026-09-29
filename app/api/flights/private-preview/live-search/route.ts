import { requireUser } from "@/lib/auth/require-user";
import {
  createFlightConsumerProductionPrivatePreviewRouteHandler,
} from "@/lib/flights/consumer-production/private-preview-live-shopping-http.server";
import {
  createFlightConsumerProductionPrivatePreviewLiveShoppingWorkflow,
} from "@/lib/flights/consumer-production/private-preview-live-shopping.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export const POST = createFlightConsumerProductionPrivatePreviewRouteHandler({
  environment: () => process.env,
  async authenticate() {
    // Deliberately omit Request: this route accepts only the cookie-backed
    // Supabase session and never converts a caller-supplied bearer token.
    const authentication = await requireUser();
    if ("error" in authentication) {
      return { error: "Authentication required.", status: 401 as const };
    }
    return { userId: authentication.user.id };
  },
  async execute(input) {
    return createFlightConsumerProductionPrivatePreviewLiveShoppingWorkflow()
      .execute(input);
  },
});
