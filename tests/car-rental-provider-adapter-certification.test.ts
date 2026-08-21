import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildCarRentalProviderAdapterPlan,
  CAR_RENTAL_PROVIDER_ADAPTER_CERTIFICATION_MODE,
  carRentalAdapterOperationKinds,
  carRentalAdapterProhibitedFields,
  carRentalAdapterRecordedFields,
  carRentalAdapterScopeLabels,
  carRentalProviderAdapterContracts,
  carRentalProviderAdapterFixtures,
  carRentalProviderAdapterGates,
  validateCarRentalAdapterCertificationRecord,
  type CarRentalCanonicalAdapterCertificationRecord,
} from "../lib/cars/provider-adapter-certification";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const [availabilityFixture, reservationFixture, webhookFixture] = carRentalProviderAdapterFixtures;

function cloneRecord(record: CarRentalCanonicalAdapterCertificationRecord): CarRentalCanonicalAdapterCertificationRecord {
  return structuredClone(record);
}

describe("car-rental provider adapter and sandbox certification phase 10", () => {
  it("starts with every review gate incomplete and every external authority disabled", () => {
    const plan = buildCarRentalProviderAdapterPlan();
    expect(plan).toMatchObject({
      mode: "provider_adapter_certification_offline_only",
      completedCount: 0,
      totalCount: 12,
      contractReviewComplete: false,
      supplierResearchAuthorized: false,
      supplierContactAuthorized: false,
      providerSelected: false,
      providerMappingCreated: false,
      accountCreationAuthorized: false,
      credentialRequestAuthorized: false,
      credentialAcceptanceAuthorized: false,
      credentialMaterialPresent: false,
      sandboxConnectionAuthorized: false,
      sandboxCertified: false,
      externalTrafficAuthorized: false,
      productionTrafficAuthorized: false,
      webhookReceiverAuthorized: false,
      reservationMutationAuthorized: false,
      refundExecutionAuthorized: false,
      paymentAuthorized: false,
    });
    expect(plan.gates.every((gate) => !gate.complete)).toBe(true);
  });

  it("never converts a completed contract review into credentials, sandbox certification, traffic, reservations, refunds, or payments", () => {
    const allEvidence = Object.fromEntries(carRentalProviderAdapterGates.map((gate) => [gate.id, true]));
    const plan = buildCarRentalProviderAdapterPlan(allEvidence);
    expect(plan.contractReviewComplete).toBe(true);
    expect(plan.completedCount).toBe(plan.totalCount);
    expect(plan.credentialAcceptanceAuthorized).toBe(false);
    expect(plan.sandboxConnectionAuthorized).toBe(false);
    expect(plan.sandboxCertified).toBe(false);
    expect(plan.externalTrafficAuthorized).toBe(false);
    expect(plan.reservationMutationAuthorized).toBe(false);
    expect(plan.refundExecutionAuthorized).toBe(false);
    expect(plan.paymentAuthorized).toBe(false);
  });

  it("covers all Phase 10 roadmap areas with controlled operations, scopes, and minimized fields", () => {
    expect(CAR_RENTAL_PROVIDER_ADAPTER_CERTIFICATION_MODE).toBe("provider_adapter_certification_offline_only");
    expect(carRentalProviderAdapterContracts.map((contract) => contract.id)).toEqual([
      "adapter_identity",
      "operation_allowlist",
      "credential_scope",
      "idempotency",
      "retry_policy",
      "timeout_policy",
      "webhook_integrity",
      "audit_evidence",
      "dual_kill_switch",
    ]);
    expect(carRentalAdapterOperationKinds).toHaveLength(10);
    expect(carRentalAdapterScopeLabels).toContain("write_reservations_fixture");
    expect(carRentalAdapterProhibitedFields).toContain("api_key");
    expect(carRentalAdapterRecordedFields).not.toContain("api_key");
  });

  it("accepts all three sanitized offline fixtures while keeping runtime authority disabled", () => {
    for (const fixture of carRentalProviderAdapterFixtures) {
      expect(validateCarRentalAdapterCertificationRecord(fixture)).toMatchObject({
        valid: true,
        contractChecksSatisfied: true,
        supplierContactAuthorized: false,
        credentialAcceptanceAuthorized: false,
        sandboxConnectionAuthorized: false,
        sandboxCertified: false,
        externalTrafficAuthorized: false,
        productionTrafficAuthorized: false,
        webhookReceiverAuthorized: false,
        reservationMutationAuthorized: false,
        refundExecutionAuthorized: false,
        paymentAuthorized: false,
        errors: [],
      });
    }
  });

  it("requires the exact non-secret scope label for each operation", () => {
    const invalid = cloneRecord(availabilityFixture);
    invalid.scopeLabels = ["read_quotes", "read_availability"];

    expect(validateCarRentalAdapterCertificationRecord(invalid).errors).toContain("Scope labels must exactly match the selected operation's non-secret scope manifest.");
  });

  it("requires digest-only idempotency evidence only for mutation-shaped fixtures", () => {
    const missing = cloneRecord(reservationFixture);
    missing.idempotencyDigest = null;
    expect(validateCarRentalAdapterCertificationRecord(missing).errors).toContain("Mutation-shaped fixtures require a lowercase 64-character idempotency digest.");

    const excess = cloneRecord(availabilityFixture);
    excess.idempotencyDigest = "9".repeat(64);
    expect(validateCarRentalAdapterCertificationRecord(excess).errors).toContain("Read and webhook fixtures cannot contain idempotency evidence.");
  });

  it("bounds retry attempts and timeout evidence", () => {
    const invalid = cloneRecord(reservationFixture);
    invalid.attemptCount = 4;
    invalid.maxAttempts = 2;
    invalid.timeoutMs = 10_001;

    expect(validateCarRentalAdapterCertificationRecord(invalid).errors).toEqual(expect.arrayContaining([
      "Attempt count must be an integer from one through three.",
      "Attempt count cannot exceed maximum attempts.",
      "Timeout must be an integer from 250 through 10000 milliseconds.",
    ]));
  });

  it("requires retry evidence to agree with attempts and fail-closed response handling", () => {
    const invalidRetry = cloneRecord(reservationFixture);
    invalidRetry.attemptCount = 1;
    expect(validateCarRentalAdapterCertificationRecord(invalidRetry).errors).toContain("Retry-recorded evidence requires at least two attempts.");

    const invalidTimeout = cloneRecord(availabilityFixture);
    invalidTimeout.resultState = "manual_review";
    invalidTimeout.responseOutcome = "timeout";
    invalidTimeout.retryOutcome = "not_required";
    expect(validateCarRentalAdapterCertificationRecord(invalidTimeout).errors).toContain("Server-error and timeout outcomes require explicit retry, stop, or manual-review handling.");
  });

  it("keeps webhook evidence specific to the webhook-verification fixture", () => {
    const missing = cloneRecord(webhookFixture);
    missing.webhookState = "not_applicable";
    expect(validateCarRentalAdapterCertificationRecord(missing).errors).toContain("Webhook-verification fixtures require an explicit webhook state.");

    const misplaced = cloneRecord(availabilityFixture);
    misplaced.webhookState = "verified_fixture";
    expect(validateCarRentalAdapterCertificationRecord(misplaced).errors).toContain("Non-webhook fixtures must keep webhook state not applicable.");
  });

  it("requires both independent traffic kill switches to remain engaged", () => {
    const invalid = cloneRecord(availabilityFixture);
    invalid.applicationKillSwitchState = "released";
    invalid.databaseKillSwitchState = "released";

    expect(validateCarRentalAdapterCertificationRecord(invalid).errors).toEqual(expect.arrayContaining([
      "Application traffic kill switch must remain engaged.",
      "Database traffic kill switch must remain engaged.",
    ]));
  });

  it("rejects malformed identity, version, digests, fields, and prohibited-data evidence", () => {
    const invalid = cloneRecord(availabilityFixture);
    invalid.certificationCaseId = "bad";
    invalid.adapterContractId = "bad";
    invalid.adapterVersion = "v1";
    invalid.requestDigest = "ABC";
    invalid.recordedFields = [...carRentalAdapterRecordedFields, "api_key", "api_key"];
    invalid.prohibitedDataDetected = true;

    expect(validateCarRentalAdapterCertificationRecord(invalid).errors).toEqual(expect.arrayContaining([
      "Certification-case ID must be a stable opaque token.",
      "Adapter-contract ID must be a stable opaque token.",
      "Adapter version must use semantic versioning.",
      "Request evidence must be a lowercase 64-character digest.",
      "Recorded-field inventory cannot contain duplicates.",
      "Recorded-field inventory contains unsupported or prohibited fields.",
      "Recorded-field inventory must exactly match the minimized adapter-certification allowlist.",
      "Provider, endpoint, credential, payload, identity, driver, payment, location, or live-reference data blocks adapter readiness.",
    ]));
  });

  it("preserves rejected and manual-review fixture outcomes without claiming contract readiness", () => {
    const manual = cloneRecord(availabilityFixture);
    manual.resultState = "manual_review";
    manual.responseOutcome = "server_error";
    manual.retryOutcome = "manual_review";

    expect(validateCarRentalAdapterCertificationRecord(manual)).toMatchObject({ valid: true, contractChecksSatisfied: false, errors: [] });
  });

  it("reconciles Phase 9 evidence publication before Phase 10", () => {
    const evidence = read("docs/CAR_RENTALS_PHASE_9_PREVIEW_EVIDENCE_2026-08-21.md");
    const phaseNine = read("docs/CAR_RENTALS_PHASE_9.md");
    const phaseTen = read("docs/CAR_RENTALS_PHASE_10.md");
    const packageRoadmap = read("docs/CAR_RENTALS_ROADMAP.md");

    expect(evidence).toContain("088637df4ebb6ffd697048749e55a86a48d1db63");
    expect(phaseNine).toContain("evidence publication complete");
    expect(phaseTen).toContain("Provider Adapter and Sandbox Certification");
    expect(packageRoadmap).toContain("Phases 1–10 released, accepted, and documented");
    expect(packageRoadmap).toContain("Phase 11 software is verified locally with release pending");
  });

  it("keeps the administrator workspace read-only, network-free, and explicit about Phase 10", () => {
    const page = read("app/admin/cars/page.tsx");
    const roadmap = read("docs/ROADMAP.md");

    expect(page).toContain("Car Rentals · Phase 11");
    expect(page).toContain("Phase 10 provider adapter certification reference");
    expect(page).toContain("Provider adapter and sandbox certification workspace");
    expect(page).toContain("Nine provider-neutral offline adapter contracts");
    expect(page).toContain("Twelve separately owned adapter-certification gates");
    expect(page).toContain("Phase 9 operations and support reference");
    expect(page).not.toMatch(/fetch\(|createClient\(|<form|<button|use server|use client/);
    expect(roadmap).toContain("Phase 10 provider-adapter and sandbox-certification software gates");
  });
});
