import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

export const PREVIEW_PROJECT_REF = "eiqmdldjnedqgbtoozqa";
export const PRODUCTION_PROJECT_REF = "allliumarkejinplrggl";
export const REQUIRED_BASELINE_TIP = "202608170067";
export const REQUIRED_REMOTE_FLIGHT_BASELINE_TIP = "202608250080";
export const APPLY_CONFIRMATION_FLAG =
  "--apply-confirmation=PREVIEW_eiqmdldjnedqgbtoozqa_FLIGHT_120_137";

export const SHARED_HOTEL_MIGRATION = Object.freeze({
  version: "202608250082",
  filename: "202608250082_hotel_commercial_agreement_evidence.sql",
  sha256: "1aa9abf4d062504f44fa57794fa73f136a1391a55abb8e2b9b8cbfb9cda17696",
  rollbackFilename: "202608250082_hotel_commercial_agreement_evidence.rollback.sql",
  rollbackSha256: "7150387ee5f5d3e7f741ab04169d03de25a40ea479c7811bf614b170478492de",
});

export const RETIRED_FLIGHT_MIGRATION_VERSIONS = Object.freeze([
  "202608250081", "202608250082", "202608250083", "202608250084",
  "202608250085", "202608250086", "202608250087", "202608250088",
  "202608250089", "202608250090", "202608250091", "202608250092",
  "202608250093", "202608250094", "202608250095", "202608250096",
  "202608250097", "202608250098",
]);

export const CANONICAL_FLIGHT_MIGRATION_VERSIONS = Object.freeze([
  "202608260120", "202608260121", "202608260122", "202608260123",
  "202608260124", "202608260125", "202608260126", "202608260127",
  "202608260128", "202608260129", "202608260130", "202608260131",
  "202608260132", "202608260133", "202608260134", "202608260135",
  "202608260136", "202608260137",
]);

const PINNED_TERMINAL_RECOVERY_FUNCTION_BODY_SHA256 = Object.freeze({
  offerEvidenceLoader:
    "d1165286160c3ae5694950bbebfac75adcbab6a708f5e2343dba4d752e7b8172",
  offerLocalIdentity:
    "5eaf485cadb185b01c861ec1573479dd838bb86738c3610e817a1e77c01cf5dd",
});

export const PINNED_FLIGHT_MIGRATIONS = Object.freeze([
  Object.freeze({
    version: "202608230068",
    filename: "202608230068_flight_commerce_foundation.sql",
    sha256: "29f8cb9a45f69e7da23bffdf185ff6eaab2a514a35a22da4aa4b8c91cf08ef7d",
  }),
  Object.freeze({
    version: "202608240069",
    filename: "202608240069_flight_provider_request_attempts.sql",
    sha256: "7e966c4fa6f08a92692787dd82fadd4c0205af02826342a3902037438b1bd611",
  }),
  Object.freeze({
    version: "202608250070",
    filename: "202608250070_flight_duffel_test_order_attempts.sql",
    sha256: "882c20f4643ca5ed02cb5e5423e7dc140b54b7524a46f53e9c66e9af574e37fe",
  }),
  Object.freeze({
    version: "202608250071",
    filename: "202608250071_flight_duffel_preview_rpc_bridge.sql",
    sha256: "bb4f8d4287060d5301e1704073e2d2c15b6dcfa1309cb1a190da9efddefa375d",
  }),
  Object.freeze({
    version: "202608250072",
    filename: "202608250072_flight_duffel_preview_runtime_assertions.sql",
    sha256: "b8e073508ebe45be717f6d07fe463eae33eaf7d5d168076a903ffc552f08ca0b",
  }),
  Object.freeze({
    version: "202608250073",
    filename: "202608250073_flight_duffel_claim_terminal_return.sql",
    sha256: "b9f6a6a25cf9cd5f1ad46e27a93b572d8e555a37ae08294391f2f575bcd7e045",
  }),
  Object.freeze({
    version: "202608250074",
    filename: "202608250074_flight_consumer_preview_foundation.sql",
    sha256: "c5cf8ace2562332255758736970a022bced59c76867b1b71ce7703f12bb7bb98",
    rollbackFilename: "202608250074_flight_consumer_preview_foundation.rollback.sql",
    rollbackSha256: "128132c9bd3f0e78b5447b1ac37311d46c0882bae450aa92b9aa50d5f158d4f0",
  }),
  Object.freeze({
    version: "202608250075",
    filename: "202608250075_flight_consumer_preview_orchestration.sql",
    sha256: "3edaffb8bb93588932ad4d3c5cd0727b360c9f669709bab2da9c4e25130f5e49",
    rollbackFilename: "202608250075_flight_consumer_preview_orchestration.rollback.sql",
    rollbackSha256: "d213a7b2a5ec793b2778564c989b694a7a260a8ea37a687e999e54041a572c67",
  }),
  Object.freeze({
    version: "202608250076",
    filename: "202608250076_flight_consumer_preview_control_plane.sql",
    sha256: "3023e8190fa10b7b5f5de57fa588eaba39fe082a4eb06218d60d12adf839f8b1",
    rollbackFilename: "202608250076_flight_consumer_preview_control_plane.rollback.sql",
    rollbackSha256: "6204b1fcf01c56844f2d61bd588b8046830036c095b1e7e36bae663bdca06293",
  }),
  Object.freeze({
    version: "202608250077",
    filename: "202608250077_flight_consumer_preview_async_finalization.sql",
    sha256: "f7aba46a72d6acfb9bf016faf8c666c37e3e3a73715114ebeadd12f2cd1f5ff7",
    rollbackFilename: "202608250077_flight_consumer_preview_async_finalization.rollback.sql",
    rollbackSha256: "1d70dad494830705b0f3628a58930f30d9cab3f958abb6b502ce15da460326ce",
  }),
  Object.freeze({
    version: "202608250078",
    filename: "202608250078_flight_consumer_notification_delivery.sql",
    sha256: "187c46f7bc08d7f8165341858ecfac918048aac8dce2f70cb594406647aed8fb",
    rollbackFilename: "202608250078_flight_consumer_notification_delivery.rollback.sql",
    rollbackSha256: "ba64f007fa9be33b7f3c83fe3ab7ce5c0534e83f992559505b4d6b6579d53f19",
  }),
  Object.freeze({
    version: "202608250079",
    filename: "202608250079_flight_consumer_preview_support_intake.sql",
    sha256: "02f5ed7064cfb2623e60c88bae8b042bdea08682473963e794711caf38d242ca",
    rollbackFilename: "202608250079_flight_consumer_preview_support_intake.rollback.sql",
    rollbackSha256: "4d51f43824e047a3c1969777ff01d815ea44965b8324c6b12ef8ae8dbcfba0fb",
  }),
  Object.freeze({
    version: "202608250080",
    filename: "202608250080_flight_consumer_preview_activation_control.sql",
    sha256: "b84e6afc90e196cb1ab630512c145021af42a0f1b8d67d10bbaea2b8f63a420a",
    rollbackFilename: "202608250080_flight_consumer_preview_activation_control.rollback.sql",
    rollbackSha256: "19b12c59e1da57613990e20bfff115023d25026b4adb250273b3ffd2f373c726",
  }),
  Object.freeze({
    version: "202608260120",
    filename: "202608260120_flight_consumer_webhook_operational_escalation.sql",
    sha256: "161cb8c088793c810a2133f2014886ef79768f3162fe5fc923f6bde79226ce99",
    rollbackFilename: "202608260120_flight_consumer_webhook_operational_escalation.rollback.sql",
    rollbackSha256: "b35d802921ee7878e4279e94c57230aad28ca49c5cc83437eff9fdb556602986",
  }),
  Object.freeze({
    version: "202608260121",
    filename: "202608260121_flight_consumer_activation_cas_qualification.sql",
    sha256: "0be59a48d010fad7537f285456ab14a12733150d51fe5c2d1d7437af3bd253ca",
    rollbackFilename: "202608260121_flight_consumer_activation_cas_qualification.rollback.sql",
    rollbackSha256: "acbf756da48c09ce0b417ae0742892601b733cabeba7f29f47af07a88c9c1458",
  }),
  Object.freeze({
    version: "202608260122",
    filename: "202608260122_flight_consumer_relock_settlement_constraint.sql",
    sha256: "05d15d04f2b80c33417a7b91b8641bf671bc8a15deee8dc0886eba9dc6521b09",
    rollbackFilename: "202608260122_flight_consumer_relock_settlement_constraint.rollback.sql",
    rollbackSha256: "ffcb057921fa3a085cbfdf64ccc4481f2b7ad7c9d35b2c0e339f9dd52621b23c",
  }),
  Object.freeze({
    version: "202608260123",
    filename: "202608260123_flight_consumer_search_repair.sql",
    sha256: "903230c9c179567444932aeb190d6f24d6711e3b764425cbcd21a1d3b121057e",
    rollbackFilename: "202608260123_flight_consumer_search_repair.rollback.sql",
    rollbackSha256: "dbfaf2d116f3beedcb075220518d39eed02e5523626b60b6a65feda3a50d15fe",
  }),
  Object.freeze({
    version: "202608260124",
    filename: "202608260124_flight_consumer_ciphertext_validation_repair.sql",
    sha256: "6f869b730b0946ca1facd07758871928cddfe5229b6dea5080dbde311b2b23ba",
    rollbackFilename: "202608260124_flight_consumer_ciphertext_validation_repair.rollback.sql",
    rollbackSha256: "2b11dcab3cc5a41f7cf92dcb7e1e993cd3c6b40145aabbaf8d7eabad1060ef79",
  }),
  Object.freeze({
    version: "202608260125",
    filename: "202608260125_flight_consumer_reprice_projection_repair.sql",
    sha256: "d2f03669e49b6d42557e7a8e73e195a7aff87f4d38210d0610a186b656db8773",
    rollbackFilename: "202608260125_flight_consumer_reprice_projection_repair.rollback.sql",
    rollbackSha256: "c1dd412d4518148a633750b249467203285c82fe375e3dd6b2120470729ebbe3",
  }),
  Object.freeze({
    version: "202608260126",
    filename: "202608260126_flight_consumer_capture_projection_repair.sql",
    sha256: "6c3c9c3629d86402576e5ef360059c5a569ff7ab6c50776aebef06b32af31637",
    rollbackFilename: "202608260126_flight_consumer_capture_projection_repair.rollback.sql",
    rollbackSha256: "f65e48cd6014357d27ae212951dce10fb880a14cc9b0e62208bec5fe4986354d",
  }),
  Object.freeze({
    version: "202608260127",
    filename: "202608260127_flight_consumer_order_ambiguity_semantics_repair.sql",
    sha256: "be0e47e14679925edfc935af542439510d90fcc5975c725bd673332c859157b9",
    rollbackFilename: "202608260127_flight_consumer_order_ambiguity_semantics_repair.rollback.sql",
    rollbackSha256: "8cf6a87ef4c9cebaf16093afe5789c89b34822cb3a2e4e7a9d5147c4812b7eb7",
  }),
  Object.freeze({
    version: "202608260128",
    filename: "202608260128_flight_consumer_order_recovery_hardening.sql",
    sha256: "7a2ecd0ea11f008096978ee092059f7cea33ede46285f40370e8bd8799c48244",
    rollbackFilename: "202608260128_flight_consumer_order_recovery_hardening.rollback.sql",
    rollbackSha256: "8ea7642d415cb6ea36bc5bc8b6db7c48be31944e10951ed3c782af44f272d5be",
  }),
  Object.freeze({
    version: "202608260129",
    filename: "202608260129_flight_consumer_duffel_pending_webhook_link.sql",
    sha256: "85d82ca534455a375b2a6073abb27825ef1b77d745189cca4f5f5e82454e4906",
    rollbackFilename: "202608260129_flight_consumer_duffel_pending_webhook_link.rollback.sql",
    rollbackSha256: "e2b1f3077a0b8575af90e9fd20b922f8157ab7cde2917cd8405b9fa7e6bb9692",
  }),
  Object.freeze({
    version: "202608260130",
    filename: "202608260130_flight_consumer_completion_lease.sql",
    sha256: "96994117e09984981ef10392b3c640b395baa843f4141bc622e4c3bcb3c8155c",
    rollbackFilename: "202608260130_flight_consumer_completion_lease.rollback.sql",
    rollbackSha256: "338c1fad9ec26823d45c08b08d594f130fdf766b16f22080d844f0145cac79ab",
  }),
  Object.freeze({
    version: "202608260131",
    filename: "202608260131_flight_consumer_terminal_recovery_safety.sql",
    sha256: "95d4ffe8e1ac53ab237f16ece68c2ccfea63b06378cea9800b625b59e9d9993d",
    rollbackFilename: "202608260131_flight_consumer_terminal_recovery_safety.rollback.sql",
    rollbackSha256: "b8f5c8c8ecb809ff9b1e2e3738ec9874a6fc9bd38076fc1a07b22366e3b65dd7",
  }),
  Object.freeze({
    version: "202608260132",
    filename: "202608260132_flight_consumer_capture_attestation_gate.sql",
    sha256: "47262234052bd8370765d1b195d7f6e565c00b543fdebabf9818fe8ac669ca28",
    rollbackFilename: "202608260132_flight_consumer_capture_attestation_gate.rollback.sql",
    rollbackSha256: "05932c2361eec67ebfd3374102ccf14a93a72c8cd844b7b5bdf54eb85b75359d",
  }),
  Object.freeze({
    version: "202608260133",
    filename: "202608260133_flight_consumer_completion_lease_qualification_repair.sql",
    sha256: "27b5b35ee8239f091c61a75dd7fcd7c3beb0c1eb5aa652ecf8ae96c73ddcf65e",
    rollbackFilename: "202608260133_flight_consumer_completion_lease_qualification_repair.rollback.sql",
    rollbackSha256: "8ece424d11710e37f7b998c4c308d5848d979462161f5faf44c89080b99345ec",
  }),
  Object.freeze({
    version: "202608260134",
    filename: "202608260134_flight_consumer_duffel_claim_evidence_column_repair.sql",
    sha256: "bc568c1129737290f7ecb46f783e573ebcfbc8a0d9f64e2a3d9e2bd9445ab9b7",
    rollbackFilename: "202608260134_flight_consumer_duffel_claim_evidence_column_repair.rollback.sql",
    rollbackSha256: "b113c99aec505319866840467262c7bee23efc0b56f662ba831bdfdbd7137eb5",
  }),
  Object.freeze({
    version: "202608260135",
    filename: "202608260135_flight_consumer_completion_lease_recovery.sql",
    sha256: "7a57a21709b3d979226987b10419694389fa2aef2428216ccc8ac915283e8fb4",
    rollbackFilename: "202608260135_flight_consumer_completion_lease_recovery.rollback.sql",
    rollbackSha256: "f8ef205df51c9f5d0b671042fc51a341cf46ebfb9e5466c1d95149f2c1863930",
  }),
  Object.freeze({
    version: "202608260136",
    filename: "202608260136_flight_consumer_terminal_offer_evidence_recovery.sql",
    sha256: "89880fa51d3c997b8364b6663ef617a735c3eaf712348ee55a5eb295a11e91da",
    rollbackFilename: "202608260136_flight_consumer_terminal_offer_evidence_recovery.rollback.sql",
    rollbackSha256: "1d890c2ed74a3a2a8b37ee07f16f8f3d5781e0c63e8812ccae8811b878d94bd5",
  }),
  Object.freeze({
    version: "202608260137",
    filename: "202608260137_flight_consumer_terminal_offer_local_identity.sql",
    sha256: "09a89471334e6c25df324e54e242fef8a86416a278b3c37a19cb4d1f7986aeb8",
    rollbackFilename: "202608260137_flight_consumer_terminal_offer_local_identity.rollback.sql",
    rollbackSha256: "438367c921f972db2c8736e06c39663f025931879e3655423025c984fd50a2db",
  }),
]);

