import { repriceSyntheticFlightOffer, SYNTHETIC_FLIGHT_MODE } from "../../../../../../lib/flights/synthetic-marketplace";
import { noStoreJson, offlineFlightCapabilities, parseSyntheticSearchBody } from "../../../_shared";

type Params = Promise<{ id: string }>;

export async function POST(request: Request, { params }: { params: Params }) {
  const parsed = await parseSyntheticSearchBody(request);
  if (!parsed.search?.query) {
    return noStoreJson({ error: parsed.error, mode: SYNTHETIC_FLIGHT_MODE, capabilities: offlineFlightCapabilities }, 400);
  }
  const { id } = await params;
  const plan = await repriceSyntheticFlightOffer(parsed.search.query, id);
  if (!plan) {
    return noStoreJson({ error: "The synthetic offer does not match this search.", mode: SYNTHETIC_FLIGHT_MODE, capabilities: offlineFlightCapabilities }, 404);
  }
  return noStoreJson({
    mode: SYNTHETIC_FLIGHT_MODE,
    synthetic: true,
    receipt: plan.receipt,
    orchestration: plan.receipt.orchestration,
    capabilities: offlineFlightCapabilities,
  });
}
