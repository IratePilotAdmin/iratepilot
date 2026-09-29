import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

type RolloutManifest = {
  executionState: string;
  historyRepairCandidates: string[];
  appliedDeploymentVersions: string[];
  pendingDeploymentVersions: string[];
  requiredWriteGates: string[];
  stopConditions: string[];
};

const manifest = JSON.parse(
  readFileSync(
    new URL("../supabase/production_synxis_rollout_manifest.json", import.meta.url),
    "utf8",
  ),
) as RolloutManifest;

const migrationVersions = readdirSync(
  new URL("../supabase/migrations", import.meta.url),
)
  .filter((name) => name.endsWith(".sql"))
  .sort()
  .map((name) => name.split("_")[0]);

describe("SynXis production rollout manifest", () => {
  it("records every in-scope SynXis migration exactly once while excluding later flight migrations", () => {
    const rolloutCutoff = "202608170067";
    const rolloutMigrationVersions = migrationVersions.filter((version) => version <= rolloutCutoff);
    const deploymentStart = migrationVersions.indexOf("202608130039");
    expect(deploymentStart).toBeGreaterThan(0);
    expect(manifest.historyRepairCandidates).toEqual(rolloutMigrationVersions.slice(0, deploymentStart));
    const deploymentVersions = [
      ...manifest.appliedDeploymentVersions,
      ...manifest.pendingDeploymentVersions,
    ];
    const synxisDeploymentVersions = deploymentVersions.filter((version) => version <= rolloutCutoff);
    expect([...synxisDeploymentVersions].sort()).toEqual(rolloutMigrationVersions.slice(deploymentStart));
    expect(new Set(deploymentVersions).size).toBe(deploymentVersions.length);
    expect(manifest.historyRepairCandidates.at(-1)).toBe("202608130038");
    expect(manifest.appliedDeploymentVersions[0]).toBe("202608130039");
    expect(
      manifest.appliedDeploymentVersions.filter((version) => version <= rolloutCutoff),
    ).toEqual(rolloutMigrationVersions.slice(deploymentStart, -6));
    expect(manifest.pendingDeploymentVersions).toEqual(rolloutMigrationVersions.slice(-6));
    expect(manifest.pendingDeploymentVersions.at(-1)).toBe(rolloutCutoff);
    expect(manifest.appliedDeploymentVersions).toContain("202609270159");
    expect(deploymentVersions).not.toContain("202608230068");
    expect(deploymentVersions).not.toContain("202608240069");
  });

  it("records completed database rollout while preserving later launch gates", () => {
    expect(manifest.executionState).toBe(
      "migrations_through_159_applied_application_deployment_pending_manager_acceptance_incomplete_synxis_traffic_disabled",
    );
    expect(manifest.requiredWriteGates.join(" ").toLowerCase()).toContain("sabre certification");
    expect(manifest.requiredWriteGates.join(" ").toLowerCase()).not.toContain("migration 054");
    expect(manifest.requiredWriteGates.join(" ").toLowerCase()).not.toContain("migration 055");
    expect(manifest.requiredWriteGates.join(" ").toLowerCase()).not.toContain("migration 057");
    expect(manifest.requiredWriteGates.join(" ").toLowerCase()).not.toContain("migration 058");
    expect(manifest.requiredWriteGates.join(" ").toLowerCase()).not.toContain("migration 059");
    expect(manifest.requiredWriteGates.join(" ").toLowerCase()).not.toContain("migration 060");
    expect(manifest.requiredWriteGates.join(" ").toLowerCase()).not.toContain("migration 061");
    expect(manifest.requiredWriteGates.join(" ").toLowerCase()).toContain("merge pr #279");
    expect(manifest.requiredWriteGates.join(" ").toLowerCase()).toContain("application deployment");
    expect(manifest.requiredWriteGates.join(" ").toLowerCase()).toContain("manager invitation");
    expect(manifest.requiredWriteGates.join(" ").toLowerCase()).toContain("live-traffic approval");
    expect(manifest.requiredWriteGates.join(" ")).toContain("verified migration 202609270159");
    expect(manifest.stopConditions.length).toBeGreaterThan(0);
    expect(manifest.stopConditions.join(" ")).toContain("039-through-061");
    expect(manifest.stopConditions.join(" ").toLowerCase()).toContain("merged or the application is deployed without separate production approval");
    expect(manifest.stopConditions.join(" ").toLowerCase()).toContain("before the verified application deployment");
  });

  it("contains no credential-shaped fields", () => {
    const serialized = JSON.stringify(manifest).toLowerCase();
    for (const forbidden of ["password", "secret", "api_key", "access_token"]) {
      expect(serialized).not.toContain(forbidden);
    }
  });
});
