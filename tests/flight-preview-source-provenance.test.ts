import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const receiptPath =
  "docs/FLIGHT_PREVIEW_073_080_SOURCE_PROVENANCE_RECEIPT_2026-08-25.json";

type FrozenFile = {
  path: string;
  bytes: number;
  sha256: string;
};

type FrozenEntry = {
  version: string;
  forward: FrozenFile;
  rollback: FrozenFile;
  previewLedgerEvidence: {
    classification: "full_cli_source" | "compact_receipt_claim_only";
    sourceSha256Claim: string | null;
    reconciledForwardSha256: string | null;
  };
};

type ProvenanceReceipt = {
  receiptVersion: string;
  recordedOn: string;
  scope: {
    firstVersion: string;
    lastVersion: string;
    versionCount: number;
    previewProjectRef: string;
    previewMigrationCount: number;
    previewVersionDigestMd5: string;
    sharedTipVersion: string;
  };
  limitations: string[];
  entries: FrozenEntry[];
};

const expectedEntries: FrozenEntry[] = [
  {
    version: "202608250073",
    forward: {
      path: "supabase/migrations/202608250073_flight_duffel_claim_terminal_return.sql",
      bytes: 2992,
      sha256: "b9f6a6a25cf9cd5f1ad46e27a93b572d8e555a37ae08294391f2f575bcd7e045",
    },
    rollback: {
      path: "supabase/rollbacks/202608250073_flight_duffel_claim_terminal_return.rollback.sql",
      bytes: 460,
      sha256: "624225f5e9f5f938e4966679f35c5ab97be575fd23f1007c1fea37aebb29a271",
    },
    previewLedgerEvidence: {
      classification: "full_cli_source",
      sourceSha256Claim: null,
      reconciledForwardSha256:
        "b9f6a6a25cf9cd5f1ad46e27a93b572d8e555a37ae08294391f2f575bcd7e045",
    },
  },
  {
    version: "202608250074",
    forward: {
      path: "supabase/migrations/202608250074_flight_consumer_preview_foundation.sql",
      bytes: 90709,
      sha256: "c5cf8ace2562332255758736970a022bced59c76867b1b71ce7703f12bb7bb98",
    },
    rollback: {
      path: "supabase/rollbacks/202608250074_flight_consumer_preview_foundation.rollback.sql",
      bytes: 2726,
      sha256: "128132c9bd3f0e78b5447b1ac37311d46c0882bae450aa92b9aa50d5f158d4f0",
    },
    previewLedgerEvidence: {
      classification: "compact_receipt_claim_only",
      sourceSha256Claim:
        "c5cf8ace2562332255758736970a022bced59c76867b1b71ce7703f12bb7bb98",
      reconciledForwardSha256: null,
    },
  },
  {
    version: "202608250075",
    forward: {
      path: "supabase/migrations/202608250075_flight_consumer_preview_orchestration.sql",
      bytes: 232569,
      sha256: "3edaffb8bb93588932ad4d3c5cd0727b360c9f669709bab2da9c4e25130f5e49",
    },
    rollback: {
      path: "supabase/rollbacks/202608250075_flight_consumer_preview_orchestration.rollback.sql",
      bytes: 2774,
      sha256: "d213a7b2a5ec793b2778564c989b694a7a260a8ea37a687e999e54041a572c67",
    },
    previewLedgerEvidence: {
      classification: "compact_receipt_claim_only",
      sourceSha256Claim:
        "3edaffb8bb93588932ad4d3c5cd0727b360c9f669709bab2da9c4e25130f5e49",
      reconciledForwardSha256: null,
    },
  },
  {
    version: "202608250076",
    forward: {
      path: "supabase/migrations/202608250076_flight_consumer_preview_control_plane.sql",
      bytes: 116503,
      sha256: "3023e8190fa10b7b5f5de57fa588eaba39fe082a4eb06218d60d12adf839f8b1",
    },
    rollback: {
      path: "supabase/rollbacks/202608250076_flight_consumer_preview_control_plane.rollback.sql",
      bytes: 1266,
      sha256: "6204b1fcf01c56844f2d61bd588b8046830036c095b1e7e36bae663bdca06293",
    },
    previewLedgerEvidence: {
      classification: "compact_receipt_claim_only",
      sourceSha256Claim:
        "3023e8190fa10b7b5f5de57fa588eaba39fe082a4eb06218d60d12adf839f8b1",
      reconciledForwardSha256: null,
    },
  },
  {
    version: "202608250077",
    forward: {
      path: "supabase/migrations/202608250077_flight_consumer_preview_async_finalization.sql",
      bytes: 57556,
      sha256: "f7aba46a72d6acfb9bf016faf8c666c37e3e3a73715114ebeadd12f2cd1f5ff7",
    },
    rollback: {
      path: "supabase/rollbacks/202608250077_flight_consumer_preview_async_finalization.rollback.sql",
      bytes: 1613,
      sha256: "1d70dad494830705b0f3628a58930f30d9cab3f958abb6b502ce15da460326ce",
    },
    previewLedgerEvidence: {
      classification: "compact_receipt_claim_only",
      sourceSha256Claim:
        "f7aba46a72d6acfb9bf016faf8c666c37e3e3a73715114ebeadd12f2cd1f5ff7",
      reconciledForwardSha256: null,
    },
  },
  {
    version: "202608250078",
    forward: {
      path: "supabase/migrations/202608250078_flight_consumer_notification_delivery.sql",
      bytes: 24016,
      sha256: "187c46f7bc08d7f8165341858ecfac918048aac8dce2f70cb594406647aed8fb",
    },
    rollback: {
      path: "supabase/rollbacks/202608250078_flight_consumer_notification_delivery.rollback.sql",
      bytes: 775,
      sha256: "ba64f007fa9be33b7f3c83fe3ab7ce5c0534e83f992559505b4d6b6579d53f19",
    },
    previewLedgerEvidence: {
      classification: "compact_receipt_claim_only",
      sourceSha256Claim:
        "187c46f7bc08d7f8165341858ecfac918048aac8dce2f70cb594406647aed8fb",
      reconciledForwardSha256: null,
    },
  },
  {
    version: "202608250079",
    forward: {
      path: "supabase/migrations/202608250079_flight_consumer_preview_support_intake.sql",
      bytes: 16448,
      sha256: "02f5ed7064cfb2623e60c88bae8b042bdea08682473963e794711caf38d242ca",
    },
    rollback: {
      path: "supabase/rollbacks/202608250079_flight_consumer_preview_support_intake.rollback.sql",
      bytes: 920,
      sha256: "4d51f43824e047a3c1969777ff01d815ea44965b8324c6b12ef8ae8dbcfba0fb",
    },
    previewLedgerEvidence: {
      classification: "compact_receipt_claim_only",
      sourceSha256Claim:
        "02f5ed7064cfb2623e60c88bae8b042bdea08682473963e794711caf38d242ca",
      reconciledForwardSha256: null,
    },
  },
  {
    version: "202608250080",
    forward: {
      path: "supabase/migrations/202608250080_flight_consumer_preview_activation_control.sql",
      bytes: 26262,
      sha256: "b84e6afc90e196cb1ab630512c145021af42a0f1b8d67d10bbaea2b8f63a420a",
    },
    rollback: {
      path: "supabase/rollbacks/202608250080_flight_consumer_preview_activation_control.rollback.sql",
      bytes: 1109,
      sha256: "19b12c59e1da57613990e20bfff115023d25026b4adb250273b3ffd2f373c726",
    },
    previewLedgerEvidence: {
      classification: "compact_receipt_claim_only",
      sourceSha256Claim:
        "b84e6afc90e196cb1ab630512c145021af42a0f1b8d67d10bbaea2b8f63a420a",
      reconciledForwardSha256: null,
    },
  },
];

