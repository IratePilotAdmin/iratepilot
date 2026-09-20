import { searchSyntheticFlightMarketplace, SYNTHETIC_FLIGHT_MODE } from "../../../../lib/flights/synthetic-marketplace";
import { noStoreJson, offlineFlightCapabilities, parseSyntheticSearchBody } from "../_shared";

export async function POST(request: Request) {
  const parsed = await parseSyntheticSearchBody(request);
  if (!parsed.search?.query) {
    return noStoreJson({ error: parsed.error, mode: SYNTHETIC_FLIGHT_MODE, capabilities: offlineFlightCapabilities }, 400);
  }
  const plan = await searchSyntheticFlightMarketplace(parsed.search.query);
  return noStoreJson({
    mode: SYNTHETIC_FLIGHT_MODE,
    synthetic: true,
    query: parsed.search.query,
    offers: plan.offers,
    orchestration: plan.orchestration,
    capabilities: offlineFlightCapabilities,
  });
}
