import { readFile } from "node:fs/promises";

// Reuse Gate 139's exact behavioral fixture without copying or weakening it.
// This overlay adds Gate 140 to that exact stack, replaces the fresh and late
// exposure calls with the reconciliation RPC, and keeps every downstream Gate
// 139 replay/collision/revocation/ACL assertion active. Each source edit is
// exact and fails closed if the reviewed fixture changes shape.
const foundationVerifierPath =
  "scripts/verify-flight-consumer-private-preview-foundation-pglite.mjs";
let source = await readFile(foundationVerifierPath, "utf8");

function replaceExact(needle, replacement, label) {
  const first = source.indexOf(needle);
  if (first < 0 || source.indexOf(needle, first + needle.length) >= 0) {
    throw new Error(`Gate140 verifier overlay ${label} is not exact.`);
  }
  source = source.slice(0, first) + replacement
    + source.slice(first + needle.length);
}

function replaceRange(startNeedle, endNeedle, replacement, label) {
  const start = source.indexOf(startNeedle);
  const end = source.indexOf(endNeedle, start + startNeedle.length);
  if (start < 0 || end < 0
    || source.indexOf(startNeedle, start + startNeedle.length) >= 0) {
    throw new Error(`Gate140 verifier overlay ${label} is not exact.`);
  }
  source = source.slice(0, start) + replacement + source.slice(end);
}

replaceExact(
  '  "202608260139_flight_consumer_live_private_preview_foundation.sql",\n];',
  '  "202608260139_flight_consumer_live_private_preview_foundation.sql",\n'
    + '  "202608260140_flight_consumer_live_private_preview_exposure_reconciliation.sql",\n];',
  "migration stack",
);
replaceExact(
  '"supabase/production-rollbacks/202608260139_flight_consumer_live_private_preview_foundation.rollback.sql",',
  '"supabase/production-rollbacks/202608260140_flight_consumer_live_private_preview_exposure_reconciliation.rollback.sql",',
  "rollback",
);

replaceRange(
  "const directExposureArgs =",
  "if (directExposure?.decision",
  `const reconciliationSql = \`select * from
 public.reconcile_flight_consumer_live_private_preview_exposure_v1(
 $1,$2,$3,$4)\`;
const directReconcileStartedAt = Date.now();
const directReconcileArgs = [directFlow.admission.admission_id,
  directFlow.admission.admission_receipt_sha256, subject, directFlow.request];
const directExposure = (await db.query(
  reconciliationSql, directReconcileArgs,
)).rows[0];
const directExpiryMs = new Date(directExposure.exposure_not_after).getTime();
if (directExpiryMs <= directReconcileStartedAt
  || directExpiryMs > directReconcileStartedAt + 61_000) {
  throw new Error("Gate140 fresh exposure exceeded its 60-second bound.");
}
const directExposureArgs = [previewScope, directFlow.admission.admission_id,
  directFlow.admission.admission_receipt_sha256, subject, directFlow.request,
  directFlow.dispatch.dispatch_id, directFlow.dispatch.dispatch_receipt_sha256,
  directProjection.completed.projection_batch_sha256,
  directProjection.completed.projection_receipt_sha256, 0, 0, 0,
  directExposure.exposure_not_after];
`,
  "fresh reconciliation",
);

replaceRange(
  "const directReplay =",
  "if (directReplay?.decision",
  `const directReplay = (await db.query(
  reconciliationSql, directReconcileArgs,
)).rows[0];
if (new Date(directReplay.exposure_not_after).getTime() !== directExpiryMs) {
  throw new Error("Gate140 exact replay changed exposure expiry.");
}
`,
  "exact reconciliation replay",
);

replaceRange(
  "const lateExposureArgs =",
  "if (lateExposure?.reconciliation_mode",
  `const lateExposure = (await db.query(reconciliationSql, [
  lateFlow.admission.admission_id,
  lateFlow.admission.admission_receipt_sha256,
  subject,
  lateFlow.request,
])).rows[0];
`,
  "late-success reconciliation",
);

replaceExact(
  "let exposureCollision = false;",
  `let reconciliationBindingRejected = false;
try {
  await db.query(reconciliationSql, directReconcileArgs.with(3, fixed(65)));
} catch { reconciliationBindingRejected = true; }
if (!reconciliationBindingRejected) {
  throw new Error("Gate140 accepted a caller binding collision.");
}
let exposureCollision = false;`,
  "caller binding collision",
);

replaceExact(
  "let acl = false;",
  `let reconciliationAcl = false;
try {
  await db.exec("set role authenticated;");
  await db.query(reconciliationSql, directReconcileArgs);
} catch { reconciliationAcl = true; }
finally { await db.exec("reset role;"); }
if (!reconciliationAcl) {
  throw new Error("Gate140 reconciliation RPC ACL failed.");
}
let acl = false;`,
  "reconciliation ACL",
);

replaceExact(
  "let revokedRead = false;",
  `let revokedReconciliation = false;
try { await db.query(reconciliationSql, directReconcileArgs); }
catch { revokedReconciliation = true; }
if (!revokedReconciliation) {
  throw new Error("Gate140 reconciliation survived membership revocation.");
}
let revokedRead = false;`,
  "reconciliation after revocation",
);

replaceExact(
  'console.log("Flight Consumer Production private-preview Gate139 PGlite verifier passed.");',
  'console.log("Flight Consumer Production private-preview Gate140 reconciliation PGlite verifier passed.");',
  "success receipt",
);

await import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);
