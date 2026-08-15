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
  it("partitions every repository migration at the 038/039 boundary in exact order", () => {
    expect(manifest.historyRepairCandidates).toEqual(migrationVersions.slice(0, 49));
    expect([
      ...manifest.appliedDeploymentVersions,
      ...manifest.pendingDeploymentVersions,
    ]).toEqual(migrationVersions.slice(49));
    expect(manifest.historyRepairCandidates.at(-1)).toBe("202608130038");
    expect(manifest.appliedDeploymentVersions[0]).toBe("202608130039");
    expect(manifest.appliedDeploymentVersions.at(-1)).toBe("202608150058");
    expect(manifest.pendingDeploymentVersions).toEqual(["202608150059"]);
  });

  it("records completed database rollout while preserving later launch gates", () => {
    expect(manifest.executionState).toBe(
      "migrations_001_058_applied_059_pending_manager_acceptance_complete_synxis_traffic_disabled",
    );
    expect(manifest.requiredWriteGates.join(" ").toLowerCase()).toContain("sabre certification");
    expect(manifest.requiredWriteGates.join(" ").toLowerCase()).not.toContain("migration 054");
    expect(manifest.requiredWriteGates.join(" ").toLowerCase()).not.toContain("migration 055");
    expect(manifest.requiredWriteGates.join(" ").toLowerCase()).not.toContain("migration 057");
    expect(manifest.requiredWriteGates.join(" ").toLowerCase()).not.toContain("migration 058");
    expect(manifest.requiredWriteGates.join(" ").toLowerCase()).toContain("migration 059");
    expect(manifest.requiredWriteGates.join(" ").toLowerCase()).toContain("live-traffic approval");
    expect(manifest.stopConditions.length).toBeGreaterThan(0);
    expect(manifest.stopConditions.join(" ")).toContain("039-through-058");
  });

  it("contains no credential-shaped fields", () => {
    const serialized = JSON.stringify(manifest).toLowerCase();
    for (const forbidden of ["password", "secret", "api_key", "access_token"]) {
      expect(serialized).not.toContain(forbidden);
    }
  });
});
