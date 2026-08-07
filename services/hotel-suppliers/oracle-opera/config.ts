export type OracleOperaConfig = {
  baseUrl: string;
  tokenUrl: string;
  clientId: string;
  clientSecret: string;
  appKey: string;
  timeoutMs: number;
};

type Environment = Record<string, string | undefined>;

const environmentKeys = {
  baseUrl: "PMS_ORACLE_OPERA_BASE_URL",
  tokenUrl: "PMS_ORACLE_OPERA_TOKEN_URL",
  clientId: "PMS_ORACLE_OPERA_CLIENT_ID",
  clientSecret: "PMS_ORACLE_OPERA_CLIENT_SECRET",
  appKey: "PMS_ORACLE_OPERA_APP_KEY",
  timeoutMs: "PMS_ORACLE_OPERA_TIMEOUT_MS",
} as const;

function requireValue(environment: Environment, key: string) {
  const value = environment[key]?.trim();
  if (!value) {
    throw new Error(`Missing required Oracle OPERA configuration: ${key}`);
  }
  return value;
}

function normalizedUrl(value: string, key: string) {
  try {
    return new URL(value).toString().replace(/\/$/, "");
  } catch {
    throw new Error(`Invalid URL in Oracle OPERA configuration: ${key}`);
  }
}

export function loadOracleOperaConfig(
  environment: Environment = process.env,
): OracleOperaConfig {
  const baseUrl = normalizedUrl(
    requireValue(environment, environmentKeys.baseUrl),
    environmentKeys.baseUrl,
  );
  const timeoutValue = environment[environmentKeys.timeoutMs]?.trim();
  const timeoutMs = timeoutValue ? Number(timeoutValue) : 15_000;

  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new Error(
      `Invalid positive number in Oracle OPERA configuration: ${environmentKeys.timeoutMs}`,
    );
  }

  const tokenUrlValue = environment[environmentKeys.tokenUrl]?.trim();

  return {
    baseUrl,
    tokenUrl: tokenUrlValue
      ? normalizedUrl(tokenUrlValue, environmentKeys.tokenUrl)
      : `${baseUrl}/oauth/v1/tokens`,
    clientId: requireValue(environment, environmentKeys.clientId),
    clientSecret: requireValue(environment, environmentKeys.clientSecret),
    appKey: requireValue(environment, environmentKeys.appKey),
    timeoutMs,
  };
}
