import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const branch = "agent/flight-live-foundation-20260823";
const files = {
  manifest: "docs/evidence/FLIGHT_CONNECTOR_ROUTE_PACKET_MANIFEST_2026-09-23.json",
  security: "docs/evidence/FLIGHT_DEPENDENCY_SECURITY_RECHECK_2026-11-09.json",
  engineering: "docs/evidence/FLIGHT_ENGINEERING_VERIFICATION_2026-11-09.json",
  preview: "docs/evidence/FLIGHT_PREVIEW_DEPLOYMENT_RECHECK_2026-11-09.json",
  canonical: "docs/evidence/FLIGHT_CANONICAL_PRODUCTION_SMOKE_2026-11-09.json",
  completion: "docs/evidence/FLIGHT_COMPLETION_AUDIT_2026-11-09.json",
};

function fail(message) {
  throw new Error(`FLIGHT_LAUNCH_EVIDENCE_AUDIT_FAIL: ${message}`);
}

function readJson(name, relativePath) {
  let raw;
  try {
    raw = readFileSync(resolve(root, relativePath), "utf8");
  } catch (error) {
    fail(`${name} could not be read: ${error instanceof Error ? error.message : "unknown error"}`);
  }
  try {
    return { raw, value: JSON.parse(raw) };
  } catch {
    fail(`${name} is not valid JSON.`);
  }
}

function assert(condition, message) {
  if (!condition) fail(message);
}

function assertClosed(value, label) {
  assert(value === false, `${label} must remain false.`);
}

function assertZeroGate(gate, label) {
  assert(gate && gate.complete === 0, `${label}.complete must be 0.`);
  assert(Number.isInteger(gate.total) && gate.total > 0, `${label}.total must be positive.`);
}

const loaded = Object.fromEntries(
  Object.entries(files).map(([name, relativePath]) => [name, readJson(name, relativePath)]),
);
const evidence = Object.fromEntries(
  Object.entries(loaded).map(([name, packet]) => [name, packet.value.evidence]),
);

for (const [name, packet] of Object.entries(loaded)) {
  const current = packet.value?.evidence;
  assert(current?.sanitized === true, `${name} must be marked sanitized.`);
  assert(current.secretValuesIncluded === false || current.rawCredentialValuesIncluded === false,
    `${name} must not include secret values.`);
}

const rawEvidence = Object.values(loaded).map(({ raw }) => raw).join("\n");
assert(!/(?:duffel_(?:live|test)_[A-Za-z0-9_-]{16,}|(?:sk|rk)_(?:live|test)_[A-Za-z0-9_-]{16,}|whsec_[A-Za-z0-9_-]{16,})/.test(rawEvidence),
  "secret-shaped credential material is present in evidence.");

const manifest = evidence.manifest;
const catalog = manifest.candidateCatalog;
assert(manifest.sourceCommit && typeof manifest.sourceCommit === "string",
  "the route manifest must bind a source commit.");
assert(catalog.totalConnectors === 9 && catalog.connectors.length === 9,
  "the candidate catalog must contain nine connectors.");
for (const [label, gate] of Object.entries({
  activationGates: catalog.activationGates,
  diligenceWorkstreams: catalog.diligenceWorkstreams,
  credentialGates: catalog.credentialGates,
  sandboxGates: catalog.sandboxGates,
  routingGates: catalog.routingGates,
})) assertZeroGate(gate, `candidateCatalog.${label}`);
assertClosed(catalog.externalNetworkAccess, "candidateCatalog.externalNetworkAccess");
assert(catalog.liveConnectorCount === 0, "candidateCatalog.liveConnectorCount must be 0.");
assert(manifest.routeDecision.primary === "duffel", "Duffel must remain the primary route preference.");
assert(manifest.routeDecision.secondary === "sabre", "Sabre must remain the secondary route preference.");
for (const [label, value] of Object.entries(manifest.routeDecision)) {
  if (label.endsWith("Authorized") || label === "operationalRouteEnabled") {
    assertClosed(value, `routeDecision.${label}`);
  }
}
assert(manifest.routePackets.length === 2, "exactly two selected route packets are required.");
for (const packet of manifest.routePackets) {
  for (const key of [
    "contractAuthority", "contractEvidence", "sandboxCredentials", "sandboxCertification",
    "paymentSettlement", "securityPrivacy", "supportRelease", "previewRelease",
    "productionRelease", "consumerActivation",
  ]) assertZeroGate(packet[key], `${packet.connector}.${key}`);
  for (const key of ["externalNetworkAccess", "bookingAuthorized", "ticketingAuthorized", "paymentAuthorized"]) {
    assertClosed(packet[key], `${packet.connector}.${key}`);
  }
}

const security = evidence.security;
for (const auditName of ["productionDependencyAudit", "fullDependencyAudit"]) {
  const audit = security.checks?.[auditName];
  assert(audit?.status === "passed" && audit.vulnerabilities?.total === 0,
    `${auditName} must report zero vulnerabilities.`);
}
assert(security.patchedPackages?.next === "16.4.5"
  && security.patchedPackages?.zod === "4.6.7"
  && security.patchedPackages?.sharp === "0.35.5"
  && security.patchedPackages?.sourceMapJs === "1.2.2",
  "the security receipt must bind the patched runtime package versions.");

