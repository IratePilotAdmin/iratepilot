import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const files = {
  checkpoint: "docs/evidence/FLIGHT_LAUNCH_PROGRESS_CHECKPOINT_2026-09-23.json",
  matrix: "docs/evidence/FLIGHT_RELEASE_GATE_MATRIX_2026-09-18.json",
  manifest: "docs/evidence/FLIGHT_CONNECTOR_ROUTE_PACKET_MANIFEST_2026-09-23.json",
  securityScan: "docs/evidence/FLIGHT_SECURITY_SCAN_2026-09-23.json",
  previewRecheck: "docs/evidence/FLIGHT_PREVIEW_DEPLOYMENT_RECHECK_2026-09-23.json",
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
const checkpoint = loaded.checkpoint.value.evidence;
const matrix = loaded.matrix.value.evidence;
const manifest = loaded.manifest.value.evidence;
const previewRecheck = loaded.previewRecheck.value.evidence;

assert(checkpoint.source?.branch === "agent/flight-live-foundation-20260823",
  "the checkpoint must describe the flight foundation branch.");
assert(checkpoint.routePacketManifest === files.manifest,
  "the checkpoint must bind the route-packet manifest path.");
assert(matrix.routePacketManifest === files.manifest,
  "the release matrix must bind the route-packet manifest path.");

for (const [name, item] of Object.entries(loaded)) {
  assert(item.value?.evidence?.sanitized === true, `${name} must be marked sanitized.`);
  assert(item.value?.evidence?.secretValuesIncluded === false
    || item.value?.evidence?.rawCredentialValuesIncluded === false,
  `${name} must not include secret values.`);
}

const rawEvidence = Object.values(loaded).map(({ raw }) => raw).join("\n");
assert(!/(?:duffel_(?:live|test)_[A-Za-z0-9_-]{16,}|(?:sk|rk)_(?:live|test)_[A-Za-z0-9_-]{16,}|whsec_[A-Za-z0-9_-]{16,})/.test(rawEvidence),
  "secret-shaped credential material is present in evidence.");

const catalog = manifest.candidateCatalog;
const dependencyAudit = loaded.securityScan.value.evidence.results?.dependencyAudit;
assert(dependencyAudit?.status === "passed"
  && dependencyAudit.nextVersion === "16.3.6"
  && dependencyAudit.sharpVersion === "0.35.4"
  && dependencyAudit.highVulnerabilities === 0
  && dependencyAudit.criticalVulnerabilities === 0,
"the dependency security audit must be clean on patched Next.js and Sharp versions.");
assert(catalog.totalConnectors === 9, "the candidate catalog must contain nine connectors.");
assert(catalog.connectors.length === catalog.totalConnectors, "candidate connector count is inconsistent.");
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
assert(manifest.sourceCommit === checkpoint.source.commit,
  "the route-packet manifest must bind the checkpoint source commit.");
assert(!manifest.externalBlockers.some((blocker) => blocker.includes("current Production still serves a different branch")),
  "the route-packet manifest must not retain the retired Production-branch blocker.");
for (const [label, value] of Object.entries(manifest.routeDecision)) {
  if (label.endsWith("Authorized") || label === "operationalRouteEnabled") {
    assertClosed(value, `routeDecision.${label}`);
  }
}

assert(manifest.routePackets.length === 2, "exactly two selected route packets are required.");
for (const packet of manifest.routePackets) {
  for (const key of [
    "contractAuthority",
    "contractEvidence",
    "sandboxCredentials",
    "sandboxCertification",
    "paymentSettlement",
    "securityPrivacy",
    "supportRelease",
    "previewRelease",
    "productionRelease",
    "consumerActivation",
  ]) assertZeroGate(packet[key], `${packet.connector}.${key}`);
  for (const key of [
    "externalNetworkAccess",
    "bookingAuthorized",
    "ticketingAuthorized",
    "paymentAuthorized",
  ]) assertClosed(packet[key], `${packet.connector}.${key}`);
}

for (const [label, value] of Object.entries(matrix.boundary)) {
  assertClosed(value, `matrix.boundary.${label}`);
}
assert(matrix.latestReadOnlyVerification.flightBranchIsProductionSource === true,
  "Production must point at the reviewed flight branch.");
assert(matrix.latestReadOnlyVerification.providerRequestDispatched === false,
  "the latest read-only check must not dispatch a provider request.");
assert(matrix.latestReadOnlyVerification.duffelResponseReceived === false,
  "the audit must not infer a Duffel response.");
assert(checkpoint.duffelApprovalFollowUp.responseReceived === false,
  "the checkpoint must not infer a Duffel response.");
assert(checkpoint.duffelApprovalFollowUp.browserThreadRecheck.replyOrForwardSent === false,
  "the audit must not infer a follow-up reply or forward.");
assert(checkpoint.duffelApprovalFollowUp.credentialsIncluded === false,
  "the follow-up evidence must not include credentials.");
assert(checkpoint.duffelApprovalFollowUp.passengerDataIncluded === false,
  "the follow-up evidence must not include passenger data.");

const latestDuffelDocumentationCheck = checkpoint.localVerification.latestDuffelDocumentationCheck;
assert(latestDuffelDocumentationCheck.url === "https://duffel.com/guides/getting-started",
  "the latest Duffel documentation check must bind the getting-started guide.");
for (const key of [
  "accountMutationPerformed",
  "credentialCreated",
  "balanceTopUpPerformed",
  "providerRequestsPerformed",
  "ordersPerformed",
  "paymentsPerformed",
  "ticketsIssued",
]) assertClosed(latestDuffelDocumentationCheck[key], `latestDuffelDocumentationCheck.${key}`);

const latestDuffelDashboardCheck = checkpoint.localVerification.latestDuffelDashboardCheck;
assert(latestDuffelDashboardCheck.url === "https://app.duffel.com/d111b340aac32fc8a5aa178/live",
  "the latest Duffel dashboard check must bind the live dashboard URL.");
assert(latestDuffelDashboardCheck.observedMode === "test",
  "the latest Duffel dashboard check must preserve the observed Test mode state.");
for (const key of [
  "liveModeSelected",
  "accountMutationPerformed",
  "providerRequestsPerformed",
  "ordersPerformed",
  "paymentsPerformed",
  "ticketsIssued",
]) assertClosed(latestDuffelDashboardCheck[key], `latestDuffelDashboardCheck.${key}`);

const latestControlledLiveSearchSafetyTest = checkpoint.localVerification.latestControlledLiveSearchSafetyTest;
assert(latestControlledLiveSearchSafetyTest.status === "passed"
  && latestControlledLiveSearchSafetyTest.testFilesPassed === 7
  && latestControlledLiveSearchSafetyTest.testsPassed === 75,
  "the controlled live-search safety test must pass with the recorded scope.");
for (const key of [
  "providerRequestsPerformed",
  "ordersPerformed",
  "paymentsPerformed",
  "ticketsIssued",
]) assertClosed(latestControlledLiveSearchSafetyTest[key], `latestControlledLiveSearchSafetyTest.${key}`);

const latestVercelPreviewEnvironmentCheck = checkpoint.localVerification.latestVercelPreviewEnvironmentCheck;
assert(latestVercelPreviewEnvironmentCheck.selectedEnvironment === "Preview"
  && latestVercelPreviewEnvironmentCheck.secretValuesRead === false
  && latestVercelPreviewEnvironmentCheck.environmentMutationPerformed === false
  && latestVercelPreviewEnvironmentCheck.deploymentTriggered === false,
  "the latest Vercel Preview environment check must remain read-only and secret-safe.");
for (const name of [
  "DUFFEL_TEST_ACCESS_TOKEN",
  "FLIGHT_CONSUMER_PREVIEW_ENABLED",
  "FLIGHT_RUNTIME_ENABLED",
  "FLIGHT_RUNTIME_ENVIRONMENT",
  "FLIGHT_RUNTIME_MODE",
  "FLIGHT_PROVIDER_TRAFFIC_ENABLED",
  "FLIGHT_BOOKING_ENABLED",
  "ENABLE_LIVE_BOOKING_PAYMENTS",
  "FLIGHT_DUFFEL_TEST_AUTHORITY_SECRET",
  "SUPABASE_SERVICE_ROLE_KEY",
]) assert(latestVercelPreviewEnvironmentCheck.observedVariableNames.includes(name),
  `the Vercel Preview check must observe ${name}.`);
assert(latestVercelPreviewEnvironmentCheck.observedControlValues.FLIGHT_PROVIDER_TRAFFIC_ENABLED === "true",
  "Preview provider traffic must be enabled only for the sandbox route.");
assert(latestVercelPreviewEnvironmentCheck.observedControlValues.FLIGHT_BOOKING_ENABLED === "true",
  "Preview booking control must be enabled for the sandbox route.");
assert(latestVercelPreviewEnvironmentCheck.observedControlValues.ENABLE_LIVE_BOOKING_PAYMENTS === "false",
  "Preview live-money booking payments must remain disabled.");
for (const key of [
  "providerRequestsPerformed",
  "ordersPerformed",
  "paymentsPerformed",
  "ticketsIssued",
]) assertClosed(latestVercelPreviewEnvironmentCheck[key], `latestVercelPreviewEnvironmentCheck.${key}`);

const latestPreviewAuthBoundaryCheck = checkpoint.localVerification.latestPreviewAuthBoundaryCheck;
assert(latestPreviewAuthBoundaryCheck.path === "/admin/flights"
  && latestPreviewAuthBoundaryCheck.loginSurfaceObserved === true
  && latestPreviewAuthBoundaryCheck.finalUrl?.includes("/login?next=%2Fadmin%2Fflights"),
"the Preview admin flight surface must remain behind the application sign-in boundary.");
for (const key of [
  "providerRequestsPerformed",
  "ordersPerformed",
  "paymentsPerformed",
  "ticketsIssued",
]) assertClosed(latestPreviewAuthBoundaryCheck[key], `latestPreviewAuthBoundaryCheck.${key}`);

for (const [label, value] of Object.entries(checkpoint.authorityBoundary)) {
  assertClosed(value, `checkpoint.authorityBoundary.${label}`);
}

const requiredExternalGateFragments = [
  "Duffel contract",
  "Duffel commercial/content/ticketing authority",
  "Stripe, settlement, reconciliation, fraud/refund",
  "named support/on-call ownership",
  "DNS/email sender authentication",
];
for (const fragment of requiredExternalGateFragments) {
  assert(checkpoint.remainingExternalGates.some((gate) => gate.includes(fragment)),
    `the remaining external-gate list must retain ${fragment}.`);
}

const latestVercelCheck = checkpoint.vercelDeploymentRecheck.latestVercelReadOnlyCheck;
assert(latestVercelCheck.flightBranchIsProductionSource === true,
  "the latest Vercel check must bind Production to the reviewed flight branch.");
assert(latestVercelCheck.credentialDigestVariablePresentInProduction === true,
  "the latest Vercel check must record the Production digest variable.");
assert(latestVercelCheck.credentialValueRead === false,
  "the latest Vercel check must not read the credential value.");
assert(latestVercelCheck.redeployTriggered === true,
  "the evidence audit must record the reviewed flight deployment promotion.");
assert(latestVercelCheck.providerTrafficTriggered === false,
  "the evidence audit must not record provider traffic.");

const latestPreviewCheck = checkpoint.localVerification.latestBrowserReadOnlyCheck;
assert(latestPreviewCheck.previewDeploymentState === "READY",
  "the latest Preview deployment must be READY.");
assert(latestPreviewCheck.previewSourceBranch === "agent/flight-live-foundation-20260823",
  "the latest Preview deployment must come from the flight branch.");
assert(typeof latestPreviewCheck.previewSourceCommit === "string"
  && latestPreviewCheck.previewSourceCommit.startsWith(checkpoint.source.commit),
"the latest Preview deployment must bind the checkpoint's verified flight commit.");
assert(latestPreviewCheck.liveInventoryDisplayed === false,
  "the latest Preview check must not display live inventory.");
assert(latestPreviewCheck.providerRequestDispatched === false,
  "the latest Preview check must not dispatch a provider request.");
assert(latestPreviewCheck.paymentCreated === false,
  "the latest Preview check must not create payment.");
assert(latestPreviewCheck.bookingCreated === false,
  "the latest Preview check must not create booking.");
assert(latestPreviewCheck.ticketIssued === false,
  "the latest Preview check must not issue a ticket.");

assert(previewRecheck.source?.branch === "agent/flight-live-foundation-20260823",
  "the Preview recheck must describe the flight foundation branch.");
assert(previewRecheck.source?.commit === "9756fee",
  "the Preview recheck must bind the latest evidence commit.");
assert(previewRecheck.deployment?.state === "READY"
  && previewRecheck.deployment?.target === "preview"
  && previewRecheck.deployment?.sourceBranch === previewRecheck.source.branch
  && previewRecheck.deployment?.sourceCommit?.startsWith(previewRecheck.source.commit),
"the latest evidence commit must have a READY Preview deployment bound to it.");
assert(previewRecheck.browserSmoke?.surface === "supplier_offline_planning_preview",
  "the latest Preview recheck must remain supplier-offline.");
for (const key of [
  "liveInventoryDisplayed",
  "providerRequestDispatched",
  "paymentCreated",
  "bookingCreated",
  "ticketIssued",
]) assertClosed(previewRecheck.browserSmoke?.[key], `previewRecheck.browserSmoke.${key}`);
for (const key of [
  "consumerReleaseEnabled",
  "productionProviderTrafficEnabled",
  "bookingEnabled",
  "paymentEnabled",
  "ticketingEnabled",
]) assertClosed(previewRecheck.authorityBoundary?.[key], `previewRecheck.authorityBoundary.${key}`);

const latestCanonicalSurfaceCheck = checkpoint.localVerification.latestCanonicalProductionSurfaceCheck;
assert(latestCanonicalSurfaceCheck.surface === "supplier_offline_planning_preview",
  "the canonical Production flight surface must remain supplier-offline.");
assert(latestCanonicalSurfaceCheck.liveInventoryDisplayed === false,
  "the canonical Production flight surface must not display live inventory.");
assert(latestCanonicalSurfaceCheck.providerRequestDispatched === false,
  "the canonical Production flight surface must not dispatch a provider request.");
assert(latestCanonicalSurfaceCheck.paymentCreated === false,
  "the canonical Production flight surface must not create payment.");
assert(latestCanonicalSurfaceCheck.bookingCreated === false,
  "the canonical Production flight surface must not create booking.");
assert(latestCanonicalSurfaceCheck.ticketIssued === false,
  "the canonical Production flight surface must not issue a ticket.");

const latestBuildCheck = checkpoint.localVerification.latestProductionBuildCheck;
assert(latestBuildCheck.status === "passed",
  "the latest local Production build must pass.");
assert(Number.isInteger(latestBuildCheck.staticPagesGenerated)
  && latestBuildCheck.staticPagesGenerated > 0,
"the latest local Production build must record generated pages.");
assert(latestBuildCheck.sourceCommit === checkpoint.source.commit,
  "the latest local Production build must bind the checkpoint source commit.");

const latestInternalRecheck = checkpoint.localVerification.latestInternalRecheck;
assert(latestInternalRecheck.command === "vitest run --reporter=dot"
  && latestInternalRecheck.fullVitestSuite?.status === "passed"
  && Number.isInteger(latestInternalRecheck.fullVitestSuite.filesPassed)
  && latestInternalRecheck.fullVitestSuite.filesPassed >= 462
  && Number.isInteger(latestInternalRecheck.fullVitestSuite.testsPassed)
  && latestInternalRecheck.fullVitestSuite.testsPassed >= 2974,
"the latest full regression checkpoint must record the current passing suite.");
for (const key of [
  "providerRequestsPerformed",
  "ordersPerformed",
  "paymentsPerformed",
  "ticketsIssued",
]) assertClosed(latestInternalRecheck[key], `latestInternalRecheck.${key}`);

const latestStaticChecks = checkpoint.localVerification.latestStaticChecks;
assert(latestStaticChecks.eslint === "passed",
  "the latest ESLint check must pass.");
assert(latestStaticChecks.typescriptNoEmit === "passed",
  "the latest TypeScript check must pass.");

const latestRunbookIntegrity = checkpoint.localVerification.latestOperationsRunbookIntegrityTest;
assert(latestRunbookIntegrity.status === "passed"
  && latestRunbookIntegrity.testFilesPassed === 2
  && latestRunbookIntegrity.testsPassed === 3,
"the latest operations runbook integrity check must pass.");

const latestCollectorAssembly = checkpoint.localVerification.latestOperationsCollectorAssemblyTest;
assert(latestCollectorAssembly.status === "passed"
  && latestCollectorAssembly.testFilesPassed >= 3
  && latestCollectorAssembly.testsPassed >= 21,
"the latest operations collector assembly check must pass.");

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
  monitoringCollectorAssembly: true,
  productionSourceIsFlightBranch: true,
  latestPreviewRecheck: true,
  duffelResponseReceived: false,
};
process.stdout.write(`${JSON.stringify(result)}\n`);
