import {
  OracleOperaClient,
  OracleOperaClientError,
} from "./client";
import type { OracleOperaConfig } from "./config";

type Fetch = typeof fetch;

export type OracleOperaConnectionTestConfig = OracleOperaConfig & {
  hotelId: string;
};

export type OracleOperaConnectionTestResult = {
  hotelCount: number;
};

export class OracleOperaConnectionTestError extends Error {
  constructor(
    message: string,
    readonly detailCode: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "OracleOperaConnectionTestError";
  }
}

function validateHotelId(hotelId: string) {
  const value = hotelId.trim();
  if (!value) throw new Error("Oracle OPERA hotel ID is required");
  if (value.length > 128 || !/^[A-Za-z0-9._-]+$/.test(value)) {
    throw new Error("Oracle OPERA hotel ID is invalid");
  }
  return value;
}

/**
 * Authenticates server-to-server, then performs Oracle's documented read-only
 * List of Values request to verify the application and hotel scope.
 */
export async function testOracleOperaSandboxConnection(
  config: OracleOperaConnectionTestConfig,
  fetcher: Fetch = fetch,
): Promise<OracleOperaConnectionTestResult> {
  const hotelId = validateHotelId(config.hotelId);
  const client = new OracleOperaClient(config, fetcher);

  try {
    await client.request<unknown>(
      "/lov/v1/listOfValues/Titles?parameterName=LanguageCode&includeInactiveFlag=false&parameterValue=E",
      { method: "GET", hotelId },
    );
    return { hotelCount: 1 };
  } catch (error) {
    if (error instanceof OracleOperaClientError) {
      throw new OracleOperaConnectionTestError(
        error.message,
        `oracle_opera_${error.code}`,
        error.status,
      );
    }
    throw new OracleOperaConnectionTestError(
      "Oracle OPERA sandbox could not be reached",
      "oracle_opera_sandbox_unreachable",
    );
  }
}
