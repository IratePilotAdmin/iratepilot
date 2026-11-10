export type AirbnbTechnologyControl = {
  id: string;
  label: string;
  implemented: boolean;
  configured: boolean;
  evidence: string;
};

export type AirbnbTechnologyReadiness = {
  status: "evidence_only";
  eligibilityDetermined: false;
  controls: readonly AirbnbTechnologyControl[];
};

type Environment = Record<string, string | undefined>;

function validCredentialEncryptionKey(value: string | undefined) {
  if (!value) return false;
  return Buffer.from(value, "base64").length === 32;
}

export function buildAirbnbTechnologyReadiness(
  environment: Environment,
): AirbnbTechnologyReadiness {
  return {
    status: "evidence_only",
    eligibilityDetermined: false,
    controls: [
      {
        id: "admin_access_control",
        label: "Admin-only integration controls",
        implemented: true,
        configured: true,
        evidence: "Integration readiness endpoints require the admin role and return no-store responses.",
      },
      {
        id: "credential_encryption",
        label: "PMS credential encryption",
        implemented: true,
        configured: validCredentialEncryptionKey(environment.PMS_CREDENTIAL_ENCRYPTION_KEY),
        evidence: "The credential vault implements authenticated AES-256-GCM encryption with a server-only 32-byte key.",
      },
      {
        id: "continuous_integration",
        label: "Automated quality gate",
        implemented: true,
        configured: true,
        evidence: "CI runs lint, type checks, migrations, tests, dependency audit, and production build checks.",
      },
      {
        id: "code_scanning",
        label: "Code scanning",
        implemented: true,
        configured: true,
        evidence: "CodeQL analyzes JavaScript and TypeScript on pull requests, main-branch pushes, and a weekly schedule.",
      },
      {
        id: "dependency_governance",
        label: "Dependency governance",
        implemented: true,
        configured: true,
        evidence: "Dependency Review blocks high-severity runtime changes and Dependabot checks npm and GitHub Actions weekly.",
      },
      {
        id: "health_monitoring",
        label: "Health monitoring",
        implemented: true,
        configured: true,
        evidence: "A bounded health endpoint reports authentication, administration, and database reachability without exposing secrets.",
      },
      {
        id: "operational_alerting",
        label: "Operational alert delivery",
        implemented: true,
        configured: Boolean(environment.ERROR_WEBHOOK_URL?.trim()),
        evidence: "Operational reporting redacts sensitive context and supports a bounded external alert webhook.",
      },
    ],
  };
}
