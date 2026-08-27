import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const sqlPath =
  "scripts/flight-consumer-production-data-plane-catalog-observation.sql";
const evidencePath =
  "docs/evidence/FLIGHT_CONSUMER_PRODUCTION_DATA_PLANE_CATALOG_OBSERVATION_2026-08-27.json";

const sql = readFileSync(sqlPath, "utf8");
const identitySqlPath =
  "scripts/flight-consumer-production-identity-anchor-observation.sql";
const identitySql = readFileSync(identitySqlPath, "utf8");
const evidence = JSON.parse(readFileSync(evidencePath, "utf8")).evidence;

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

describe("Flight Consumer Production data-plane catalog evidence", () => {
  it("pins the exact bounded read-only query", () => {
    expect(evidence.observationArtifact).toEqual({
      path: sqlPath,
      sha256: sha256(sql),
    });
    expect(sql).toContain("begin read only;");
    expect(sql).toContain("commit;");
    expect(sql).toContain("allliumarkejinplrggl");
    expect(sql).toContain("202608230068");
    expect(sql).toContain("202608260138");
    expect(sql).not.toMatch(
      /\b(?:insert|update|delete|merge|create|alter|drop|truncate|grant|revoke)\b\s+/i,
    );
  });

  it("records the exact managed Production result without overstating readiness", () => {
    expect(evidence).toMatchObject({
      environment: "managed_supabase_consumer_production_read_only",
      result: "PASS",
      target: {
        projectRef: "allliumarkejinplrggl",
        dashboardBranchLabel: "Production",
        postgresServerVersionNum: 170006,
      },
      observedRelations: [
        "flight_consumer_live_duffel_shopping_attempts",
        "flight_consumer_live_duffel_webhook_inbox",
        "flight_consumer_live_stripe_payment_intent_plans",
      ],
      observedLedgerVersionsBetween202608230068And202608260138: [],
      identityObservation: {
        artifact: {
          path: identitySqlPath,
          sha256: sha256(identitySql),
        },
        profilesRelation: "profiles",
        profilesIdType: "uuid",
        profilesIdNotNull: true,
        profilesIdUniqueConstraint: true,
        writesPerformed: false,
      },
      interpretation: {
        consumerCheckoutAggregatePresent: false,
        travelerDataPlanePresent: false,
        durableLiveOfferRefreshPresent: false,
        durableLiveStripeExecutionPresent: false,
        durableLiveOrderAndTicketFinalizerPresent: false,
        productionTransactionAcceptanceReady: false,
      },
      disposition: {
        productionDatabaseReadPerformed: true,
        productionDatabaseWritesPerformed: false,
        migrationLedgerMutationPerformed: false,
        providerRequestPerformed: false,
        stripeRequestPerformed: false,
        paymentPerformed: false,
        bookingPerformed: false,
        ticketingPerformed: false,
        deploymentChanged: false,
        publicReleaseChanged: false,
      },
    });
  });

  it("pins the exact read-only identity-anchor observation", () => {
    expect(identitySql).toContain("set transaction read only;");
    expect(identitySql).toContain("to_regclass('public.profiles')");
    expect(identitySql).toContain("format_type(a.atttypid, a.atttypmod)");
    expect(identitySql).toContain("c.contype in ('p', 'u')");
    expect(identitySql).toContain("c.conkey = array[a.attnum]::smallint[]");
    expect(identitySql).toContain("commit;");
    expect(identitySql).not.toMatch(
      /\b(?:insert|update|delete|merge|create|alter|drop|truncate|grant|revoke)\b\s+/i,
    );
  });
});