function sha256(bytes: Buffer) {
  return createHash("sha256").update(bytes).digest("hex");
}

const rawReceipt = readFileSync(receiptPath, "utf8");
const receipt = JSON.parse(rawReceipt) as ProvenanceReceipt;

describe("flight Preview 073-080 source provenance", () => {
  it("pins the exact reconciled lineage boundary without claiming a write", () => {
    expect(receipt.receiptVersion).toBe("flight-preview-source-provenance-v1");
    expect(receipt.recordedOn).toBe("2026-08-25");
    expect(receipt.scope).toEqual({
      firstVersion: "202608250073",
      lastVersion: "202608250080",
      versionCount: 8,
      previewProjectRef: "eiqmdldjnedqgbtoozqa",
      previewMigrationCount: 91,
      previewVersionDigestMd5: "d8fbcd326d35837a80b36f922443de2f",
      sharedTipVersion: "202608250080",
    });
    expect(receipt.limitations).toHaveLength(4);
    expect(receipt.limitations.join("\n")).toContain("performed no database action");
    expect(receipt.limitations.join("\n")).toContain("not full-statement execution proof");
  });

  it("freezes every forward and rollback file by exact byte length and SHA-256", () => {
    expect(receipt.entries).toEqual(expectedEntries);

    for (const entry of expectedEntries) {
      for (const artifact of [entry.forward, entry.rollback]) {
        const bytes = readFileSync(artifact.path);
        expect(bytes.byteLength, artifact.path).toBe(artifact.bytes);
        expect(sha256(bytes), artifact.path).toBe(artifact.sha256);
      }
    }
  });

  it("keeps full-source reconciliation distinct from receipt-only claims", () => {
    const [fullSource, ...receiptClaims] = receipt.entries;

    expect(fullSource.version).toBe("202608250073");
    expect(fullSource.previewLedgerEvidence).toEqual({
      classification: "full_cli_source",
      sourceSha256Claim: null,
      reconciledForwardSha256: fullSource.forward.sha256,
    });

    for (const entry of receiptClaims) {
      expect(entry.previewLedgerEvidence).toEqual({
        classification: "compact_receipt_claim_only",
        sourceSha256Claim: entry.forward.sha256,
        reconciledForwardSha256: null,
      });
    }
  });

  it("excludes version 081 and every path outside the approved range", () => {
    expect(receipt.entries.map(({ version }) => version)).toEqual([
      "202608250073",
      "202608250074",
      "202608250075",
      "202608250076",
      "202608250077",
      "202608250078",
      "202608250079",
      "202608250080",
    ]);
    expect(rawReceipt).not.toContain("202608250081");
  });
});
