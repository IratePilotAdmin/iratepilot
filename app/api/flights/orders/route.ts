import { noStoreJson, offlineFlightCapabilities } from "../_shared";
import { evaluateSyntheticFlightPreviewOperation, SYNTHETIC_FLIGHT_MODE } from "../../../../lib/flights/synthetic-marketplace";

export async function POST() {
  const decision = await evaluateSyntheticFlightPreviewOperation("create_order");
  return noStoreJson({
    error: "Flight order creation is disabled. No passenger or payment payload was inspected.",
    code: "flight_order_creation_disabled",
    mode: SYNTHETIC_FLIGHT_MODE,
    runtimeDecision: decision,
    capabilities: offlineFlightCapabilities,
  }, 503);
}