const REPOSITORY_ROOT_URL = new URL("../", import.meta.url);
const REPOSITORY_ROOT_PATH = fileURLToPath(REPOSITORY_ROOT_URL);
const MIGRATION_DIRECTORY_URL = new URL("supabase/migrations/", REPOSITORY_ROOT_URL);
const ROLLBACK_DIRECTORY_URL = new URL("supabase/rollbacks/", REPOSITORY_ROOT_URL);
const POSTGRES_PROTOCOLS = new Set(["postgres:", "postgresql:"]);
const CHILD_ENV_ALLOWLIST = new Set([
  "APPDATA",
  "COMSPEC",
  "HOME",
  "LOCALAPPDATA",
  "PATH",
  "PATHEXT",
  "SSL_CERT_DIR",
  "SSL_CERT_FILE",
  "SYSTEMROOT",
  "TEMP",
  "TMP",
  "USERPROFILE",
  "WINDIR",
  "XDG_CONFIG_HOME",
]);

function sameValues(actual, expected) {
  return actual.length === expected.length
    && actual.every((value, index) => value === expected[index]);
}

function sorted(values) {
  return [...values].sort();
}

export function listRepositoryMigrations() {
  const migrations = readdirSync(MIGRATION_DIRECTORY_URL)
    .filter((name) => name.endsWith(".sql"))
    .sort()
    .map((filename) => {
      const match = /^(\d{12})_[a-z0-9_]+\.sql$/.exec(filename);
      if (!match) {
        throw new Error("The migration directory contains a non-canonical SQL filename.");
      }
      return { version: match[1], filename };
    });

  const versions = migrations.map(({ version }) => version);
  if (new Set(versions).size !== versions.length) {
    throw new Error("The migration directory contains a duplicate migration version.");
  }
  return migrations;
}

export function assertPinnedFlightMigrations({
  repositoryMigrations = listRepositoryMigrations(),
  readMigrationBytes = (filename) => readFileSync(new URL(
    filename,
    MIGRATION_DIRECTORY_URL,
  )),
  readRollbackBytes = (filename) => readFileSync(new URL(
    filename,
    ROLLBACK_DIRECTORY_URL,
  )),
  requireSharedHotel = false,
} = {}) {
  const baselineTipIndex = repositoryMigrations.findIndex(
    ({ version }) => version === REQUIRED_BASELINE_TIP,
  );
  if (baselineTipIndex < 0) {
    throw new Error("Required repository migration 067 is missing.");
  }

  const postBaseline = repositoryMigrations.slice(baselineTipIndex + 1);
  const retiredSet = new Set(RETIRED_FLIGHT_MIGRATION_VERSIONS);
  const sharedHotelRows = postBaseline.filter(
    ({ version, filename }) => version === SHARED_HOTEL_MIGRATION.version
      && filename === SHARED_HOTEL_MIGRATION.filename,
  );
  const forbiddenRetiredRows = postBaseline.filter(
    ({ version, filename }) => retiredSet.has(version)
      && !(
        version === SHARED_HOTEL_MIGRATION.version
        && filename === SHARED_HOTEL_MIGRATION.filename
      ),
  );
  if (forbiddenRetiredRows.length > 0) {
    throw new Error("The repository contains a retired flight migration version 081 through 098.");
  }

  const expectedPostBaseline = [
    ...PINNED_FLIGHT_MIGRATIONS.map(({ version, filename }) => ({ version, filename })),
    ...sharedHotelRows,
  ].sort((left, right) => (
    left.version.localeCompare(right.version) || left.filename.localeCompare(right.filename)
  ));
  if (JSON.stringify(postBaseline) !== JSON.stringify(expectedPostBaseline)) {
    throw new Error(
      "Only pinned flight migrations 068 through 080 and 120 through 137, plus the externally owned hotel 082 file when present, may follow migration 067.",
    );
  }

  if (sharedHotelRows.length === 1) {
    const hotelBytes = readMigrationBytes(SHARED_HOTEL_MIGRATION.filename);
    const actualHotelHash = createHash("sha256").update(hotelBytes).digest("hex");
    if (actualHotelHash !== SHARED_HOTEL_MIGRATION.sha256) {
      throw new Error("The externally owned hotel migration 082 failed its SHA-256 check.");
    }
    const hotelRollbackBytes = readRollbackBytes(SHARED_HOTEL_MIGRATION.rollbackFilename);
    const actualHotelRollbackHash = createHash("sha256")
      .update(hotelRollbackBytes)
      .digest("hex");
    if (actualHotelRollbackHash !== SHARED_HOTEL_MIGRATION.rollbackSha256) {
      throw new Error("The externally owned hotel rollback 082 failed its SHA-256 check.");
    }
  }
  if (requireSharedHotel && sharedHotelRows.length !== 1) {
    throw new Error(
      "Apply mode requires the exact pinned hotel migration 082 as a local external predecessor.",
    );
  }

  for (const migration of PINNED_FLIGHT_MIGRATIONS) {
    const bytes = readMigrationBytes(migration.filename);
    const actualHash = createHash("sha256").update(bytes).digest("hex");
    if (actualHash !== migration.sha256) {
      throw new Error(`Pinned migration ${migration.version} failed its SHA-256 check.`);
    }
    if (migration.rollbackFilename !== undefined) {
      const rollbackBytes = readRollbackBytes(migration.rollbackFilename);
      const actualRollbackHash = createHash("sha256").update(rollbackBytes).digest("hex");
      if (actualRollbackHash !== migration.rollbackSha256) {
        throw new Error(`Pinned rollback ${migration.version} failed its SHA-256 check.`);
      }
    }
  }

  const remoteBaselineTipIndex = repositoryMigrations.findIndex(
    ({ version }) => version === REQUIRED_REMOTE_FLIGHT_BASELINE_TIP,
  );
  if (remoteBaselineTipIndex < 0) {
    throw new Error("Required remote flight baseline migration 080 is missing.");
  }

  const canonicalSet = new Set(CANONICAL_FLIGHT_MIGRATION_VERSIONS);
  const canonicalMigrations = PINNED_FLIGHT_MIGRATIONS.filter(
    ({ version }) => canonicalSet.has(version),
  );
  if (canonicalMigrations.length !== CANONICAL_FLIGHT_MIGRATION_VERSIONS.length) {
    throw new Error("The canonical flight migration block 120 through 137 is incomplete.");
  }

  return {
    migrations: repositoryMigrations,
    baselineVersions: repositoryMigrations
      .slice(0, remoteBaselineTipIndex + 1)
      .map(({ version }) => version),
    flightVersions: canonicalMigrations.map(({ version }) => version),
    sharedHotelMigrationPresent: sharedHotelRows.length === 1,
  };
}

function validatedConfiguredProductionRef(env) {
  const configured = env.PRODUCTION_SUPABASE_PROJECT_REF?.trim();
  if (!configured) return undefined;
  if (!/^[a-z0-9]{20}$/.test(configured)) {
    throw new Error("The configured production project ref is invalid; refusing to continue.");
  }
  return configured;
}

export function assertExactPreviewTarget(env) {
  const projectRef = env.PREVIEW_SUPABASE_PROJECT_REF?.trim();
  const databaseUrl = env.PREVIEW_SUPABASE_DB_URL?.trim();
  const configuredProductionRef = validatedConfiguredProductionRef(env);

  if (projectRef !== PREVIEW_PROJECT_REF) {
    throw new Error("The exact approved Preview project ref is required.");
  }
  if (
    projectRef === PRODUCTION_PROJECT_REF
    || projectRef === configuredProductionRef
  ) {
    throw new Error("Refusing to target a production Supabase project.");
  }
  if (!databaseUrl) {
    throw new Error("PREVIEW_SUPABASE_DB_URL is required.");
  }

  let parsed;
  try {
    parsed = new URL(databaseUrl);
  } catch {
    throw new Error("PREVIEW_SUPABASE_DB_URL is not an approved Supabase PostgreSQL URL.");
  }

  if (!POSTGRES_PROTOCOLS.has(parsed.protocol)) {
    throw new Error("PREVIEW_SUPABASE_DB_URL must use PostgreSQL.");
  }
  if (parsed.search || parsed.hash || parsed.pathname !== "/postgres") {
    throw new Error("PREVIEW_SUPABASE_DB_URL has an unapproved path or option.");
  }
  if (!parsed.password) {
    throw new Error("PREVIEW_SUPABASE_DB_URL must include a database password.");
  }

  let username;
  let databasePassword;
  try {
    username = decodeURIComponent(parsed.username);
    databasePassword = decodeURIComponent(parsed.password);
  } catch {
    throw new Error("PREVIEW_SUPABASE_DB_URL has invalid encoded credentials.");
  }

  const directHost = `db.${PREVIEW_PROJECT_REF}.supabase.co`;
  const isDirect = parsed.hostname === directHost
    && username === "postgres"
    && (parsed.port === "" || parsed.port === "5432");
  const isPooler = /^[a-z0-9-]+\.pooler\.supabase\.com$/.test(parsed.hostname)
    && username === `postgres.${PREVIEW_PROJECT_REF}`
    && (parsed.port === "5432" || parsed.port === "6543");

  if (!isDirect && !isPooler) {
    throw new Error("PREVIEW_SUPABASE_DB_URL does not match the exact approved Preview project.");
  }

  const blockedRefs = [PRODUCTION_PROJECT_REF, configuredProductionRef].filter(Boolean);
  const targetIdentity = `${parsed.hostname} ${username}`;
  if (blockedRefs.some((blockedRef) => targetIdentity.includes(blockedRef))) {
    throw new Error("Refusing to target a production Supabase database.");
  }

  const cliUrl = new URL(parsed.href);
  cliUrl.password = "";
  return {
    cliDatabaseUrl: cliUrl.toString(),
    databasePassword,
  };
}

export function parseInvocationMode(argv = []) {
  if (argv.length === 0 || (argv.length === 1 && argv[0] === "--plan")) {
    return "plan";
  }
  if (argv.length === 1 && argv[0] === APPLY_CONFIRMATION_FLAG) {
    return "apply";
  }
  throw new Error("Invalid arguments. Use --plan or the exact documented apply confirmation flag.");
}

export function parseMigrationListOutput(output) {
  const rows = [];
  for (const line of output.split(/\r?\n/)) {
    const columns = line.split(/[|│]/).map((column) => column.trim());
    if (columns.length < 2) continue;
    const [localCell, remoteCell] = columns;
    if (!localCell && !remoteCell) continue;
    if (/^local$/i.test(localCell) && /^remote$/i.test(remoteCell)) continue;
    if (
      /^[-=─━]+$/.test(localCell)
      && /^[-=─━]+$/.test(remoteCell)
    ) continue;

    const parseCell = (cell) => {
      if (!cell) return undefined;
      if (/^\d{12}$/.test(cell)) return cell;
      throw new Error("The Preview migration ledger contains a malformed version cell.");
    };
    const local = parseCell(localCell);
    const remote = parseCell(remoteCell);
    if (!local && !remote) {
      throw new Error("The Preview migration ledger contains an unrecognized row.");
    }
    rows.push({ local, remote });
  }

  if (rows.length === 0) {
    throw new Error("Unable to parse the Preview migration ledger.");
  }

  const localVersions = rows.flatMap(({ local }) => local ? [local] : []);
  const remoteVersions = rows.flatMap(({ remote }) => remote ? [remote] : []);
  const parsedVersions = new Set([...localVersions, ...remoteVersions]);
  const unparsedNumericVersion = [...output.matchAll(/(?<!\d)(\d{12,})(?!\d)/g)]
    .map((match) => match[1])
    .find((version) => !parsedVersions.has(version));
  if (unparsedNumericVersion) {
    throw new Error("The Preview migration ledger contains an unparsed numeric version.");
  }
  if (
    new Set(localVersions).size !== localVersions.length
    || new Set(remoteVersions).size !== remoteVersions.length
  ) {
    throw new Error("The Preview migration ledger contains duplicate versions.");
  }
  return { localVersions, remoteVersions };
}

export function assertPreviewLedger(output, pinnedPlan) {
  if (!pinnedPlan.sharedHotelMigrationPresent) {
    throw new Error(
      "The exact pinned hotel migration 082 must be present locally before validating an apply ledger.",
    );
  }
  const { localVersions, remoteVersions } = parseMigrationListOutput(output);
  const repositoryVersions = pinnedPlan.migrations.map(({ version }) => version);
  const expectedLocal = sorted(repositoryVersions);
  const actualLocal = sorted(localVersions);
  if (!sameValues(actualLocal, expectedLocal)) {
    throw new Error("The Preview ledger local side does not exactly match the repository.");
  }

  const actualRemote = sorted(remoteVersions);
  const retiredRemoteVersions = actualRemote.filter(
    (version) => RETIRED_FLIGHT_MIGRATION_VERSIONS.includes(version)
      && version !== SHARED_HOTEL_MIGRATION.version,
  );
  if (retiredRemoteVersions.length > 0) {
    throw new Error(
      `The Preview remote ledger contains retired or numerically colliding flight migration version(s): ${retiredRemoteVersions.join(", ")}.`,
    );
  }
  if (!actualRemote.includes(SHARED_HOTEL_MIGRATION.version)) {
    throw new Error(
      "The Preview remote ledger is missing the already-applied external hotel migration 082 predecessor.",
    );
  }
  const prefixLength = Array.from(
    { length: pinnedPlan.flightVersions.length + 1 },
    (_, length) => length,
  ).find((length) => sameValues(actualRemote, sorted([
    ...pinnedPlan.baselineVersions,
    SHARED_HOTEL_MIGRATION.version,
    ...pinnedPlan.flightVersions.slice(0, length),
  ])));
  if (prefixLength === undefined) {
    throw new Error(
      "The Preview remote ledger must contain the complete flight baseline through 080, the already-applied external hotel migration 082, and an exact prefix of canonical flight migrations 120 through 137.",
    );
  }

  return {
    pendingVersions: pinnedPlan.flightVersions.slice(prefixLength),
    remoteVersions: actualRemote,
  };
}

