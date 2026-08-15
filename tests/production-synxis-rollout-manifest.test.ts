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
  it("records every repository migration exactly once while migration 060 remains pending", () => {
    expect(manifest.historyRepairCandidates).toEqual(migrationVersions.slice(0, 49));
    const deploymentVersions = [
      ...manifest.appliedDeploymentVersions,
      ...manifest.pendingDeploymentVersions,
    ];
    expect([...deploymentVersions].sort()).toEqual(migrationVersions.slice(49));
    expect(new Set(deploymentVersions).size).toBe(deploymentVersions.length);
    expect(manifest.historyRepairCandidates.at(-1)).toBe("202608130038");
    expect(manifest.appliedDeploymentVersions[0]).toBe("202608130039");
    expect(manifest.appliedDeploymentVersions).toEqual([
      ...migrationVersions.slice(49, -2),
      "202608150061",
    ]);
    expect(manifest.pendingDeploymentVersions).toEqual(["202608150060"]);
  });

  it("records completed database rollout while preserving later launch gates", () => {
    expect(manifest.executionState).toBe(
      "migrations_001_059_and_061_applied_060_preview_only_manager_acceptance_incomplete_synxis_traffic_disabled",
    );
    expect(manifest.requiredWriteGates.join(" ").toLowerCase()).toContain("sabre certification");
    expect(manifest.requiredWriteGates.join(" ").toLowerCase()).not.toContain("migration 054");
    expect(manifest.requiredWriteGates.join(" ").toLowerCase()).not.toContain("migration 055");
    expect(manifest.requiredWriteGates.join(" ").toLowerCase()).not.toContain("migration 057");
    expect(manifest.requiredWriteGates.join(" ").toLowerCase()).not.toContain("migration 058");
    expect(manifest.requiredWriteGates.join(" ").toLowerCase()).not.toContain("migration 059");
    expect(manifest.requiredWriteGates.join(" ").toLowerCase()).toContain("migration 060");
    expect(manifest.requiredWriteGates.join(" ").toLowerCase()).not.toContain("migration 061");
    expect(manifest.requiredWriteGates.join(" ").toLowerCase()).toContain("before any application deployment, manager invitation, or manager activation");
    expect(manifest.requiredWriteGates.join(" ").toLowerCase()).toContain("live-traffic approval");
    expect(manifest.stopConditions.length).toBeGreaterThan(0);
    expect(manifest.stopConditions.join(" ")).toContain("039-through-059 or 061");
    expect(manifest.stopConditions.join(" ")).toContain("before production migration 060 is applied and verified");
  });

  it("contains no credential-shaped fields", () => {
    const serialized = JSON.stringify(manifest).toLowerCase();
    for (const forbidden of ["password", "secret", "api_key", "access_token"]) {
      expect(serialized).not.toContain(forbidden);
    }
  });
});
