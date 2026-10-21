// Verify that a fresh project using Supabase's post-2026-10-30 default
// privileges exposes exactly the same public-schema relations as an existing
// project that received the legacy automatic grants.
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const migrationDir = path.join(root, 'supabase', 'migrations');
const explicitGrantMigration = '202610210171_explicit_data_api_grants.sql';
const migrations = (await readdir(migrationDir))
  .filter((file) => /^\d{12,}_.+\.sql$/.test(file))
  .sort();

const explicitGrantSql = (await readFile(path.join(migrationDir, explicitGrantMigration), 'utf8')).trim();
const schemaSnapshot = await readFile(path.join(root, 'supabase', 'schema.sql'), 'utf8');
if (!schemaSnapshot.includes(explicitGrantSql)) {
  throw new Error(`${explicitGrantMigration} is not mirrored in supabase/schema.sql`);
}

async function createDatabase({ legacyDefaults }) {
  const db = new PGlite({ extensions: { pgcrypto } });
  await db.exec(`
    create schema extensions;
    create extension pgcrypto with schema extensions;
    create schema auth;
    create role authenticated;
    create role anon;
    create role service_role;
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

  if (legacyDefaults) {
    await db.exec(`
      alter default privileges in schema public
        grant select, insert, update, delete on tables to anon, authenticated, service_role;
      alter default privileges in schema public
        grant usage, select on sequences to anon, authenticated, service_role;
    `);
  }

  for (const file of migrations) {
    if (legacyDefaults && file === explicitGrantMigration) continue;
    const source = await readFile(path.join(migrationDir, file), 'utf8');
    const sql = source
      .replace(/^create extension if not exists "uuid-ossp";\s*/gim, '')
      .replace(/^\s*execute \$ip_stmt\$create extension if not exists "uuid-ossp";\$ip_stmt\$;/gim, '');
    try {
      await db.exec(sql);
    } catch (error) {
      await db.close();
      throw new Error(`Migration ${file} failed [${error.code ?? 'SQL'}]: ${error.message}`, { cause: error });
    }
  }
  return db;
}

async function privilegeSnapshot(db) {
  const { rows } = await db.query(`
    select
      c.relname as object_name,
      c.relkind,
      r.role_name,
      has_table_privilege(r.role_name, c.oid, 'select') as can_select,
      has_table_privilege(r.role_name, c.oid, 'insert') as can_insert,
      has_table_privilege(r.role_name, c.oid, 'update') as can_update,
      has_table_privilege(r.role_name, c.oid, 'delete') as can_delete
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    cross join (values ('anon'), ('authenticated'), ('service_role')) as r(role_name)
    where n.nspname = 'public'
      and c.relkind in ('r', 'p', 'v', 'm')
    order by c.relname, r.role_name;
  `);
  return rows;
}

const legacy = await createDatabase({ legacyDefaults: true });
const explicit = await createDatabase({ legacyDefaults: false });
try {
  const expected = await privilegeSnapshot(legacy);
  const actual = await privilegeSnapshot(explicit);
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    const differences = actual.filter((row, index) => JSON.stringify(row) !== JSON.stringify(expected[index]));
    throw new Error(`Explicit Data API grants differ from legacy grants: ${JSON.stringify(differences.slice(0, 10))}`);
  }
  console.log(`Verified explicit Data API grants for ${actual.length / 3} public relations.`);
} finally {
  await Promise.all([legacy.close(), explicit.close()]);
}