export function assertExactFlightDryRun(
  output,
  expectedVersions = CANONICAL_FLIGHT_MIGRATION_VERSIONS,
) {
  const mentionedVersions = [...output.matchAll(/(?<!\d)(\d{12})(?!\d)/g)]
    .map((match) => match[1]);
  const expectedSet = new Set(expectedVersions);
  const canonicalSet = new Set(CANONICAL_FLIGHT_MIGRATION_VERSIONS);
  const expectedMigrations = PINNED_FLIGHT_MIGRATIONS.filter(
    ({ version }) => canonicalSet.has(version) && expectedSet.has(version),
  );
  const expected = expectedMigrations.map(({ version }) => version);
  const mentionedFiles = [...output.matchAll(/(?<![a-z0-9_])(\d{12}_[a-z0-9_]+\.sql)(?![a-z0-9_])/gi)]
    .map((match) => match[1]);
  const expectedFiles = expectedMigrations.map(({ filename }) => filename);
  if (
    expected.length !== expectedVersions.length
    || !sameValues(mentionedVersions, expected)
    || !sameValues(mentionedFiles, expectedFiles)
  ) {
    throw new Error("The dry run must mention exactly the ledger-derived pinned flight migrations in order.");
  }
  return mentionedVersions;
}

function identifierPattern(identifier) {
  return `(?:"${identifier}"|${identifier})`;
}

function tableDefinition(output, table) {
  const pattern = new RegExp(
    `^\\s*CREATE\\s+TABLE(?:\\s+IF\\s+NOT\\s+EXISTS)?\\s+(?:"public"|public)\\.${identifierPattern(table)}\\s*\\(([\\s\\S]*?)^\\s*\\);`,
    "im",
  );
  return pattern.exec(output)?.[1];
}

function assertTableColumn(definition, table, column, typePattern, requiredTokens = []) {
  const linePattern = new RegExp(
    `^\\s*${identifierPattern(column)}\\s+(${typePattern})([^,\\r\\n]*)`,
    "im",
  );
  const line = linePattern.exec(definition)?.[0]?.toLowerCase();
  if (!line || requiredTokens.some((token) => !line.includes(token))) {
    throw new Error(`The post-apply schema dump is missing a required ${table} column contract.`);
  }
}

function normalizedSqlFragment(value) {
  return value
    .replaceAll('"', "")
    .toLowerCase()
    .replace(/timestamp\s+with\s+time\s+zone/g, "timestamptz")
    .replace(/\s+/g, " ")
    .replace(/\s*\(\s*/g, "(")
    .replace(/\s*\)\s*/g, ")")
    .replace(/\s*,\s*/g, ",")
    .trim();
}

function normalizedSqlStatementEntries(output) {
  return output
    .replace(/^\s*--[^\r\n]*(?:\r?\n|$)/gm, "")
    .split(";")
    .map((statement) => Object.freeze({
      source: statement.trim(),
      normalized: normalizedSqlFragment(statement),
    }));
}

function normalizedSqlStatements(output) {
  return normalizedSqlStatementEntries(output).map((statement) => statement.normalized);
}

function exactLowercaseQuotedIdentifiers(statement) {
  return [...statement.source.matchAll(/"((?:[^"]|"")*)"/g)]
    .every((match) => {
      const identifier = match[1].replaceAll("\"\"", "\"");
      return identifier === identifier.toLowerCase();
    });
}

function exactAclGrantee(statement, expectedRole) {
  if (!exactLowercaseQuotedIdentifiers(statement)) return false;
  const match = statement.source.match(
    /\bTO\s+((?:"(?:[^"]|"")*")|(?:[A-Za-z_][A-Za-z0-9_$]*))(?:\s+WITH\s+GRANT\s+OPTION)?\s*$/i,
  );
  if (!match) return false;
  const token = match[1];
  const role = token.startsWith("\"")
    ? token.slice(1, -1).replaceAll("\"\"", "\"")
    : token.toLowerCase();
  return role === expectedRole;
}

function exactUnquotedPublicRevokee(statement) {
  return exactLowercaseQuotedIdentifiers(statement)
    && /\bFROM\s+PUBLIC\s*$/i.test(statement.source);
}

function topLevelSqlStatements(output) {
  const statements = [];
  let start = 0;
  let dollarTag;
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let inLineComment = false;
  let blockCommentDepth = 0;

  for (let index = 0; index < output.length; index += 1) {
    if (dollarTag) {
      if (output.startsWith(dollarTag, index)) {
        index += dollarTag.length - 1;
        dollarTag = undefined;
      }
      continue;
    }
    if (inLineComment) {
      if (output[index] === "\n") inLineComment = false;
      continue;
    }
    if (blockCommentDepth > 0) {
      if (output.startsWith("/*", index)) {
        blockCommentDepth += 1;
        index += 1;
      } else if (output.startsWith("*/", index)) {
        blockCommentDepth -= 1;
        index += 1;
      }
      continue;
    }
    if (inSingleQuote) {
      if (output[index] === "'" && output[index + 1] === "'") {
        index += 1;
      } else if (output[index] === "'") {
        inSingleQuote = false;
      }
      continue;
    }
    if (inDoubleQuote) {
      if (output[index] === '"' && output[index + 1] === '"') {
        index += 1;
      } else if (output[index] === '"') {
        inDoubleQuote = false;
      }
      continue;
    }
    if (output.startsWith("--", index)) {
      inLineComment = true;
      index += 1;
      continue;
    }
    if (output.startsWith("/*", index)) {
      blockCommentDepth = 1;
      index += 1;
      continue;
    }
    if (output[index] === "'") {
      inSingleQuote = true;
      continue;
    }
    if (output[index] === '"') {
      inDoubleQuote = true;
      continue;
    }
    if (output[index] === "$") {
      const tag = /^\$[A-Za-z0-9_]*\$/.exec(output.slice(index))?.[0];
      if (tag) {
        dollarTag = tag;
        index += tag.length - 1;
        continue;
      }
    }
    if (output[index] === ";") {
      statements.push(output.slice(start, index + 1));
      start = index + 1;
    }
  }
  if (output.slice(start).trim()) statements.push(output.slice(start));
  return statements;
}

function withoutLeadingSqlComments(statement) {
  return statement.replace(
    /^(?:(?:\s+)|(?:--[^\r\n]*(?:\r?\n|$))|(?:\/\*[\s\S]*?\*\/))*/,
    "",
  );
}

function splitFunctionParameters(parameters) {
  const result = [];
  let start = 0;
  let depth = 0;
  let inSingleQuote = false;
  let inDoubleQuote = false;
  for (let index = 0; index < parameters.length; index += 1) {
    const character = parameters[index];
    if (inSingleQuote) {
      if (character === "'" && parameters[index + 1] === "'") index += 1;
      else if (character === "'") inSingleQuote = false;
      continue;
    }
    if (inDoubleQuote) {
      if (character === '"' && parameters[index + 1] === '"') index += 1;
      else if (character === '"') inDoubleQuote = false;
      continue;
    }
    if (character === "'") inSingleQuote = true;
    else if (character === '"') inDoubleQuote = true;
    else if (character === "(") depth += 1;
    else if (character === ")") depth -= 1;
    else if (character === "," && depth === 0) {
      result.push(parameters.slice(start, index));
      start = index + 1;
    }
  }
  result.push(parameters.slice(start));
  return result.filter((parameter) => parameter.trim());
}

function sensitiveFunctionIdentity(statement) {
  const definition = withoutLeadingSqlComments(statement);
  const match = /^CREATE(?:\s+OR\s+REPLACE)?\s+FUNCTION\s+(?:"public"|public)\.(?:"((?:[^"]|"")+)"|([A-Za-z_][A-Za-z0-9_$]*))\s*\(([\s\S]*?)\)\s+RETURNS\b/i
    .exec(definition);
  if (!match) return undefined;
  const functionName = (match[1] ?? match[2]).replaceAll('""', '"').toLowerCase();
  const parameterTypes = splitFunctionParameters(match[3]).map((parameter) => {
    const withoutDefault = normalizedSqlFragment(parameter)
      .replace(/\s+default\s+[\s\S]*$/i, "")
      .trim();
    return /(?:^|\s)(uuid|text|integer|smallint|bigint|timestamptz|jsonb|boolean)$/i
      .exec(withoutDefault)?.[1]?.toLowerCase() ?? withoutDefault;
  });
  return `public.${functionName}(${parameterTypes.join(",")})`;
}

const SENSITIVE_FLIGHT_CIPHERTEXT_OBJECTS = Object.freeze([
  "flight_offer_evidence_vault",
  "flight_order_response_evidence_vault",
  "flight_order_recovery_evidence_vault",
  "flight_secure_pii_records",
  "load_flight_offer_evidence_v1",
  "load_flight_secure_pii_record_v1",
  "load_flight_consumer_order_response_evidence_v1",
  "load_flight_consumer_duffel_order_recovery_evidence_v1",
  "load_flight_offer_evidence_for_terminal_recovery_v1",
]);

const APPROVED_SENSITIVE_FLIGHT_FUNCTIONS = new Set([
  "public.accept_flight_consumer_reprice_and_create_order_v1(uuid,uuid,text,text)",
  "public.bind_flight_offer_evidence_local_id_v1()",
  "public.claim_flight_consumer_duffel_order_attempt_v1(uuid,integer,text,text,text,text,text)",
  "public.claim_flight_consumer_duffel_order_attempt_pre092_v1(uuid,integer,text,text,text,text,text)",
  "public.complete_flight_consumer_reprice_v1(uuid,integer,text,text,text,text,bigint,bigint,timestamptz,jsonb)",
  "public.complete_flight_consumer_search_v1(uuid,integer,jsonb)",
  "public.finalize_flight_consumer_async_duffel_order_v1(uuid,uuid,uuid,text,text,text,timestamptz,timestamptz,jsonb,jsonb)",
  "public.finalize_flight_consumer_duffel_order_v1(uuid,integer,text,text,text,timestamptz,timestamptz,jsonb,jsonb)",
  "public.get_flight_consumer_async_duffel_convergence_v1(uuid,uuid,uuid)",
  "public.get_flight_consumer_duffel_order_recovery_v1(uuid,uuid)",
  "public.get_flight_consumer_duffel_recovery_evidence_observation_v1(uuid,uuid,uuid,text)",
  "public.get_flight_consumer_offer_evidence_context_v1(uuid,uuid,uuid,text)",
  "public.get_flight_offer_local_identity_for_terminal_recovery_v1(uuid,uuid,uuid,text,text)",
  "public.load_flight_consumer_duffel_order_recovery_evidence_v1(uuid,uuid,uuid,text)",
  "public.load_flight_consumer_order_response_evidence_v1(uuid,uuid,uuid,text)",
  "public.load_flight_offer_evidence_for_terminal_recovery_v1(uuid,uuid,uuid,text,text)",
  "public.load_flight_offer_evidence_v1(text,uuid,text)",
  "public.load_flight_secure_pii_record_v1(text,uuid,text)",
  "public.prepare_flight_consumer_checkout_v1(uuid,uuid,text,text,jsonb,text,text,text,timestamptz)",
  "public.prepare_flight_consumer_duffel_order_attempt_v1(uuid,text,text,text,text,text,text,text,text,text,timestamptz)",
  "public.prepare_flight_consumer_reprice_attempt_v1(uuid,uuid,text,text,text,text,text,text,text,text,timestamptz)",
  "public.purge_expired_flight_offer_evidence_v1(timestamptz)",
  "public.record_flight_consumer_capture_attestation_mismatch_v1(uuid,uuid,uuid,integer,text,text,text)",
  "public.record_flight_consumer_duffel_order_recovery_evidence_v1(uuid,uuid,uuid,uuid,text,text,text,text,text,text,text,text,text,text,text,timestamptz)",
  "public.record_flight_consumer_duffel_order_terminal_v1(uuid,integer,text,smallint,text,bigint,text,text,text,text,text,text,text,text,timestamptz)",
  "public.store_flight_offer_evidence_v1(uuid,uuid,uuid,text,text,text,timestamptz,timestamptz,text,text,text,text,text,text,text,text,text,text,text)",
  "public.store_flight_secure_pii_record_v1(text,uuid,uuid,text,text,text,text,timestamptz,text,text,text,text,text,text)",
  "public.tombstone_flight_secure_pii_record_v1(text,uuid,text)",
  "public.validate_flight_consumer_async_order_finalization_v1()",
  "public.validate_flight_consumer_async_system_resolution_v1()",
  "public.validate_flight_consumer_provider_attempt_link_v1()",
  "public.validate_flight_secure_pii_reference_v1()",
]);

function assertNoUnapprovedSensitiveCiphertextAccess(output) {
  for (const statement of topLevelSqlStatements(output)) {
    const definition = withoutLeadingSqlComments(statement);
    if (!/^CREATE(?:\s+OR\s+REPLACE)?\s+(?:FUNCTION|(?:MATERIALIZED\s+)?VIEW)\b/i
      .test(definition)) continue;
    const normalizedDefinition = definition.replaceAll('"', "").toLowerCase();
    const referencesSensitiveObject = SENSITIVE_FLIGHT_CIPHERTEXT_OBJECTS.some(
      (objectName) => new RegExp(
        `(?:^|[^a-z0-9_$])(?:public\\.)?${objectName}(?![a-z0-9_$])`,
        "i",
      ).test(normalizedDefinition),
    );
    if (!referencesSensitiveObject) continue;
    if (/^CREATE(?:\s+OR\s+REPLACE)?\s+(?:MATERIALIZED\s+)?VIEW\b/i.test(definition)) {
      throw new Error("The post-apply schema dump exposes a sensitive flight ciphertext view.");
    }
    const identity = sensitiveFunctionIdentity(statement);
    if (!identity || !APPROVED_SENSITIVE_FLIGHT_FUNCTIONS.has(identity)) {
      throw new Error(
        `The post-apply schema dump exposes an unapproved sensitive flight ciphertext function: ${identity ?? "unparseable"}.`,
      );
    }
  }
}

function functionBodySha256(value) {
  return createHash("sha256")
    .update(value.replace(/\r\n?/g, "\n"), "utf8")
    .digest("hex");
}

function functionBody(output, functionName) {
  const pattern = new RegExp(
    `^\\s*CREATE(?:\\s+OR\\s+REPLACE)?\\s+FUNCTION\\s+(?:"public"|public)\\.${identifierPattern(functionName)}\\s*\\([\\s\\S]*?\\)\\s+RETURNS\\s+[\\s\\S]*?\\bAS\\s+(\\$[A-Za-z0-9_]*\\$)([\\s\\S]*?)\\1\\s*;`,
    "im",
  );
  return pattern.exec(output)?.[2];
}

function functionDefinitionPrefix(output, functionName) {
  const pattern = new RegExp(
    `^\\s*(CREATE(?:\\s+OR\\s+REPLACE)?\\s+FUNCTION\\s+(?:"public"|public)\\.${identifierPattern(functionName)}\\s*\\([\\s\\S]*?\\)\\s+RETURNS\\s+[\\s\\S]*?\\bAS\\s+)\\$[A-Za-z0-9_]*\\$`,
    "im",
  );
  return pattern.exec(output)?.[1];
}

function occurrenceCount(value, fragment) {
  return value.split(fragment).length - 1;
}