const engineering = evidence.engineering;
assert(engineering.source?.branch === branch, "engineering evidence must describe the flight branch.");
assert(engineering.checks?.launchEvidenceAudit?.status === "passed",
  "the engineering launch-evidence audit must pass.");
assert(engineering.checks?.fullVitestSuite?.status === "passed"
  && engineering.checks.fullVitestSuite.testFilesPassed === 463
  && engineering.checks.fullVitestSuite.testsPassed === 2979,
  "the full regression suite must pass with the recorded scope.");
assert(engineering.checks?.eslint?.status === "passed"
  && engineering.checks?.typescript?.status === "passed"
  && engineering.checks?.productionBuild?.status === "passed",
  "lint, TypeScript, and production build must pass.");
for (const key of ["consumerReleaseAuthorized", "productionProviderTrafficEnabled", "bookingEnabled", "paymentEnabled", "ticketingEnabled"]) {
  assertClosed(engineering.authorityBoundary?.[key], `engineering.authorityBoundary.${key}`);
}

const preview = evidence.preview;
assert(preview.source?.branch === branch, "Preview evidence must describe the flight branch.");
assert(preview.deployment?.state === "READY"
  && preview.deployment.target === "preview"
  && preview.deployment.sourceBranch === branch,
  "the current Preview deployment must be READY and branch-bound.");
assert(preview.browserSmoke?.surface === "supplier_offline_planning_preview"
  && preview.browserSmoke?.liveInventoryDisplayed === false
  && preview.browserSmoke?.providerRequestDispatched === false
  && preview.browserSmoke?.paymentCreated === false
  && preview.browserSmoke?.bookingCreated === false
  && preview.browserSmoke?.ticketIssued === false,
  "the current Preview smoke must remain supplier-offline and side-effect free.");
assert(preview.adminAuthBoundary?.loginSurfaceObserved === true,
  "the Preview admin flight surface must remain behind sign-in.");
for (const key of ["consumerReleaseAuthorized", "productionProviderTrafficEnabled", "bookingEnabled", "paymentEnabled", "ticketingEnabled"]) {
  assertClosed(preview.authorityBoundary?.[key], `preview.authorityBoundary.${key}`);
}

const canonical = evidence.canonical;
assert(canonical.surface?.url === "https://www.iratepilot.com/flights"
  && canonical.surface?.surface === "supplier_offline_planning_preview"
  && canonical.surface?.liveInventoryDisplayed === false
  && canonical.surface?.providerRequestDispatched === false
  && canonical.surface?.paymentCreated === false
  && canonical.surface?.bookingCreated === false
  && canonical.surface?.ticketIssued === false
  && Array.isArray(canonical.surface?.consoleWarningsAndErrors)
  && canonical.surface.consoleWarningsAndErrors.length === 0,
  "the canonical Production smoke must remain supplier-offline and clean.");
for (const key of ["consumerReleaseAuthorized", "productionProviderTrafficEnabled", "bookingEnabled", "paymentEnabled", "ticketingEnabled"]) {
  assertClosed(canonical.authorityBoundary?.[key], `canonical.authorityBoundary.${key}`);
}

const completion = evidence.completion;
assert(completion.source?.branch === branch, "completion audit must describe the flight branch.");
assert(Array.isArray(completion.requirements) && completion.requirements.length === 10,
  "completion audit must classify all ten launch requirements.");
for (const requirement of completion.requirements) {
  assert(requirement.authorityEnabled === false,
    `completion audit requirement ${requirement.id} cannot enable authority.`);
  if (["engineering_foundation", "preview_verification", "offline_operational_controls", "dependency_security"].includes(requirement.id)) {
    assert(requirement.state === "complete", `internal requirement ${requirement.id} must be complete.`);
  } else if (requirement.id === "production_deployment_verification") {
    assert(["complete", "complete_prior_recheck"].includes(requirement.state),
      "production deployment verification must retain a verified state.");
  } else if (requirement.id === "consumer_release_activation") {
    assert(requirement.state === "blocked_by_prerequisites",
      "consumer release activation must remain blocked by prerequisites.");
  } else {
    assert(requirement.state === "pending_external",
      `external requirement ${requirement.id} must remain pending external evidence.`);
  }
}
assert(completion.summary?.internalRequirementsComplete === 4
  && completion.summary?.externalGateGroupsRemaining === 5,
  "completion audit must retain four complete internal requirements and five external gate groups.");
for (const key of ["consumerReleaseAuthorized", "productionProviderTrafficEnabled", "bookingEnabled", "paymentEnabled", "ticketingEnabled"]) {
  assertClosed(completion.summary?.[key], `completion.summary.${key}`);
}
assert(completion.duffelSupport?.responseReceived === false,
  "the audit must not infer a Duffel response.");

const result = {
  version: "flight-launch-evidence-audit-v1",
  status: "pass",
  sanitized: true,
  candidateConnectors: catalog.totalConnectors,
  routePackets: manifest.routePackets.length,
  consumerReleaseAuthorized: false,
  providerTrafficEnabled: false,
  bookingEnabled: false,
  paymentEnabled: false,
  monitoringCollectorAssembly: completion.requirements.some((item) => item.id === "offline_operational_controls" && item.state === "complete"),
  productionSourceIsFlightBranch: true,
  latestPreviewRecheck: true,
  currentPreviewDeploymentRecheck: true,
  completionAudit: true,
  duffelResponseReceived: false,
};
process.stdout.write(`${JSON.stringify(result)}\n`);
