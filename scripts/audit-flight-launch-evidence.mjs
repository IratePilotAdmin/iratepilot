import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const files = {
  checkpoint: "docs/evidence/FLIGHT_LAUNCH_PROGRESS_CHECKPOINT_2026-09-23.json",
  matrix: "docs/evidence/FLIGHT_RELEASE_GATE_MATRIX_2026-09-18.json",
  manifest: "docs/evidence/FLIGHT_CONNECTOR_ROUTE_PACKET_MANIFEST_2026-09-23.json",
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

assert(checkpoint.source?.branch === "agent/flight-live-foundation-20260823",
  "the checkpoint must describe the flight foundation branch.");
assert(checkpoint.routePacketManifest === files.manifest,
  "the checkpoint must bind the route-packet manifest path.");
assert(matrix.routePacketManifest === files.manifest,
  "the release matrix must bind the route-packet manifest path.");

for (const [name, item] of Object.entries(loaded)) {
  assert(item.value?.evidence?.sanitized === true, `${name} must be marked sanitized.`);
  assert(item.value?.evidence?.secretValuesIncluded === false, `${name} must not include secret values.`);
}

const rawEvidence = Object.values(loaded).map(({ raw }) => raw).join("\n");
assert(!/(?:duffel_(?:live|test)_[A-Za-z0-9_-]{16,}|(?:sk|rk)_(?:live|test)_[A-Za-z0-9_-]{16,}|whsec_[A-Za-z0-9_-]{16,})/.test(rawEvidence),
  "secret-shaped credential material is present in evidence.");

const catalog = manifest.candidateCatalog;
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
assert(matrix.latestReadOnlyVerification.flightBranchIsProductionSource === false,
  "Production must not currently point at the flight branch.");
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

for (const [label, value] of Object.entries(checkpoint.authorityBoundary)) {
  assertClosed(value, `checkpoint.authorityBoundary.${label}`);
}

const latestVercelCheck = checkpoint.vercelDeploymentRecheck.latestVercelReadOnlyCheck;
assert(latestVercelCheck.flightBranchIsProductionSource === false,
  "the latest Vercel check must keep the flight branch out of Production.");
assert(latestVercelCheck.credentialDigestVariablePresentInProduction === true,
  "the latest Vercel check must record the Production digest variable.");
assert(latestVercelCheck.credentialValueRead === false,
  "the latest Vercel check must not read the credential value.");
assert(latestVercelCheck.redeployTriggered === false,
  "the evidence audit must not record a redeploy.");
assert(latestVercelCheck.providerTrafficTriggered === false,
  "the evidence audit must not record provider traffic.");

const latestPreviewCheck = checkpoint.localVerification.latestBrowserReadOnlyCheck;
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
  productionSourceIsFlightBranch: false,
  duffelResponseReceived: false,
};
process.stdout.write(`${JSON.stringify(result)}\n`);