function assertFunctionSignature(output, functionName, parameterTypes, returnContract) {
  const pattern = new RegExp(
    `^\\s*CREATE(?:\\s+OR\\s+REPLACE)?\\s+FUNCTION\\s+(?:"public"|public)\\.${identifierPattern(functionName)}\\s*\\(([\\s\\S]*?)\\)\\s+RETURNS\\s+([\\s\\S]*?)\\n\\s+LANGUAGE\\b`,
    "im",
  );
  const match = pattern.exec(output);
  if (!match) {
    throw new Error("The post-apply schema dump is missing a required flight function.");
  }
  const parameters = match[1].trim()
    ? match[1].split(",").map((parameter) => normalizedSqlFragment(
      parameter.replace(/\s+default\s+[\s\S]*$/i, ""),
    ))
    : [];
  if (
    parameters.length !== parameterTypes.length
    || parameters.some((parameter, index) => !parameter.endsWith(` ${parameterTypes[index]}`))
    || normalizedSqlFragment(match[2]) !== returnContract
  ) {
    throw new Error("The post-apply schema dump has an unexpected flight function signature.");
  }
}

function assertServiceRoleFunctionGrant(output, functionName, parameterTypes) {
  const normalizedSignature = normalizedSqlFragment(
    `public.${functionName}(${parameterTypes.join(",")})`,
  );
  const statements = normalizedSqlStatementEntries(output);
  const expectedPublicRevoke =
    `revoke all on function ${normalizedSignature}from public`;
  const publicRevokes = statements
    .filter((statement) => statement.normalized.startsWith(expectedPublicRevoke));
  if (
    publicRevokes.length !== 1
    || publicRevokes[0].normalized !== expectedPublicRevoke
    || !exactUnquotedPublicRevokee(publicRevokes[0])
  ) {
    throw new Error(
      `The post-apply schema dump does not prove the ${functionName} service-only PUBLIC revoke.`,
    );
  }
  const grants = statements
    .filter((statement) => statement.normalized.includes(
      ` on function ${normalizedSignature}to `,
    ));
  const escapedSignature = normalizedSignature.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const exactGrant = new RegExp(
    `^grant (?:execute|all) on function ${escapedSignature}to (postgres|service_role)( with grant option)?$`,
  );
  const parsedGrants = grants.map((statement) => Object.freeze({
    statement,
    grant: exactGrant.exec(statement.normalized),
  }));
  const serviceRoleGrants = parsedGrants.filter(({ grant }) => grant?.[1] === "service_role");
  const ownerGrants = parsedGrants.filter(({ grant }) => grant?.[1] === "postgres");
  if (
    parsedGrants.some(({ grant, statement }) => (
      !grant || !exactAclGrantee(statement, grant[1])
    ))
    || serviceRoleGrants.some(({ grant }) => Boolean(grant?.[2]))
    || serviceRoleGrants.length > 1
    || ownerGrants.length > 1
  ) {
    throw new Error(
      `The post-apply schema dump exposes a service-only flight function (${functionName}) to an unauthorized role or grant option.`,
    );
  }
  if (serviceRoleGrants.length !== 1) {
    throw new Error(
      `The post-apply schema dump is missing a required service-role function grant for ${functionName}.`,
    );
  }
}

function assertPinnedTerminalRecoveryFunctionAuthority(
  output,
  functionName,
  parameterTypes,
  migrationLabel,
) {
  const definitionPattern = new RegExp(
    `^\\s*CREATE(?:\\s+OR\\s+REPLACE)?\\s+FUNCTION\\s+(?:"public"|public)\\.${identifierPattern(functionName)}\\s*\\(`,
    "gim",
  );
  if ((output.match(definitionPattern) ?? []).length !== 1) {
    throw new Error(
      `The post-apply schema dump exposes a ${migrationLabel} terminal recovery sibling overload.`,
    );
  }

  const prefix = normalizedSqlFragment(
    functionDefinitionPrefix(output, functionName) ?? "",
  );
  const languageIndex = prefix.lastIndexOf("language ");
  const authorityMetadata = languageIndex >= 0
    ? prefix.slice(languageIndex)
    : "";
  const allowedMetadata = new Set([
    "language plpgsql security definer set search_path = pg_catalog,public,extensions as",
    "language plpgsql security definer set search_path to pg_catalog,public,extensions as",
    "language plpgsql security definer set search_path to 'pg_catalog','public','extensions' as",
  ]);
  if (!allowedMetadata.has(authorityMetadata)) {
    throw new Error(
      `The post-apply schema dump does not prove the ${migrationLabel} terminal recovery function authority metadata.`,
    );
  }

  const normalizedSignature = normalizedSqlFragment(
    `public.${functionName}(${parameterTypes.join(",")})`,
  );
  const statements = normalizedSqlStatementEntries(output);
  const normalizedNamePrefix = normalizedSqlFragment(`public.${functionName}(`);
  const siblingReferences = normalizedSqlStatements(output)
    .filter((statement) => (
      statement.startsWith(`alter function ${normalizedNamePrefix}`)
      || statement.startsWith(`comment on function ${normalizedNamePrefix}`)
      || statement.includes(` on function ${normalizedNamePrefix}`)
    ))
    .filter((statement) => !(
      statement.startsWith(`alter function ${normalizedSignature}`)
      || statement.startsWith(`comment on function ${normalizedSignature}`)
      || statement.includes(` on function ${normalizedSignature}`)
    ));
  if (siblingReferences.length > 0) {
    throw new Error(
      `The post-apply schema dump exposes ${migrationLabel} terminal recovery sibling-overload authority.`,
    );
  }
  const ownerStatements = statements
    .filter((statement) => statement.normalized.startsWith(
      `alter function ${normalizedSignature}owner to `,
    ));
  const expectedOwner = `alter function ${normalizedSignature}owner to postgres`;
  if (
    ownerStatements.length !== 1
    || ownerStatements[0].normalized !== expectedOwner
    || !exactAclGrantee(ownerStatements[0], "postgres")
  ) {
    throw new Error(
      `The post-apply schema dump does not prove the ${migrationLabel} terminal recovery function owner.`,
    );
  }

  const publicRevokes = statements
    .filter((statement) => statement.normalized.startsWith(
      `revoke all on function ${normalizedSignature}from public`,
    ));
  const expectedPublicRevoke =
    `revoke all on function ${normalizedSignature}from public`;
  if (
    publicRevokes.length !== 1
    || publicRevokes[0].normalized !== expectedPublicRevoke
    || !exactUnquotedPublicRevokee(publicRevokes[0])
  ) {
    throw new Error(
      `The post-apply schema dump does not prove the ${migrationLabel} terminal recovery function PUBLIC revoke.`,
    );
  }

  const grants = statements
    .filter((statement) => statement.normalized.includes(
      ` on function ${normalizedSignature}to `,
    ));
  const escapedSignature = normalizedSignature.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const exactGrant = new RegExp(
    `^grant (execute|all) on function ${escapedSignature}to (postgres|service_role)( with grant option)?$`,
  );
  const parsedGrants = grants.map((statement) => Object.freeze({
    statement,
    grant: exactGrant.exec(statement.normalized),
  }));
  const serviceRoleGrants = parsedGrants.filter(({ grant }) => grant?.[2] === "service_role");
  const ownerGrants = parsedGrants.filter(({ grant }) => grant?.[2] === "postgres");
  if (
    parsedGrants.some(({ grant, statement }) => (
      !grant || !exactAclGrantee(statement, grant[2])
    ))
    || serviceRoleGrants.length !== 1
    || serviceRoleGrants.some(({ grant }) => Boolean(grant?.[3]))
    || ownerGrants.length > 1
  ) {
    throw new Error(
      `The post-apply schema dump exposes the ${migrationLabel} terminal recovery function to an unauthorized role.`,
    );
  }
}

function assertPinnedCiphertextLoaderAuthority(output, functionName, parameterTypes) {
  const definitionPattern = new RegExp(
    `^\\s*CREATE(?:\\s+OR\\s+REPLACE)?\\s+FUNCTION\\s+(?:"public"|public)\\.${identifierPattern(functionName)}\\s*\\(`,
    "gim",
  );
  if ((output.match(definitionPattern) ?? []).length !== 1) {
    throw new Error(
      `The post-apply schema dump exposes a ${functionName} sibling overload.`,
    );
  }

  const prefix = normalizedSqlFragment(
    functionDefinitionPrefix(output, functionName) ?? "",
  );
  const languageIndex = prefix.lastIndexOf("language ");
  const authorityMetadata = languageIndex >= 0
    ? prefix.slice(languageIndex)
    : "";
  const allowedMetadata = new Set([
    "language plpgsql security definer set search_path = pg_catalog,public as",
    "language plpgsql security definer set search_path to pg_catalog,public as",
    "language plpgsql security definer set search_path to 'pg_catalog','public' as",
  ]);
  if (!allowedMetadata.has(authorityMetadata)) {
    throw new Error(
      `The post-apply schema dump does not prove ${functionName} authority metadata.`,
    );
  }

  const normalizedSignature = normalizedSqlFragment(
    `public.${functionName}(${parameterTypes.join(",")})`,
  );
  const statements = normalizedSqlStatementEntries(output);
  const normalizedNamePrefix = normalizedSqlFragment(`public.${functionName}(`);
  const siblingReferences = normalizedSqlStatements(output)
    .filter((statement) => (
      statement.startsWith(`alter function ${normalizedNamePrefix}`)
      || statement.startsWith(`comment on function ${normalizedNamePrefix}`)
      || statement.includes(` on function ${normalizedNamePrefix}`)
    ))
    .filter((statement) => !(
      statement.startsWith(`alter function ${normalizedSignature}`)
      || statement.startsWith(`comment on function ${normalizedSignature}`)
      || statement.includes(` on function ${normalizedSignature}`)
    ));
  if (siblingReferences.length > 0) {
    throw new Error(
      `The post-apply schema dump exposes ${functionName} sibling-overload authority.`,
    );
  }

  const ownerStatements = statements
    .filter((statement) => statement.normalized.startsWith(
      `alter function ${normalizedSignature}owner to `,
    ));
  if (
    ownerStatements.length !== 1
    || ownerStatements[0].normalized
      !== `alter function ${normalizedSignature}owner to postgres`
    || !exactAclGrantee(ownerStatements[0], "postgres")
  ) {
    throw new Error(`The post-apply schema dump does not prove ${functionName} ownership.`);
  }

  const publicRevokes = statements
    .filter((statement) => statement.normalized.startsWith(
      `revoke all on function ${normalizedSignature}from public`,
    ));
  if (
    publicRevokes.length !== 1
    || publicRevokes[0].normalized
      !== `revoke all on function ${normalizedSignature}from public`
    || !exactUnquotedPublicRevokee(publicRevokes[0])
  ) {
    throw new Error(`The post-apply schema dump does not prove ${functionName} PUBLIC revoke.`);
  }

  const grants = statements
    .filter((statement) => statement.normalized.includes(
      ` on function ${normalizedSignature}to `,
    ));
  const escapedSignature = normalizedSignature.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const exactServiceRoleGrant = new RegExp(
    `^grant (?:execute|all) on function ${escapedSignature}to service_role$`,
  );
  if (
    grants.length !== 1
    || !exactServiceRoleGrant.test(grants[0].normalized)
    || !exactAclGrantee(grants[0], "service_role")
  ) {
    throw new Error(
      `The post-apply schema dump exposes ${functionName} to an unauthorized role or grant option.`,
    );
  }
}

function assertNoRuntimeFunctionGrant(output, functionName, parameterTypes) {
  const normalizedSignature = normalizedSqlFragment(
    `public.${functionName}(${parameterTypes.join(",")})`,
  );
  const statements = normalizedSqlStatementEntries(output);
  const expectedPublicRevoke =
    `revoke all on function ${normalizedSignature}from public`;
  const publicRevokes = statements
    .filter((statement) => statement.normalized.startsWith(expectedPublicRevoke));
  if (
    publicRevokes.length !== 1
    || publicRevokes[0].normalized !== expectedPublicRevoke
    || !exactUnquotedPublicRevokee(publicRevokes[0])
  ) {
    throw new Error(
      `The post-apply schema dump does not prove the ${functionName} internal-projector PUBLIC revoke.`,
    );
  }
  const grants = statements
    .filter((statement) => statement.normalized.includes(
      ` on function ${normalizedSignature}to `,
    ));
  if (grants.length !== 0) {
    throw new Error("The post-apply schema dump exposes an internal flight projector.");
  }
}

function assertNoDirectTableGrant(output, table) {
  const tableGrant = new RegExp(
    `\\bGRANT\\s+[\\s\\S]*?\\s+ON(?:\\s+TABLE)?\\s+(?:"public"|public)\\.${identifierPattern(table)}\\s+TO\\s+`,
    "i",
  );
  if (tableGrant.test(output)) {
    throw new Error("The post-apply schema dump exposes a service-owned flight evidence table.");
  }
}

function assertPinnedTableOwner(output, table) {
  const normalizedTable = normalizedSqlFragment(`public.${table}`);
  const ownerPattern = new RegExp(
    `^alter table(?: only)? ${normalizedTable.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} owner to (.+)$`,
  );
  const ownerStatements = normalizedSqlStatementEntries(output)
    .flatMap((statement) => {
      const match = ownerPattern.exec(statement.normalized);
      return match ? [Object.freeze({ role: match[1], statement })] : [];
    });
  if (
    ownerStatements.length !== 1
    || ownerStatements[0].role !== "postgres"
    || !exactAclGrantee(ownerStatements[0].statement, "postgres")
  ) {
    throw new Error(
      `The post-apply schema dump does not prove postgres ownership of ${table}.`,
    );
  }
}

