import { pmsProviders } from "./providers";
import type { PmsProviderManifest, PmsProviderReadiness } from "./types";

type Environment = Record<string, string | undefined>;

function requiredEnvironmentKeys(provider: PmsProviderManifest) {
  return provider.requiredConfiguration.map(
    (suffix) => `${provider.environmentPrefix}_${suffix}`,
  );
}

function isValidConfiguration(key: string, value: string) {
  if (key.endsWith("_BASE_URL")) {
    try {
      return new URL(value).protocol === "https:";
    } catch {
      return false;
    }
  }
  if (key.endsWith("_CLIENT_SECRET") || key.endsWith("_APP_KEY") || key.endsWith("_TOKEN")) {
    return value.length >= 12;
  }
  return value.length >= 3;
}

export function validatePmsConfiguration(
  provider: PmsProviderManifest,
  environment: Environment,
) {
  const requiredKeys = requiredEnvironmentKeys(provider);
  const configuredKeys = requiredKeys.filter((key) => Boolean(environment[key]?.trim()));
  const missingConfiguration = requiredKeys.filter((key) => !environment[key]?.trim());
  const invalidConfiguration = configuredKeys.filter((key) => {
    const value = environment[key]?.trim();
    return !value || !isValidConfiguration(key, value);
  });

  return { configuredKeys, missingConfiguration, invalidConfiguration };
}

export function buildPmsReadiness(environment: Environment): PmsProviderReadiness[] {
  return pmsProviders.map((provider) => {
    const { configuredKeys, missingConfiguration, invalidConfiguration } =
      validatePmsConfiguration(provider, environment);

    const status = configuredKeys.length === 0
      ? "not_configured"
      : missingConfiguration.length > 0
        ? "credentials_required"
        : invalidConfiguration.length > 0
          ? "invalid_configuration"
          : "ready_for_validation";

    return {
      id: provider.id,
      name: provider.name,
      vendor: provider.vendor,
      status,
      capabilities: provider.capabilities,
      certificationRequired: provider.certificationRequired,
      missingConfiguration,
      invalidConfiguration,
      documentationUrl: provider.documentationUrl,
      notes: provider.notes,
    };
  });
}

