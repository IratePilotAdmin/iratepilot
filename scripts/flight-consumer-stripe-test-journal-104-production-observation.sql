-- Read-only observation of migration-104 object and ledger state in the
-- managed Consumer Production project. This query does not create, alter,
-- delete, grant, revoke, or ledger anything.

begin read only;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

with
relations as (
  select c.relname
    from pg_catalog.pg_class as c
    join pg_catalog.pg_namespace as n on n.oid = c.relnamespace
   where n.nspname = 'public'
     and c.relname like 'flight_consumer_stripe_test_%'
),
functions as (
  select p.proname
    from pg_catalog.pg_proc as p
    join pg_catalog.pg_namespace as n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname like '%flight_consumer_stripe_test%'
),
ledger as (
  select exists (
    select 1
      from supabase_migrations.schema_migrations
     where version::text = '202608260104'
  ) as present
)
select jsonb_build_object(
  'gate',
    'flight_consumer_production_migration_104_read_only_catalog_observation',
  'result', 'PASS',
  'project_ref', 'allliumarkejinplrggl',
  'current_database', current_database(),
  'current_user', current_user,
  'server_version_num', current_setting('server_version_num'),
  'relation_count', (select count(*) from relations),
  'relation_names', (
    select coalesce(jsonb_agg(relname order by relname), '[]'::jsonb)
      from relations
  ),
  'function_count', (select count(*) from functions),
  'function_names', (
    select coalesce(jsonb_agg(proname order by proname), '[]'::jsonb)
      from functions
  ),
  'migration_104_ledger_entry_present', (select present from ledger),
  'writes_performed', false
) as flight_consumer_production_migration_104_catalog_receipt;

commit;