export function assertFlightSchemaDump(output) {
  const requiredTables = [
    "flight_runtime_controls",
    "flight_provider_request_attempts",
    "flight_offer_evidence_vault",
    "flight_secure_pii_records",
    "flight_payment_operation_attempts",
    "flight_order_response_evidence_vault",
    "flight_consumer_webhook_ledger",
    "flight_payment_state_observations",
    "flight_payment_refund_evidence",
    "flight_order_recovery_evidence_vault",
    "flight_consumer_notification_outbox_receipts",
    "flight_reconciliation_cases",
    "flight_service_requests",
    "flight_consumer_duffel_webhook_pending_links",
    "flight_consumer_duffel_webhook_pending_link_resolutions",
    "flight_consumer_completion_leases",
  ];

  for (const table of requiredTables) {
    if (!tableDefinition(output, table)) {
      throw new Error("The post-apply schema dump is missing a required flight table.");
    }
  }

  const controls = tableDefinition(output, "flight_runtime_controls");
  assertTableColumn(controls, "flight_runtime_controls", "control_key", "text", ["not null"]);
  assertTableColumn(controls, "flight_runtime_controls", "execution_kill_switch_engaged", "boolean", ["default true", "not null"]);
  assertTableColumn(controls, "flight_runtime_controls", "provider_sandbox_traffic_enabled", "boolean", ["default false", "not null"]);
  assertTableColumn(controls, "flight_runtime_controls", "shopping_enabled", "boolean", ["default false", "not null"]);
  assertTableColumn(controls, "flight_runtime_controls", "production_release_enabled", "boolean", ["default false", "not null"]);
  assertTableColumn(controls, "flight_runtime_controls", "bound_project_ref", "text");
  assertTableColumn(controls, "flight_runtime_controls", "activation_evidence_sha256", "text");
  assertTableColumn(controls, "flight_runtime_controls", "bound_provider_settlement_processor_code", "text");
  assertTableColumn(controls, "flight_runtime_controls", "bound_provider_settlement_account_sha256", "text");
  assertTableColumn(controls, "flight_runtime_controls", "bound_provider_settlement_environment", "text");
  assertTableColumn(controls, "flight_runtime_controls", "bound_provider_settlement_source_sha256", "text");
  assertTableColumn(controls, "flight_runtime_controls", "bound_provider_settlement_adapter_version_sha256", "text");

  const attempts = tableDefinition(output, "flight_provider_request_attempts");
  for (const column of [
    "tenant_id",
    "commerce_id",
    "operation",
    "execution_mode",
    "request_sha256",
    "terminal_receipt_sha256",
  ]) {
    assertTableColumn(attempts, "flight_provider_request_attempts", column, "text");
  }
  assertTableColumn(attempts, "flight_provider_request_attempts", "id", "uuid", ["not null"]);
  assertTableColumn(attempts, "flight_provider_request_attempts", "dispatch_not_after", "(?:timestamptz|timestamp\\s+with\\s+time\\s+zone)", ["not null"]);
  assertTableColumn(attempts, "flight_provider_request_attempts", "state", "text", ["default 'prepared'", "not null"]);
  assertTableColumn(attempts, "flight_provider_request_attempts", "revision", "integer", ["default 0", "not null"]);
  assertTableColumn(attempts, "flight_provider_request_attempts", "retry_authorized", "boolean", ["default false", "not null"]);

  const paymentAttempts = tableDefinition(output, "flight_payment_operation_attempts");
  assertTableColumn(paymentAttempts, "flight_payment_operation_attempts", "id", "uuid", ["not null"]);
  assertTableColumn(paymentAttempts, "flight_payment_operation_attempts", "order_id", "uuid", ["not null"]);
  assertTableColumn(paymentAttempts, "flight_payment_operation_attempts", "operation", "text", ["not null"]);
  assertTableColumn(paymentAttempts, "flight_payment_operation_attempts", "execution_mode", "text", ["not null"]);
  assertTableColumn(paymentAttempts, "flight_payment_operation_attempts", "dispatch_not_after", "(?:timestamptz|timestamp\\s+with\\s+time\\s+zone)", ["not null"]);
  assertTableColumn(paymentAttempts, "flight_payment_operation_attempts", "state", "text", ["default 'prepared'", "not null"]);
  assertTableColumn(paymentAttempts, "flight_payment_operation_attempts", "revision", "integer", ["default 0", "not null"]);

  const responseVault = tableDefinition(output, "flight_order_response_evidence_vault");
  assertTableColumn(responseVault, "flight_order_response_evidence_vault", "ciphertext_base64url", "text", ["not null"]);
  assertTableColumn(responseVault, "flight_order_response_evidence_vault", "evidence_receipt_sha256", "text", ["not null"]);

  const recoveryVault = tableDefinition(output, "flight_order_recovery_evidence_vault");
  assertTableColumn(recoveryVault, "flight_order_recovery_evidence_vault", "ledger_id", "uuid", ["not null"]);
  assertTableColumn(recoveryVault, "flight_order_recovery_evidence_vault", "recovery_evidence_receipt_sha256", "text", ["not null"]);
  assertTableColumn(recoveryVault, "flight_order_recovery_evidence_vault", "ciphertext_base64url", "text", ["not null"]);

  const notificationReceipts = tableDefinition(output, "flight_consumer_notification_outbox_receipts");
  assertTableColumn(notificationReceipts, "flight_consumer_notification_outbox_receipts", "email_outbox_id", "uuid", ["not null"]);
  assertTableColumn(notificationReceipts, "flight_consumer_notification_outbox_receipts", "trusted_evidence_receipt_sha256", "text", ["not null"]);

  const reconciliationCases = tableDefinition(output, "flight_reconciliation_cases");
  assertTableColumn(reconciliationCases, "flight_reconciliation_cases", "resolution_actor_type", "text", ["default 'administrator'", "not null"]);
  assertTableColumn(reconciliationCases, "flight_reconciliation_cases", "system_resolution_receipt_sha256", "text");

  const serviceRequests = tableDefinition(output, "flight_service_requests");
  assertTableColumn(serviceRequests, "flight_service_requests", "order_id", "uuid", ["not null"]);
  assertTableColumn(serviceRequests, "flight_service_requests", "requested_by", "uuid", ["not null"]);
  assertTableColumn(serviceRequests, "flight_service_requests", "request_type", "text", ["not null"]);
  assertTableColumn(serviceRequests, "flight_service_requests", "reason_code", "text", ["not null"]);
  assertTableColumn(serviceRequests, "flight_service_requests", "request_sha256", "text", ["not null"]);
  assertTableColumn(serviceRequests, "flight_service_requests", "status", "text", ["default 'requested'", "not null"]);

  const pendingWebhookLinks = tableDefinition(
    output,
    "flight_consumer_duffel_webhook_pending_links",
  );
  for (const column of [
    "ledger_id", "order_id", "customer_id", "payment_id", "provider_attempt_id",
  ]) {
    assertTableColumn(
      pendingWebhookLinks,
      "flight_consumer_duffel_webhook_pending_links",
      column,
      "uuid",
      ["not null"],
    );
  }
  for (const column of [
    "execution_scope_sha256", "provider_offer_ref_sha256",
    "provider_order_ref_sha256", "association_receipt_sha256",
  ]) {
    assertTableColumn(
      pendingWebhookLinks,
      "flight_consumer_duffel_webhook_pending_links",
      column,
      "text",
      ["not null"],
    );
  }

  const pendingWebhookResolutions = tableDefinition(
    output,
    "flight_consumer_duffel_webhook_pending_link_resolutions",
  );
  for (const column of ["pending_link_id", "ledger_id"]) {
    assertTableColumn(
      pendingWebhookResolutions,
      "flight_consumer_duffel_webhook_pending_link_resolutions",
      column,
      "uuid",
      ["not null"],
    );
  }
  for (const column of [
    "outcome", "attempt_terminal_state", "attempt_terminal_receipt_sha256",
    "resolution_receipt_sha256",
  ]) {
    assertTableColumn(
      pendingWebhookResolutions,
      "flight_consumer_duffel_webhook_pending_link_resolutions",
      column,
      "text",
      ["not null"],
    );
  }
  assertTableColumn(
    pendingWebhookResolutions,
    "flight_consumer_duffel_webhook_pending_link_resolutions",
    "attempt_terminal_revision",
    "integer",
    ["not null"],
  );

  const completionLeases = tableDefinition(output, "flight_consumer_completion_leases");
  assertTableColumn(completionLeases, "flight_consumer_completion_leases", "order_id", "uuid", ["not null"]);
  assertTableColumn(completionLeases, "flight_consumer_completion_leases", "customer_id", "uuid", ["not null"]);
  for (const column of [
    "execution_scope_sha256", "idempotency_key_sha256", "request_sha256", "lease_state",
  ]) {
    assertTableColumn(
      completionLeases,
      "flight_consumer_completion_leases",
      column,
      "text",
      ["not null"],
    );
  }
  assertTableColumn(completionLeases, "flight_consumer_completion_leases", "lease_revision", "integer", ["default 0", "not null"]);
  assertTableColumn(completionLeases, "flight_consumer_completion_leases", "lease_token_sha256", "text");
  assertTableColumn(completionLeases, "flight_consumer_completion_leases", "outcome_sha256", "text");
  assertTableColumn(completionLeases, "flight_consumer_completion_leases", "result_order_status", "text");
  assertTableColumn(completionLeases, "flight_consumer_completion_leases", "result_issued_ticket_count", "integer");

  assertFunctionSignature(
    output,
    "flight_runtime_capability_enabled",
    ["text", "text", "text", "text", "text"],
    "boolean",
  );
  assertFunctionSignature(
    output,
    "prepare_flight_provider_request_attempt",
    [...Array(17).fill("text"), "timestamptz"],
    "table(attempt_id uuid,attempt_revision integer,attempt_state text)",
  );
  assertFunctionSignature(
    output,
    "complete_flight_consumer_payment_intent_v1",
    ["uuid", "integer", "text", "smallint", "text", "bigint", "text", "text", "text"],
    "table(decision text,attempt_id uuid,attempt_revision integer,attempt_state text,payment_id uuid,payment_status text)",
  );
  assertFunctionSignature(
    output,
    "complete_flight_consumer_search_v1",
    ["uuid", "integer", "jsonb"],
    "table(decision text,search_id uuid,search_status text,offer_count integer,offer_ids uuid[])",
  );
  assertFunctionSignature(
    output,
    "fail_flight_consumer_search_v1",
    ["uuid", "integer"],
    "table(search_id uuid,search_status text)",
  );
  assertFunctionSignature(
    output,
    "complete_flight_consumer_reprice_v1",
    [
      "uuid", "integer", "text", "text", "text", "text", "bigint", "bigint",
      "timestamptz", "jsonb",
    ],
    "table(decision text,reprice_receipt_id uuid,reprice_status text,acceptance_required boolean,evidence_receipt_sha256 text)",
  );
  assertFunctionSignature(
    output,
    "fail_flight_consumer_reprice_v1",
    ["uuid", "integer"],
    "table(offer_id uuid,terminal_state text,idempotency_status text)",
  );
  assertFunctionSignature(
    output,
    "get_flight_consumer_duffel_order_recovery_v1",
    ["uuid", "uuid"],
    "table(attempt_id uuid,customer_id uuid,order_id uuid,attempt_revision integer,attempt_state text,request_sha256 text,operation_authority_receipt_sha256 text,terminal_http_status smallint,terminal_response_sha256 text,terminal_response_bytes bigint,terminal_receipt_sha256 text,dispatch_not_after timestamptz,evidence_available boolean,response_evidence_receipt_sha256 text,response_evidence_retention_expires_at timestamptz)",
  );
  assertFunctionSignature(
    output,
    "load_flight_offer_evidence_v1",
    ["text", "uuid", "text"],
    "table(evidence_id uuid,customer_id uuid,search_id uuid,offer_id uuid,stage text,predecessor_receipt_sha256 text,observed_at timestamptz,retention_expires_at timestamptz,raw_body_sha256 text,evidence_sha256 text,snapshot_sha256 text,record_sha256 text,receipt_sha256 text,key_version text,iv_base64url text,auth_tag_base64url text,ciphertext_base64url text,aad_sha256 text,record_hmac_sha256 text)",
  );
  assertFunctionSignature(
    output,
    "load_flight_secure_pii_record_v1",
    ["text", "uuid", "text"],
    "table(secure_pii_record_ref text,customer_id uuid,order_id uuid,execution_scope_sha256 text,traveler_type text,pii_record_sha256 text,pii_authority_receipt_sha256 text,retention_expires_at timestamptz,key_version text,iv_base64url text,auth_tag_base64url text,ciphertext_base64url text,aad_sha256 text,pii_hmac_sha256 text)",
  );
  assertFunctionSignature(
    output,
    "load_flight_consumer_order_response_evidence_v1",
    ["uuid", "uuid", "uuid", "text"],
    "table(evidence_id uuid,attempt_id uuid,order_id uuid,customer_id uuid,execution_scope_sha256 text,provider_response_sha256 text,evidence_receipt_sha256 text,key_version text,iv_base64url text,auth_tag_base64url text,ciphertext_base64url text,aad_sha256 text,ciphertext_sha256 text,retention_expires_at timestamptz)",
  );
  assertFunctionSignature(
    output,
    "load_flight_consumer_duffel_order_recovery_evidence_v1",
    ["uuid", "uuid", "uuid", "text"],
    "table(evidence_id uuid,ledger_id uuid,attempt_id uuid,order_id uuid,customer_id uuid,execution_scope_sha256 text,provider_offer_ref_sha256 text,provider_order_ref_sha256 text,recovery_request_sha256 text,provider_response_sha256 text,webhook_verification_receipt_sha256 text,recovery_authority_receipt_sha256 text,recovery_evidence_receipt_sha256 text,key_version text,iv_base64url text,auth_tag_base64url text,ciphertext_base64url text,aad_sha256 text,ciphertext_sha256 text,retention_expires_at timestamptz)",
  );
  assertFunctionSignature(
    output,
    "finalize_flight_consumer_duffel_order_v1",
    ["uuid", "integer", "text", "text", "text", "timestamptz", "timestamptz", "jsonb", "jsonb"],
    "table(order_id uuid,order_status text,issued_ticket_count integer)",
  );
  assertFunctionSignature(
    output,
    "complete_flight_consumer_duffel_recovery_evidence_v1",
    [
      "uuid", "uuid", "uuid", "uuid", "integer", "text", "text", "text", "text",
      "text", "text", "text", "text", "text", "text", "text", "text", "text",
      "timestamptz",
    ],
    "table(ledger_id uuid,ledger_revision integer,ledger_state text,evidence_id uuid,recovery_evidence_receipt_sha256 text,retention_expires_at timestamptz)",
  );
  assertFunctionSignature(
    output,
    "get_flight_consumer_async_duffel_convergence_v1",
    ["uuid", "uuid", "uuid"],
    "table(order_id uuid,customer_id uuid,order_status text,execution_scope_sha256 text,provider_attempt_id uuid,provider_attempt_state text,provider_attempt_revision integer,ledger_id uuid,ledger_state text,ledger_revision integer,provider_offer_ref_sha256 text,provider_order_ref_sha256 text,recovery_evidence_receipt_sha256 text,recovery_retention_expires_at timestamptz,reconciliation_case_id uuid,reconciliation_case_status text,reconciliation_resolution_code text,reconciliation_resolution_actor_type text,reconciliation_system_receipt_sha256 text,reconciliation_updated_at timestamptz,issued_ticket_count integer)",
  );
  assertFunctionSignature(
    output,
    "finalize_flight_consumer_async_duffel_order_v1",
    ["uuid", "uuid", "uuid", "text", "text", "text", "timestamptz", "timestamptz", "jsonb", "jsonb"],
    "table(order_id uuid,order_status text,issued_ticket_count integer,reconciliation_case_id uuid)",
  );
  assertFunctionSignature(
    output,
    "queue_flight_consumer_notification_v1",
    ["uuid", "uuid", "text", "uuid", "text", "text", "text", "text", "text", "text", "text"],
    "table(decision text,email_outbox_id uuid)",
  );
  assertFunctionSignature(
    output,
    "create_flight_consumer_preview_service_request_v1",
    ["uuid", "text", "text", "text"],
    "table(decision text,service_request_id uuid,order_id uuid,request_type text,reason_code text,request_status text,created_at timestamptz,updated_at timestamptz)",
  );
  assertFunctionSignature(
    output,
    "get_flight_consumer_preview_activation_preflight_v1",
    ["text"],
    "table(version text,ready boolean,control_key text,expected_updated_at timestamptz,expected_execution_scope_sha256 text,expected_activation_evidence_sha256 text,expected_runtime_control_receipt_sha256 text,target_execution_scope_sha256 text,activation_manifest_sha256 text)",
  );
  assertFunctionSignature(
    output,
    "activate_flight_consumer_preview_v1",
    ["timestamptz", "text", "text", "text", "text", "text", "text"],
    "table(decision text,control_key text,updated_at timestamptz,bound_execution_scope_sha256 text,activation_evidence_sha256 text,runtime_control_receipt_sha256 text)",
  );
  const serviceOnlyFunctions = [
    [
      "complete_flight_consumer_payment_operation_v1",
      ["uuid", "integer", "text", "smallint", "text", "bigint", "text"],
      "table(attempt_id uuid,attempt_revision integer,attempt_state text)",
    ],
    [
      "claim_flight_consumer_duffel_order_attempt_v1",
      ["uuid", "integer", "text", "text", "text", "text", "text"],
      "table(attempt_id uuid,attempt_revision integer,attempt_state text)",
    ],
    [
      "get_flight_consumer_duffel_order_recovery_v1",
      ["uuid", "uuid"],
      "table(attempt_id uuid,customer_id uuid,order_id uuid,attempt_revision integer,attempt_state text,request_sha256 text,operation_authority_receipt_sha256 text,terminal_http_status smallint,terminal_response_sha256 text,terminal_response_bytes bigint,terminal_receipt_sha256 text,dispatch_not_after timestamptz,evidence_available boolean,response_evidence_receipt_sha256 text,response_evidence_retention_expires_at timestamptz)",
    ],
    [
      "enqueue_flight_consumer_duffel_pending_webhook_link_v1",
      ["uuid", "integer", "text", "text"],
      "table(pending_link_id uuid,pending_revision integer,pending_state text)",
    ],
    [
      "resolve_flight_consumer_duffel_pending_webhook_link_v1",
      ["uuid", "integer"],
      "table(pending_link_id uuid,pending_revision integer,pending_state text,order_id uuid,customer_id uuid,provider_attempt_id uuid,order_status text,execution_scope_sha256 text)",
    ],
    [
      "resolve_flight_consumer_duffel_pending_links_for_attempt_v1",
      ["uuid", "integer", "integer"],
      "table(pending_link_id uuid,pending_revision integer,pending_state text,order_id uuid,customer_id uuid,provider_attempt_id uuid,order_status text,execution_scope_sha256 text)",
    ],
    [
      "acquire_flight_consumer_completion_lease_v1",
      ["uuid", "uuid", "text", "text", "text", "text", "integer"],
      "table(decision text,lease_revision integer,lease_state text,lease_token_sha256 text,lease_expires_at timestamptz,order_status text,issued_ticket_count integer,provider_attempt_state text,provider_attempt_revision integer,payment_attempt_state text,payment_attempt_revision integer,provider_redispatch_authorized boolean)",
    ],
    [
      "heartbeat_flight_consumer_completion_lease_v1",
      ["uuid", "integer", "text", "integer"],
      "table(decision text,lease_revision integer,lease_state text,lease_expires_at timestamptz,order_status text,issued_ticket_count integer)",
    ],
    [
      "complete_flight_consumer_completion_lease_v1",
      ["uuid", "integer", "text", "text", "integer"],
      "table(decision text,lease_revision integer,lease_state text,lease_expires_at timestamptz,order_status text,issued_ticket_count integer)",
    ],
    [
      "release_flight_consumer_completion_lease_v1",
      ["uuid", "integer", "text", "text"],
      "table(decision text,lease_revision integer,lease_state text,lease_expires_at timestamptz,order_status text,issued_ticket_count integer)",
    ],
    [
      "recover_flight_consumer_completion_lease_v1",
      ["uuid", "uuid", "text", "text", "integer"],
      "table(decision text,lease_revision integer,lease_state text,lease_token_sha256 text,lease_expires_at timestamptz,request_sha256 text,order_status text,issued_ticket_count integer,provider_attempt_state text,provider_attempt_revision integer,payment_attempt_state text,payment_attempt_revision integer,provider_redispatch_authorized boolean)",
    ],
    [
      "load_flight_offer_evidence_for_terminal_recovery_v1",
      ["uuid", "uuid", "uuid", "text", "text"],
      "table(evidence_id uuid,customer_id uuid,search_id uuid,offer_id uuid,stage text,predecessor_receipt_sha256 text,observed_at timestamptz,retention_expires_at timestamptz,raw_body_sha256 text,evidence_sha256 text,snapshot_sha256 text,record_sha256 text,receipt_sha256 text,key_version text,iv_base64url text,auth_tag_base64url text,ciphertext_base64url text,aad_sha256 text,record_hmac_sha256 text)",
    ],
    [
      "get_flight_offer_local_identity_for_terminal_recovery_v1",
      ["uuid", "uuid", "uuid", "text", "text"],
      "table(local_offer_id text)",
    ],
    [
      "get_flight_consumer_duffel_recovery_evidence_observation_v1",
      ["uuid", "uuid", "uuid", "text"],
      "table(created_at timestamptz)",
    ],
    [
      "record_flight_consumer_capture_attestation_mismatch_v1",
      ["uuid", "uuid", "uuid", "integer", "text", "text", "text"],
      "table(order_id uuid,order_status text,payment_id uuid,payment_status text,reconciliation_case_id uuid)",
    ],
  ];
  const strictlyPinnedTerminalRecoveryFunctions = new Set([
    "load_flight_offer_evidence_for_terminal_recovery_v1",
    "get_flight_offer_local_identity_for_terminal_recovery_v1",
  ]);
  for (const [functionName, parameterTypes, returnContract] of serviceOnlyFunctions) {
    assertFunctionSignature(output, functionName, parameterTypes, returnContract);
    if (!strictlyPinnedTerminalRecoveryFunctions.has(functionName)) {
      assertServiceRoleFunctionGrant(output, functionName, parameterTypes);
    }
  }
  assertPinnedTerminalRecoveryFunctionAuthority(
    output,
    "load_flight_offer_evidence_for_terminal_recovery_v1",
    ["uuid", "uuid", "uuid", "text", "text"],
    "migration-136",
  );
  assertPinnedTerminalRecoveryFunctionAuthority(
    output,
    "get_flight_offer_local_identity_for_terminal_recovery_v1",
    ["uuid", "uuid", "uuid", "text", "text"],
    "migration-137",
  );
  for (const [functionName, parameterTypes] of [
    ["load_flight_offer_evidence_v1", ["text", "uuid", "text"]],
    ["load_flight_secure_pii_record_v1", ["text", "uuid", "text"]],
    [
      "load_flight_consumer_order_response_evidence_v1",
      ["uuid", "uuid", "uuid", "text"],
    ],
    [
      "load_flight_consumer_duffel_order_recovery_evidence_v1",
      ["uuid", "uuid", "uuid", "text"],
    ],
  ]) {
    assertPinnedCiphertextLoaderAuthority(output, functionName, parameterTypes);
  }
  assertNoUnapprovedSensitiveCiphertextAccess(output);
  assertFunctionSignature(
    output,
    "ensure_flight_consumer_capture_review_case_092",
    ["uuid"],
    "uuid",
  );
  assertNoRuntimeFunctionGrant(
    output,
    "ensure_flight_consumer_capture_review_case_092",
    ["uuid"],
  );
  assertFunctionSignature(
    output,
    "claim_flight_consumer_duffel_order_attempt_pre092_v1",
    ["uuid", "integer", "text", "text", "text", "text", "text"],
    "table(attempt_id uuid,attempt_revision integer,attempt_state text)",
  );
  assertNoRuntimeFunctionGrant(
    output,
    "claim_flight_consumer_duffel_order_attempt_pre092_v1",
    ["uuid", "integer", "text", "text", "text", "text", "text"],
  );
  for (const table of [
    "flight_offer_evidence_vault",
    "flight_order_response_evidence_vault",
    "flight_order_recovery_evidence_vault",
    "flight_secure_pii_records",
    "flight_consumer_duffel_webhook_pending_links",
    "flight_consumer_duffel_webhook_pending_link_resolutions",
    "flight_consumer_completion_leases",
  ]) {
    assertNoDirectTableGrant(output, table);
  }
  for (const table of [
    "flight_offer_evidence_vault",
    "flight_order_response_evidence_vault",
    "flight_order_recovery_evidence_vault",
    "flight_secure_pii_records",
  ]) {
    assertPinnedTableOwner(output, table);
  }
  const runtimeControlGrant = new RegExp(
    `\\bGRANT\\s+([\\s\\S]*?)\\s+ON(?:\\s+TABLE)?\\s+(?:"public"|public)\\.${identifierPattern("flight_runtime_controls")}\\b`,
    "i",
  );
  const runtimeControlGrants = output.split(";").flatMap((statement) => {
    const match = runtimeControlGrant.exec(statement);
    return match ? [match[1].replace(/\\s+/g, " ").trim().toUpperCase()] : [];
  });
  if (runtimeControlGrants.some((privileges) => privileges !== "SELECT")) {
    throw new Error("The post-apply schema dump exposes direct runtime-control mutation authority.");
  }
  const runtimeControlPolicies = output.split(";").filter((statement) => (
    /\bCREATE\s+POLICY\b/i.test(statement)
    && new RegExp(
      `\\bON\\s+(?:"public"|public)\\.${identifierPattern("flight_runtime_controls")}\\b`,
      "i",
    ).test(statement)
  ));
  if (runtimeControlPolicies.some((statement) => !/\bFOR\s+SELECT\b/i.test(statement))) {
    throw new Error("The post-apply schema dump exposes a non-read runtime-control policy.");
  }
  const normalizedDump = normalizedSqlFragment(output);
  const captureTerminalBody = normalizedSqlFragment(functionBody(
    output,
    "complete_flight_consumer_payment_operation_v1",
  ) ?? "");
  const orderClaimBody = normalizedSqlFragment(functionBody(
    output,
    "claim_flight_consumer_duffel_order_attempt_v1",
  ) ?? "");
  const privateOrderClaimBody = normalizedSqlFragment(functionBody(
    output,
    "claim_flight_consumer_duffel_order_attempt_pre092_v1",
  ) ?? "");
  const orderRecoveryBody = normalizedSqlFragment(functionBody(
    output,
    "get_flight_consumer_duffel_order_recovery_v1",
  ) ?? "");
  const captureReviewProjectorBody = normalizedSqlFragment(functionBody(
    output,
    "ensure_flight_consumer_capture_review_case_092",
  ) ?? "");
  if (
    !captureTerminalBody.includes("ensure_flight_consumer_capture_review_case_092")
    || !captureReviewProjectorBody.includes("insert into public.flight_reconciliation_cases")
    || !orderClaimBody.includes("reconciliation.status <> 'resolved'")
    || !orderClaimBody.includes("active flight reconciliation blocks duffel dispatch")
    || !orderRecoveryBody.includes("if v_attempt.state in('prepared','dispatching')then")
    || !orderRecoveryBody.includes("v_evidence_available")
  ) {
    throw new Error(
      "The post-apply schema dump does not prove the migration-131 terminal recovery safety boundary.",
    );
  }
  if (
    !privateOrderClaimBody.includes("#variable_conflict error")
    || privateOrderClaimBody.includes("evidence.deleted_at")
    || !privateOrderClaimBody.includes("evidence.retention_expires_at > v_now")
    || !privateOrderClaimBody.includes("evidence.reprice_receipt_id = v_order.reprice_receipt_id")
    || !privateOrderClaimBody.includes("evidence.stage = 'refreshed'")
    || !orderClaimBody.includes("claim_flight_consumer_duffel_order_attempt_pre092_v1")
  ) {
    throw new Error(
      "The post-apply schema dump does not prove the migration-134 Duffel claim evidence-column repair.",
    );
  }
  const captureAttestationProjectorBody = normalizedSqlFragment(functionBody(
    output,
    "record_flight_consumer_capture_attestation_mismatch_v1",
  ) ?? "");
  const captureAttestationOrderLockIndex = captureAttestationProjectorBody.indexOf(
    "select * into v_order from public.flight_orders as flight_order where flight_order.id = v_order_id for update",
  );
  const captureAttestationAttemptLockIndex = captureAttestationProjectorBody.indexOf(
    "select * into v_attempt from public.flight_payment_operation_attempts as attempt where attempt.id = p_capture_attempt_id for update",
  );
  const captureAttestationPaymentLockIndex = captureAttestationProjectorBody.indexOf(
    "select * into v_payment from public.flight_payments as payment where payment.id = v_payment_id and payment.order_id = v_order_id for update",
  );
  if (
    captureAttestationOrderLockIndex < 0
    || captureAttestationAttemptLockIndex <= captureAttestationOrderLockIndex
    || captureAttestationPaymentLockIndex <= captureAttestationAttemptLockIndex
    || !captureAttestationProjectorBody.includes("coalesce(auth.role(),'')<> 'service_role'")
    || !captureAttestationProjectorBody.includes("p_expected_capture_revision <> 2")
    || !captureAttestationProjectorBody.includes(
      "p_mismatch_reason not in('payment_intent_mismatch','latest_charge_mismatch','refund_observed','dispute_observed','capture_state_mismatch','historical_binding_mismatch')",
    )
    || !captureAttestationProjectorBody.includes("v_order.provider_order_ref_ciphertext is not null")
    || !captureAttestationProjectorBody.includes("v_attempt.state <> 'succeeded'")
    || !captureAttestationProjectorBody.includes("v_attempt.revision <> p_expected_capture_revision")
    || !captureAttestationProjectorBody.includes("v_attempt.terminal_receipt_sha256 is null")
    || !captureAttestationProjectorBody.includes(
      "v_payment.processor_reference_sha256 is distinct from p_processor_reference_sha256",
    )
    || !captureAttestationProjectorBody.includes(
      "perform public.assert_flight_consumer_preview_runtime_v1(v_order.execution_scope_sha256,'order')",
    )
    || !captureAttestationProjectorBody.includes(
      "perform public.assert_flight_consumer_preview_runtime_v1(v_order.execution_scope_sha256,'payment')",
    )
    || !captureAttestationProjectorBody.includes("immutable flight provider success controls terminal replay")
    || !captureAttestationProjectorBody.includes("reconciliation.case_type = 'payment_order_mismatch'")
    || !captureAttestationProjectorBody.includes("insert into public.flight_reconciliation_cases")
    || !captureAttestationProjectorBody.includes("set status = 'requires_review'")
    || !captureAttestationProjectorBody.includes("set status = 'ambiguous'")
  ) {
    throw new Error(
      "The post-apply schema dump does not prove the migration-132 capture attestation boundary.",
    );
  }
  const completionLeaseQualificationContracts = [
    ["acquire_flight_consumer_completion_lease_v1", 2, 2, 2, 1, 0],
    ["heartbeat_flight_consumer_completion_lease_v1", 1, 1, 1, 1, 1],
    ["complete_flight_consumer_completion_lease_v1", 1, 1, 1, 1, 1],
    ["release_flight_consumer_completion_lease_v1", 2, 2, 2, 1, 1],
  ];
  let completionLeaseQualifiedPredicateCount = 0;
  let completionLeaseQualifiedUpdateCount = 0;
  for (const [
    functionName,
    expectedUpdateCount,
    expectedOrderPredicateCount,
    expectedRevisionPredicateCount,
    expectedStatePredicateCount,
    expectedTokenPredicateCount,
  ] of completionLeaseQualificationContracts) {
    const body = normalizedSqlFragment(functionBody(output, functionName) ?? "");
    const qualifiedUpdateCount = occurrenceCount(
      body,
      "update public.flight_consumer_completion_leases as completion_lease",
    );
    const allUpdateCount = occurrenceCount(
      body,
      "update public.flight_consumer_completion_leases",
    );
    const orderPredicateCount = occurrenceCount(
      body,
      "where completion_lease.order_id = p_order_id",
    );
    const revisionPredicateCount = occurrenceCount(
      body,
      "and completion_lease.lease_revision =",
    );
    const statePredicateCount = occurrenceCount(
      body,
      "and completion_lease.lease_state =",
    );
    const tokenPredicateCount = occurrenceCount(
      body,
      "and completion_lease.lease_token_sha256 =",
    );
    if (
      !body.includes("#variable_conflict error")
      || qualifiedUpdateCount !== expectedUpdateCount
      || allUpdateCount !== expectedUpdateCount
      || orderPredicateCount !== expectedOrderPredicateCount
      || revisionPredicateCount !== expectedRevisionPredicateCount
      || statePredicateCount !== expectedStatePredicateCount
      || tokenPredicateCount !== expectedTokenPredicateCount
      || body.includes("where order_id = p_order_id")
      || body.includes("and lease_revision =")
      || body.includes("and lease_state =")
      || body.includes("and lease_token_sha256 =")
    ) {
      throw new Error(
        "The post-apply schema dump does not prove the migration-133 completion lease qualification repair.",
      );
    }
    completionLeaseQualifiedUpdateCount += qualifiedUpdateCount;
    completionLeaseQualifiedPredicateCount += orderPredicateCount
      + revisionPredicateCount
      + statePredicateCount
      + tokenPredicateCount;
  }
  if (
    completionLeaseQualifiedUpdateCount !== 6
    || completionLeaseQualifiedPredicateCount !== 19
  ) {
    throw new Error(
      "The post-apply schema dump does not prove the migration-133 completion lease qualification repair.",
    );
  }
  const completionLeaseRecoveryBody = normalizedSqlFragment(functionBody(
    output,
    "recover_flight_consumer_completion_lease_v1",
  ) ?? "");
  if (
    !completionLeaseRecoveryBody.includes("#variable_conflict error")
    || !completionLeaseRecoveryBody.includes("coalesce(auth.role(),'')<> 'service_role'")
    || !completionLeaseRecoveryBody.includes("v_lease.request_sha256")
    || completionLeaseRecoveryBody.includes("p_idempotency_key_sha256")
    || completionLeaseRecoveryBody.includes("p_request_sha256")
    || !completionLeaseRecoveryBody.includes(
      "update public.flight_consumer_completion_leases as completion_lease",
    )
    || !completionLeaseRecoveryBody.includes("where completion_lease.order_id = p_order_id")
    || !completionLeaseRecoveryBody.includes("v_provider.state = 'dispatching'")
    || !completionLeaseRecoveryBody.includes("v_capture.state = 'dispatching'")
    || !completionLeaseRecoveryBody.includes("v_lease.lease_state = 'released'")
    || occurrenceCount(
      completionLeaseRecoveryBody,
      "v_capture.state,v_capture.revision,false",
    ) !== 5
    || completionLeaseRecoveryBody.includes("v_capture.state,v_capture.revision,true")
  ) {
    throw new Error(
      "The post-apply schema dump does not prove the migration-135 completion lease recovery boundary.",
    );
  }
  const terminalOfferEvidenceLoaderSource = functionBody(
    output,
    "load_flight_offer_evidence_for_terminal_recovery_v1",
  ) ?? "";
  const terminalOfferLocalIdentitySource = functionBody(
    output,
    "get_flight_offer_local_identity_for_terminal_recovery_v1",
  ) ?? "";
  const terminalOfferEvidenceLoaderBody = normalizedSqlFragment(
    terminalOfferEvidenceLoaderSource,
  );
  const terminalOfferLocalIdentityBody = normalizedSqlFragment(
    terminalOfferLocalIdentitySource,
  );
  const recoveryEvidenceObservationBody = normalizedSqlFragment(functionBody(
    output,
    "get_flight_consumer_duffel_recovery_evidence_observation_v1",
  ) ?? "");
  const asyncFinalizationValidatorBody = normalizedSqlFragment(functionBody(
    output,
    "validate_flight_consumer_async_order_finalization_v1",
  ) ?? "");
  const asyncDuffelFinalizerBody = normalizedSqlFragment(functionBody(
    output,
    "finalize_flight_consumer_async_duffel_order_v1",
  ) ?? "");
  if (
    functionBodySha256(terminalOfferEvidenceLoaderSource)
      !== PINNED_TERMINAL_RECOVERY_FUNCTION_BODY_SHA256.offerEvidenceLoader
    || !terminalOfferEvidenceLoaderBody.includes("#variable_conflict error")
    || !terminalOfferEvidenceLoaderBody.includes("coalesce(auth.role(),'')<> 'service_role'")
    || !terminalOfferEvidenceLoaderBody.includes("v_attempt.state <> 'succeeded'")
    || !terminalOfferEvidenceLoaderBody.includes("v_attempt.revision <> 2")
    || !terminalOfferEvidenceLoaderBody.includes("payment.status = 'captured'")
    || !terminalOfferEvidenceLoaderBody.includes("v_payment.refunded_cents <> 0")
    || !terminalOfferEvidenceLoaderBody.includes("v_now > v_attempt.dispatch_started_at + interval '7 days'")
    || !terminalOfferEvidenceLoaderBody.includes("v_response.deleted_at is not null")
    || !terminalOfferEvidenceLoaderBody.includes("v_response.retention_expires_at <= v_now")
    || !terminalOfferEvidenceLoaderBody.includes("v_attempt.dispatch_started_at < v_refreshed.observed_at")
    || !terminalOfferEvidenceLoaderBody.includes("v_attempt.dispatch_started_at >= v_refreshed.retention_expires_at")
    || !terminalOfferEvidenceLoaderBody.includes("v_attempt.dispatch_started_at < v_predecessor.observed_at")
    || !terminalOfferEvidenceLoaderBody.includes("v_attempt.dispatch_started_at >= v_predecessor.retention_expires_at")
    || terminalOfferEvidenceLoaderBody.includes("v_refreshed.retention_expires_at <= v_now")
    || terminalOfferEvidenceLoaderBody.includes("v_predecessor.retention_expires_at <= v_now")
    || !recoveryEvidenceObservationBody.includes("#variable_conflict error")
    || !recoveryEvidenceObservationBody.includes("coalesce(auth.role(),'')<> 'service_role'")
    || !recoveryEvidenceObservationBody.includes("v_ledger.state <> 'processed'")
    || !recoveryEvidenceObservationBody.includes("v_ledger.revision <> 2")
    || !recoveryEvidenceObservationBody.includes("v_attempt.state <> 'succeeded'")
    || !recoveryEvidenceObservationBody.includes("v_attempt.revision <> 2")
    || !recoveryEvidenceObservationBody.includes("v_evidence.deleted_at is not null")
    || !recoveryEvidenceObservationBody.includes("v_evidence.retention_expires_at <= v_now")
    || !recoveryEvidenceObservationBody.includes("return query select v_evidence.created_at")
    || !asyncFinalizationValidatorBody.includes("evidence.observed_at <= v_attempt.dispatch_started_at")
    || !asyncFinalizationValidatorBody.includes("v_attempt.dispatch_started_at < evidence.retention_expires_at")
    || !asyncFinalizationValidatorBody.includes("clock_timestamp()<= v_attempt.dispatch_started_at + interval '7 days'")
    || occurrenceCount(
      asyncFinalizationValidatorBody,
      "evidence.provider_offer_ref_sha256",
    ) !== 1
    || occurrenceCount(
      asyncFinalizationValidatorBody,
      "evidence.deleted_at is null",
    ) !== 1
    || occurrenceCount(
      asyncFinalizationValidatorBody,
      "evidence.retention_expires_at > clock_timestamp()",
    ) !== 1
    || !asyncDuffelFinalizerBody.includes("v_attempt.dispatch_started_at < v_offer_evidence.observed_at")
    || !asyncDuffelFinalizerBody.includes("v_attempt.dispatch_started_at >= v_offer_evidence.retention_expires_at")
    || !asyncDuffelFinalizerBody.includes("clock_timestamp()> v_attempt.dispatch_started_at + interval '7 days'")
    || asyncDuffelFinalizerBody.includes("v_offer_evidence.deleted_at")
    || asyncDuffelFinalizerBody.includes("v_offer_evidence.provider_offer_ref_sha256")
    || asyncDuffelFinalizerBody.includes("v_offer_evidence.retention_expires_at <= clock_timestamp()")
    || !asyncDuffelFinalizerBody.includes("or v_recovery.deleted_at is not null")
  ) {
    throw new Error(
      "The post-apply schema dump does not prove the migration-136 terminal offer-evidence recovery boundary.",
    );
  }
  if (
    functionBodySha256(terminalOfferLocalIdentitySource)
      !== PINNED_TERMINAL_RECOVERY_FUNCTION_BODY_SHA256.offerLocalIdentity
    || !terminalOfferLocalIdentityBody.includes("#variable_conflict error")
    || !terminalOfferLocalIdentityBody.includes(
      "coalesce(auth.role(),'')<> 'service_role'",
    )
    || !terminalOfferLocalIdentityBody.includes(
      "from public.load_flight_offer_evidence_for_terminal_recovery_v1(",
    )
    || !terminalOfferLocalIdentityBody.includes("v_verified_count <> 1")
    || !terminalOfferLocalIdentityBody.includes("evidence.id = v_evidence_id")
    || !terminalOfferLocalIdentityBody.includes("evidence.offer_id = v_offer_id")
    || !terminalOfferLocalIdentityBody.includes(
      "evidence.receipt_sha256 = v_verified_receipt_sha256",
    )
    || !terminalOfferLocalIdentityBody.includes(
      "v_local_offer_id !~ '^[a-za-z0-9][a-za-z0-9._:-]{7,127}$'",
    )
    || !terminalOfferLocalIdentityBody.includes(
      "return query select v_local_offer_id",
    )
    || terminalOfferLocalIdentityBody.includes("ciphertext_base64url")
    || terminalOfferLocalIdentityBody.includes("provider_order_ref")
    || terminalOfferLocalIdentityBody.includes("provider_offer_ref")
    || terminalOfferLocalIdentityBody.includes("processor_reference")
  ) {
    throw new Error(
      "The post-apply schema dump does not prove the migration-137 terminal offer local-identity boundary.",
    );
  }
  const settlementConstraintStatement = output.split(";").find((statement) => (
    /\bADD\s+CONSTRAINT\s+(?:"?flight_runtime_controls_provider_settlement_dependency_check"?)\s+CHECK\b/i
      .test(statement)
  ));
  const normalizedSettlementConstraint = settlementConstraintStatement
    ? normalizedSqlFragment(settlementConstraintStatement).replace(/[()]/g, "")
    : "";
  const settlementBindingColumns = [
    "bound_provider_settlement_processor_code",
    "bound_provider_settlement_account_sha256",
    "bound_provider_settlement_environment",
    "bound_provider_settlement_source_sha256",
    "bound_provider_settlement_adapter_version_sha256",
  ];
  const qualifiedLockedSettlement = [
    "execution_kill_switch_engaged",
    "not synthetic_execution_enabled",
    "not provider_sandbox_traffic_enabled",
    "not provider_live_traffic_enabled",
    "not shopping_enabled",
    "not order_enabled",
    "not payment_enabled",
    "not ticketing_enabled",
    "not servicing_enabled",
    "not provider_events_enabled",
    "not production_release_enabled",
  ].join(" and ");
  if (
    !settlementConstraintStatement
    || settlementBindingColumns.some((column) => (
      !normalizedSettlementConstraint.includes(`${column} is null`)
      || !normalizedSettlementConstraint.includes(`${column} is not null`)
    ))
    || !normalizedSettlementConstraint.includes(
      "provider_sandbox_traffic_enabled and bound_provider_settlement_environment = 'test'",
    )
    || !normalizedSettlementConstraint.includes(
      "provider_live_traffic_enabled and bound_provider_settlement_environment = 'live'",
    )
    || !normalizedSettlementConstraint.includes(qualifiedLockedSettlement)
  ) {
    throw new Error(
      "The post-apply schema dump does not prove the migration-122 relock settlement constraint.",
    );
  }
  const qualifiedActivationCas = "#variable_conflict error declare v_actor uuid; v_080 record; v_control public.flight_runtime_controls; v_manifest_sha256 text; v_activation_evidence_sha256 text; v_runtime_control_receipt_sha256 text; begin";
  const qualifiedActivationUpdate = "update public.flight_runtime_controls as runtime_control set activation_evidence_sha256 = v_activation_evidence_sha256,updated_by = v_actor where runtime_control.control_key = v_080.control_key and runtime_control.updated_at = v_080.updated_at and runtime_control.bound_execution_scope_sha256 = v_080.bound_execution_scope_sha256 and runtime_control.activation_evidence_sha256 = v_080.activation_evidence_sha256 and runtime_control.execution_kill_switch_engaged = false and runtime_control.provider_sandbox_traffic_enabled = true and runtime_control.provider_live_traffic_enabled = false and runtime_control.production_release_enabled = false returning runtime_control.* into v_control;";
  if (
    !normalizedDump.includes(qualifiedActivationCas)
    || !normalizedDump.includes(qualifiedActivationUpdate)
  ) {
    throw new Error("The post-apply schema dump does not prove the migration-121 qualified activation CAS.");
  }
  const repairedLocalOfferIdentity = normalizedSqlFragment(
    "if coalesce(v_offer_json ->> 'local_offer_id', '') !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$' then raise exception 'Flight local offer identity is malformed'; end if;",
  );
  const repairedSearchFailure = normalizedSqlFragment(
    "select 1 from public.flight_offers as offer where offer.search_id = v_search.id",
  );
  const historicalLocalOfferDefect = normalizedSqlFragment(
    "v_offer_json ->> 'local_offer_id' is distinct from v_offer_id::text",
  );
  const historicalSearchFailureDefect = normalizedSqlFragment(
    "from public.flight_offers where search_id = v_search.id",
  );
  if (
    !normalizedDump.includes(repairedLocalOfferIdentity)
    || !normalizedDump.includes(repairedSearchFailure)
    || normalizedDump.includes(historicalLocalOfferDefect)
    || normalizedDump.includes(historicalSearchFailureDefect)
  ) {
    throw new Error("The post-apply schema dump does not prove the migration-123 search repair.");
  }
  for (const table of [
    "flight_offers",
    "flight_orders",
    "flight_payments",
    "flight_ticket_documents",
  ]) {
    const exactScopeGrant = new RegExp(
      `\\bGRANT\\s+SELECT\\s*\\(\\s*execution_scope_sha256\\s*\\)\\s+ON(?:\\s+TABLE)?\\s+(?:"public"|public)\\.${identifierPattern(table)}\\s+TO\\s+authenticated\\b`,
      "i",
    );
    if (!exactScopeGrant.test(output)) {
      throw new Error("The post-apply schema dump does not prove the migration-123 repository scope grants.");
    }
  }
  const safeCiphertextPattern = "^enc:v[1-9][0-9]*:[A-Za-z0-9_-]+$";
  const ciphertextConstraints = [
    [
      "flight_offers_provider_offer_ref_ciphertext_check",
      "provider_offer_ref_ciphertext",
      8176,
    ],
    [
      "flight_orders_provider_order_ref_ciphertext_check",
      "provider_order_ref_ciphertext",
      8176,
    ],
    [
      "flight_passenger_refs_provider_ref_ciphertext_check",
      "provider_passenger_ref_ciphertext",
      4080,
    ],
    [
      "flight_ticket_documents_document_ref_ciphertext_check",
      "document_ref_ciphertext",
      4080,
    ],
    [
      "flight_payments_processor_reference_ciphertext_check",
      "processor_reference_ciphertext",
      4080,
    ],
    [
      "flight_service_requests_provider_case_ref_ciphertext_check",
      "provider_case_ref_ciphertext",
      4080,
    ],
    [
      "flight_payment_operation_attempts_processor_ref_check",
      "processor_object_ref_ciphertext",
      4080,
    ],
    [
      "flight_payment_refund_evidence_reference_check",
      "refund_reference_ciphertext",
      4080,
    ],
  ];
  const invalidPostgresRegexBound = [...output.matchAll(/\{\d+,(\d+)\}/g)]
    .some((match) => Number(match[1]) > 255);
  if (invalidPostgresRegexBound) {
    throw new Error(
      "The post-apply schema dump retains a migration-124 legacy ciphertext regex bound.",
    );
  }
  for (const [constraintName, column, maximumLength] of ciphertextConstraints) {
    const statements = output.split(";").filter((statement) => new RegExp(
      `\\bADD\\s+CONSTRAINT\\s+"?${constraintName}"?\\s+CHECK\\b`,
      "i",
    ).test(statement));
    const statement = statements[0] ?? "";
    const normalizedConstraint = normalizedSqlFragment(statement);
    if (
      statements.length !== 1
      || !statement.includes(safeCiphertextPattern)
      || !normalizedConstraint.includes(`split_part(${column}`)
      || !normalizedConstraint.includes(`between 16 and ${maximumLength}`)
    ) {
      throw new Error(
        "The post-apply schema dump does not prove the migration-124 ciphertext constraint repair.",
      );
    }
  }
  const asyncValidatorBody = functionBody(
    output,
    "validate_flight_consumer_async_order_finalization_v1",
  );
  const asyncFinalizerBody = functionBody(
    output,
    "finalize_flight_consumer_async_duffel_order_v1",
  );
  const normalizedAsyncValidator = normalizedSqlFragment(asyncValidatorBody ?? "");
  const normalizedAsyncFinalizer = normalizedSqlFragment(asyncFinalizerBody ?? "");
  if (
    !asyncValidatorBody
    || occurrenceCount(asyncValidatorBody, safeCiphertextPattern) !== 1
    || !normalizedAsyncValidator.includes(
      "split_part(new.provider_order_ref_ciphertext",
    )
    || occurrenceCount(normalizedAsyncValidator, "not between 16 and 8176") !== 1
    || !asyncFinalizerBody
    || occurrenceCount(asyncFinalizerBody, safeCiphertextPattern) !== 3
    || !normalizedAsyncFinalizer.includes(
      "split_part(p_provider_order_ref_ciphertext",
    )
    || !normalizedAsyncFinalizer.includes("provider_passenger_ref_ciphertext")
    || !normalizedAsyncFinalizer.includes("document_ref_ciphertext")
    || occurrenceCount(normalizedAsyncFinalizer, "split_part(coalesce(") !== 2
    || occurrenceCount(normalizedAsyncFinalizer, "not between 16 and 8176") !== 1
    || occurrenceCount(normalizedAsyncFinalizer, "not between 16 and 4080") !== 2
  ) {
    throw new Error(
      "The post-apply schema dump does not prove the migration-124 async ciphertext predicates.",
    );
  }
  const completeRepriceBody = functionBody(
    output,
    "complete_flight_consumer_reprice_v1",
  );
  const failRepriceBody = functionBody(
    output,
    "fail_flight_consumer_reprice_v1",
  );
  const normalizedCompleteReprice = normalizedSqlFragment(completeRepriceBody ?? "");
  const normalizedFailReprice = normalizedSqlFragment(failRepriceBody ?? "");
  const exactRefreshedEvidenceContract = normalizedSqlFragment(`
    public.flight_jsonb_has_exact_keys_v1(p_refreshed_evidence, array[
      'stage', 'predecessor_receipt_sha256', 'observed_at', 'retention_expires_at',
      'raw_body_sha256', 'evidence_sha256', 'snapshot_sha256', 'record_sha256',
      'receipt_sha256', 'key_version', 'iv_base64url', 'auth_tag_base64url',
      'ciphertext_base64url', 'aad_sha256', 'record_hmac_sha256'
    ])
  `);
  if (
    !completeRepriceBody
    || occurrenceCount(
      normalizedCompleteReprice,
      exactRefreshedEvidenceContract,
    ) !== 1
    || !normalizedCompleteReprice.includes("v_predecessor.local_offer_id")
  ) {
    throw new Error(
      "The post-apply schema dump does not prove the migration-125 15-key reprice evidence contract.",
    );
  }
  const qualifiedRepriceReceiptLookup = normalizedSqlFragment(
    "from public.flight_reprice_receipts as reprice where reprice.offer_id = v_attempt.offer_id",
  );
  const historicalAmbiguousRepriceReceiptLookup = normalizedSqlFragment(
    "from public.flight_reprice_receipts where offer_id = v_attempt.offer_id",
  );
  const terminalOfferExpiry = normalizedSqlFragment(
    "update public.flight_offers as offer set status = 'expired' where offer.id = v_attempt.offer_id and offer.status = 'offered'",
  );
  if (
    !failRepriceBody
    || !normalizedFailReprice.includes("#variable_conflict error")
    || !normalizedFailReprice.includes(qualifiedRepriceReceiptLookup)
    || normalizedFailReprice.includes(historicalAmbiguousRepriceReceiptLookup)
    || !normalizedFailReprice.includes(terminalOfferExpiry)
  ) {
    throw new Error(
      "The post-apply schema dump does not prove the migration-125 reprice failure repair.",
    );
  }
  for (const sensitiveColumn of [
    "provider_offer_ref_ciphertext",
    "provider_order_ref_ciphertext",
    "processor_reference_ciphertext",
    "document_ref_ciphertext",
  ]) {
    const unsafeGrant = new RegExp(
      `\\bGRANT\\s+SELECT\\s*\\([^;)]*\\b${identifierPattern(sensitiveColumn)}\\b[^;)]*\\)[^;]*\\bTO\\s+authenticated\\b`,
      "i",
    );
    if (unsafeGrant.test(output)) {
      throw new Error("The post-apply schema dump exposes a sensitive flight repository column.");
    }
  }
  const exactClaimRouter = "if p_operation = 'create_order' then return query select * from public.claim_flight_provider_order_attempt_for_dispatch(p_attempt_id,p_expected_revision); else return query select * from public.claim_flight_provider_request_attempt_for_dispatch(p_attempt_id,p_expected_revision); end if;";
  if (!normalizedDump.includes(exactClaimRouter)) {
    throw new Error("The post-apply schema dump does not prove mutually exclusive order and shopping claim routing.");
  }
  assertFunctionSignature(
    output,
    "claim_flight_provider_request_attempt_for_dispatch",
    ["uuid", "integer"],
    "table(attempt_id uuid,attempt_revision integer,attempt_state text)",
  );
  assertFunctionSignature(
    output,
    "complete_flight_provider_request_attempt",
    ["uuid", "integer", "text", "smallint", "text", "bigint", "text"],
    "table(attempt_id uuid,attempt_revision integer,attempt_state text)",
  );
  assertFunctionSignature(
    output,
    "prepare_flight_provider_order_attempt",
    [...Array(15).fill("text"), "timestamptz"],
    "table(attempt_id uuid,attempt_revision integer,attempt_state text)",
  );
  assertFunctionSignature(
    output,
    "claim_flight_provider_order_attempt_for_dispatch",
    ["uuid", "integer"],
    "table(attempt_id uuid,attempt_revision integer,attempt_state text)",
  );
  assertFunctionSignature(
    output,
    "prepare_flight_provider_attempt_rpc",
    [...Array(17).fill("text"), "timestamptz"],
    "table(attempt_id uuid,attempt_revision integer,attempt_state text)",
  );
  assertFunctionSignature(
    output,
    "claim_flight_provider_attempt_rpc",
    ["uuid", "integer", "text", "text", "text", "text"],
    "table(attempt_id uuid,attempt_revision integer,attempt_state text)",
  );
  for (const table of requiredTables) {
    for (const mode of ["ENABLE", "FORCE"]) {
      const pattern = new RegExp(
        `^\\s*ALTER\\s+TABLE(?:\\s+ONLY)?\\s+(?:"public"|public)\\.${identifierPattern(table)}\\s+${mode}\\s+ROW\\s+LEVEL\\s+SECURITY\\s*;`,
        "im",
      );
      if (!pattern.test(output)) {
        throw new Error("The post-apply schema dump does not prove forced RLS on required flight tables.");
      }
    }
  }

  return true;
}

