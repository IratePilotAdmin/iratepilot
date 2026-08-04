import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const migrationsDir = path.join(root, "supabase", "migrations");
const verifierPath = path.join(root, "supabase", "verify_schema.sql");

const expectedSequence = Array.from({ length: 25 }, (_, index) =>
  `20260802${String(index + 1).padStart(4, "0")}`,
);

const migrationFiles = (await readdir(migrationsDir))
  .filter((name) => name.endsWith(".sql"))
  .sort();

const releaseMigrations = migrationFiles.filter((name) =>
  name.startsWith("20260802"),
);
const actualSequence = releaseMigrations.map((name) => name.slice(0, 12));

const failures = [];

if (actualSequence.length !== expectedSequence.length) {
  failures.push(
    `Expected ${expectedSequence.length} release migrations, found ${actualSequence.length}.`,
  );
}

for (let index = 0; index < expectedSequence.length; index += 1) {
  if (actualSequence[index] !== expectedSequence[index]) {
    failures.push(
      `Migration sequence mismatch at position ${index + 1}: expected ${expectedSequence[index]}, found ${actualSequence[index] ?? "missing"}.`,
    );
  }
}

const duplicatePrefixes = actualSequence.filter(
  (prefix, index) => actualSequence.indexOf(prefix) !== index,
);
if (duplicatePrefixes.length > 0) {
  failures.push(
    `Duplicate migration prefixes: ${[...new Set(duplicatePrefixes)].join(", ")}.`,
  );
}

const verifier = await readFile(verifierPath, "utf8");
const requiredVerifierTokens = [
  "public.booking_messages",
  "public.booking_messages_thread_idx",
  "public.send_booking_message(uuid,text)",
  "public.finalize_test_booking_refund(uuid,text,numeric)",
  "public.cancel_unpaid_confirmed_booking(uuid,text)",
  "booking_cancellation_requests_support_processing",
  "booking_messages_rls_ready",
  "anonymous_booking_message_blocked",
  "anonymous_refund_finalization_blocked",
  "anonymous_unpaid_cancellation_blocked",
];

for (const token of requiredVerifierTokens) {
  if (!verifier.includes(token)) {
    failures.push(`verify_schema.sql is missing required check token: ${token}`);
  }
}

if (failures.length > 0) {
  console.error("Database release verification failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(
  `Database release verification passed: ${releaseMigrations.length} ordered migrations and ${requiredVerifierTokens.length} verifier checks.`,
);
