import { OracleOperaAdapter } from "./adapter";
import {
  OracleOperaDistributionClient,
  type OracleOperaDistributionConfig,
} from "./distribution-client";
import { oracleOperaDistributionMapper } from "./distribution-mapper";

export function createOracleOperaDistributionAdapter(
  config: OracleOperaDistributionConfig,
  fetcher: typeof fetch = fetch,
) {
  return new OracleOperaAdapter(
    new OracleOperaDistributionClient(config, fetcher),
    oracleOperaDistributionMapper,
  );
}