export function buildSupabaseChildEnv(sourceEnv, databasePassword) {
  const childEnv = {};
  for (const [key, value] of Object.entries(sourceEnv)) {
    if (typeof value === "string" && CHILD_ENV_ALLOWLIST.has(key.toUpperCase())) {
      childEnv[key] = value;
    }
  }
  childEnv.PGPASSWORD = databasePassword;
  childEnv.SUPABASE_DB_PASSWORD = databasePassword;
  childEnv.NO_COLOR = "1";
  return childEnv;
}

export function runSupabaseCli(args, databasePassword, sourceEnv = process.env) {
  const result = spawnSync("supabase", args, {
    cwd: REPOSITORY_ROOT_PATH,
    env: buildSupabaseChildEnv(sourceEnv, databasePassword),
    encoding: "utf8",
    stdio: "pipe",
    shell: false,
    maxBuffer: 64 * 1024 * 1024,
    timeout: 5 * 60 * 1000,
  });
  if (result.error) {
    throw new Error("The Supabase CLI could not be started.");
  }
  if (result.status !== 0) {
    throw new Error(`The Supabase CLI exited with status ${result.status}.`);
  }
  return `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
}

function safeSummary(mode, pinnedPlan, extra = {}) {
  const canonicalSet = new Set(CANONICAL_FLIGHT_MIGRATION_VERSIONS);
  return {
    gate: "flight-preview-migrations-120-137",
    mode,
    approvedPreviewProjectRef: PREVIEW_PROJECT_REF,
    requiredRemoteBaselineTip: REQUIRED_REMOTE_FLIGHT_BASELINE_TIP,
    sharedHotelMigration: SHARED_HOTEL_MIGRATION,
    sharedHotelMigrationPresent: pinnedPlan.sharedHotelMigrationPresent,
    applyReady: pinnedPlan.sharedHotelMigrationPresent,
    applyBlockers: pinnedPlan.sharedHotelMigrationPresent
      ? []
      : ["exact_pinned_local_hotel_082_predecessor_missing"],
    retiredFlightMigrationVersions: RETIRED_FLIGHT_MIGRATION_VERSIONS,
    migrationOrder: PINNED_FLIGHT_MIGRATIONS
      .filter(({ version }) => canonicalSet.has(version))
      .map(({ version, filename, sha256 }) => ({ version, filename, sha256 })),
    repositoryMigrationCount: pinnedPlan.migrations.length,
    applyConfirmationFlag: APPLY_CONFIRMATION_FLAG,
    ...extra,
  };
}

export function applyFlightPreviewMigrations({
  env = process.env,
  argv = process.argv.slice(2),
  runner,
  log = (value) => console.log(JSON.stringify(value, null, 2)),
} = {}) {
  const mode = parseInvocationMode(argv);
  const pinnedPlan = assertPinnedFlightMigrations({
    requireSharedHotel: mode === "apply",
  });
  const { cliDatabaseUrl, databasePassword } = assertExactPreviewTarget(env);

  if (mode === "plan") {
    const summary = safeSummary(mode, pinnedPlan, {
      networkExecuted: false,
      allowedPendingSets: Array.from(
        { length: pinnedPlan.flightVersions.length + 1 },
        (_, installedPrefixLength) => pinnedPlan.flightVersions.slice(installedPrefixLength),
      ),
    });
    log(summary);
    return summary;
  }

  const execute = runner ?? ((args) => runSupabaseCli(args, databasePassword, env));
  const dbUrlArgs = ["--db-url", cliDatabaseUrl];
  const beforeOutput = execute(["migration", "list", ...dbUrlArgs]);
  const before = assertPreviewLedger(beforeOutput, pinnedPlan);
  let applied = false;

  if (before.pendingVersions.length > 0) {
    const dryRunOutput = execute([
      "db", "push", ...dbUrlArgs, "--dry-run",
    ]);
    assertExactFlightDryRun(dryRunOutput, before.pendingVersions);

    // Close the largest local-file and remote-ledger race windows before the mutating call.
    assertPinnedFlightMigrations({ requireSharedHotel: true });
    const preApplyOutput = execute(["migration", "list", ...dbUrlArgs]);
    const preApply = assertPreviewLedger(preApplyOutput, pinnedPlan);
    if (preApply.pendingVersions.length > 0) {
      if (!sameValues(preApply.pendingVersions, before.pendingVersions)) {
        throw new Error("The Preview pending migration set changed after the approved dry run.");
      }
      execute(["db", "push", ...dbUrlArgs, "--yes"]);
      applied = true;

      assertPinnedFlightMigrations({ requireSharedHotel: true });
      const afterOutput = execute(["migration", "list", ...dbUrlArgs]);
      const after = assertPreviewLedger(afterOutput, pinnedPlan);
      if (after.pendingVersions.length !== 0) {
        throw new Error("The post-apply Preview ledger is incomplete.");
      }
    }
  }

  const schemaOutput = execute(["db", "dump", ...dbUrlArgs, "--schema", "public"]);
  assertFlightSchemaDump(schemaOutput);

  const summary = safeSummary(mode, pinnedPlan, {
    applied,
    pendingBefore: before.pendingVersions,
    pendingAfter: [],
    physicalSchemaBoundaryVerified: true,
  });
  log(summary);
  return summary;
}

const invokedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : null;
if (invokedPath === import.meta.url) {
  applyFlightPreviewMigrations();
}
