import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

type RolloutManifest = {
  executionState: string;
  historyRepairCandidates: string[];
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
    expect(manifest.pendingDeploymentVersions).toEqual(migrationVersions.slice(49));
    expect(manifest.historyRepairCandidates.at(-1)).toBe("202608130038");
    expect(manifest.pendingDeploymentVersions[0]).toBe("202608130039");
    expect(manifest.pendingDeploymentVersions.at(-1)).toBe("202608130048");
  });

  it("records completed history repair while preserving later write gates", () => {
    expect(manifest.executionState).toBe("history_repaired_001_038_pending_039_048");
    expect(manifest.requiredWriteGates.join(" ").toLowerCase()).toContain(
      "explicit production-write approval",
    );
    expect(manifest.requiredWriteGates.join(" ").toLowerCase()).toContain("backup");
    expect(manifest.stopConditions.length).toBeGreaterThan(0);
  });

  it("contains no credential-shaped fields", () => {
    const serialized = JSON.stringify(manifest).toLowerCase();
    for (const forbidden of ["password", "secret", "api_key", "access_token"]) {
      expect(serialized).not.toContain(forbidden);
    }
  });
});
