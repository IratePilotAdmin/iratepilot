// Offline SQL replay gate. PGlite is PostgreSQL in WASM, with a minimal auth
// schema standing in for the Supabase-managed auth objects. This catches SQL
// ordering errors; a real Supabase Preview replay is still required.
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const folders = ['supabase/migrations'];
const migrations = (await Promise.all(folders.map(async (folder) =>
  (await readdir(path.join(root, folder)))
    .filter((file) => /^\d{12,}_.+\.sql$/.test(file))
    .map((file) => ({ folder, file }))
))).flat().sort((a, b) => a.file.localeCompare(b.file));

const versions = migrations.map(({ file }) => file.split('_')[0]);
if (new Set(versions).size !== versions.length) {
  throw new Error('Duplicate migration versions in replay sources');
}
for (const required of ['202607260000', '202608220062', '202608220063']) {
  if (!versions.includes(required)) throw new Error(`Missing recovery source ${required}`);
}

const db = new PGlite({ extensions: { pgcrypto } });
try {
  await db.exec(`
    create schema extensions;
    create extension pgcrypto with schema extensions;
    create schema auth;
    create role authenticated; create role anon; create role service_role;
    create table auth.users(
      id uuid primary key,
      email text,
      email_confirmed_at timestamptz,
      raw_user_meta_data jsonb
    );
    create function auth.uid() returns uuid language sql stable as $$select null::uuid$$;
    create function auth.role() returns text language sql stable as $$select 'authenticated'::text$$;
    create function auth.jwt() returns jsonb language sql stable as $$select '{}'::jsonb$$;
    create function public.uuid_generate_v4() returns uuid language sql volatile
      as $$select gen_random_uuid()$$;
  `);

  for (const { folder, file } of migrations) {
    const source = await readFile(path.join(root, folder, file), 'utf8');
    // PGlite does not bundle uuid-ossp; its UUID helper above uses PostgreSQL's
    // gen_random_uuid(). All other migration SQL executes unmodified.
    const sql = source
      .replace(/^create extension if not exists "uuid-ossp";\s*/gim, '')
      .replace(/^\s*execute \$ip_stmt\$create extension if not exists "uuid-ossp";\$ip_stmt\$;/gim, '');
    try {
      await db.exec(sql);
    } catch (error) {
      throw new Error(`Migration ${file} failed [${error.code ?? 'SQL'}]: ${error.message}`, { cause: error });
    }
  }

  const { rows } = await db.query(`
    select
      exists(select 1 from information_schema.columns where table_schema = 'public'
        and table_name = 'properties' and column_name = 'pms_only') as pms_only,
      exists(select 1 from information_schema.columns where table_schema = 'public'
        and table_name = 'booking_financials' and column_name = 'reward_program_fee') as fee_column,
      exists(select 1 from pg_proc where oid =
        to_regprocedure('public.replace_revenue_recommendations(uuid,jsonb)')) as revenue_rpc
  `);
  if (!Object.values(rows[0]).every(Boolean)) {
    throw new Error(`Replay missing required Revenue AI objects: ${JSON.stringify(rows[0])}`);
  }
  const bootstrap = await readFile(path.join(root, 'supabase/migrations/202607260000_initial_schema_bootstrap.sql'), 'utf8');
  const before = (await db.query("select count(*)::integer as n from pg_class where relnamespace = 'public'::regnamespace")).rows[0].n;
  await db.exec(bootstrap); // Existing production-style schema must be a no-op.
  const after = (await db.query("select count(*)::integer as n from pg_class where relnamespace = 'public'::regnamespace")).rows[0].n;
  if (before !== after) throw new Error('Bootstrap changed an existing complete schema');
  console.log(`Replayed ${migrations.length} SQL migrations in order; Revenue AI schema present.`);
} finally {
  await db.close();
}

const partial = new PGlite();
try {
  await partial.exec('create table public.partners(id integer)');
  const bootstrap = await readFile(path.join(root, 'supabase/migrations/202607260000_initial_schema_bootstrap.sql'), 'utf8');
  let rejected = false;
  try { await partial.exec(bootstrap); } catch (error) {
    if (!error.message.includes('Partial iRatePilot base schema')) throw error;
    rejected = true;
  }
  if (!rejected) throw new Error('Bootstrap accepted a partial existing schema');
} finally {
  await partial.close();
}
