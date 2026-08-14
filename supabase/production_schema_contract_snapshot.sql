-- Read-only production catalog snapshot for migration-history repair evidence.
-- Save the single JSON result privately before and after repair. Matching hashes demonstrate that
-- the history-only operation did not mutate the public schema; they do not replace source review.
with
tables as (
  select
    format('%I.%I', n.nspname, c.relname) as identity,
    concat_ws('|', n.nspname, c.relname, c.relkind, c.relrowsecurity, c.relforcerowsecurity) as definition
  from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind in ('r', 'p')
),
columns as (
  select
    format('%I.%I.%I', table_schema, table_name, column_name) as identity,
    concat_ws('|', table_schema, table_name, ordinal_position, column_name, data_type,
      udt_schema, udt_name, is_nullable, coalesce(column_default, '')) as definition
  from information_schema.columns
  where table_schema = 'public'
),
constraints as (
  select
    format('%s.%I', conrelid::regclass, conname) as identity,
    concat_ws('|', conrelid::regclass::text, conname, contype, convalidated,
      pg_catalog.pg_get_constraintdef(oid, true)) as definition
  from pg_catalog.pg_constraint
  where connamespace = 'public'::regnamespace
),
indexes as (
  select
    format('%I.%I', i.schemaname, i.indexname) as identity,
    concat_ws('|', i.schemaname, i.tablename, i.indexname,
      pg_catalog.pg_get_indexdef(idx.oid)) as definition
  from pg_catalog.pg_indexes i
  join pg_catalog.pg_class idx on idx.relname = i.indexname
  join pg_catalog.pg_namespace ns on ns.oid = idx.relnamespace
    and ns.nspname = i.schemaname
  where i.schemaname = 'public'
),
policies as (
  select
    format('%I.%I.%I', schemaname, tablename, policyname) as identity,
    concat_ws('|', schemaname, tablename, policyname, permissive, roles::text, cmd,
      coalesce(qual, ''), coalesce(with_check, '')) as definition
  from pg_catalog.pg_policies
  where schemaname = 'public'
),
functions as (
  select
    format('%I.%I(%s)', n.nspname, p.proname,
      pg_catalog.pg_get_function_identity_arguments(p.oid)) as identity,
    concat_ws('|', p.prosecdef, p.provolatile, p.proparallel,
      pg_catalog.pg_get_functiondef(p.oid)) as definition
  from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
),
triggers as (
  select
    format('%s.%I', tgrelid::regclass, tgname) as identity,
    pg_catalog.pg_get_triggerdef(oid, true) as definition
  from pg_catalog.pg_trigger
  where tgrelid in (
    select c.oid from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
  ) and not tgisinternal
),
grants as (
  select
    concat_ws('.', table_schema, table_name, grantee, privilege_type) as identity,
    concat_ws('|', table_schema, table_name, grantee, privilege_type, is_grantable) as definition
  from information_schema.role_table_grants
  where table_schema = 'public'
  union all
  select
    concat_ws('.', routine_schema, routine_name, grantee, privilege_type) as identity,
    concat_ws('|', routine_schema, routine_name, specific_name, grantee, privilege_type, is_grantable)
  from information_schema.role_routine_grants
  where routine_schema = 'public'
),
catalog as (
  select 'tables' as section, identity, definition from tables
  union all select 'columns', identity, definition from columns
  union all select 'constraints', identity, definition from constraints
  union all select 'indexes', identity, definition from indexes
  union all select 'policies', identity, definition from policies
  union all select 'functions', identity, definition from functions
  union all select 'triggers', identity, definition from triggers
  union all select 'grants', identity, definition from grants
),
sections as (
  select section, jsonb_build_object(
    'count', count(*),
    'md5', md5(coalesce(string_agg(identity || '|' || definition, E'\n' order by identity, definition), '')),
    'identities', jsonb_agg(identity order by identity)
  ) as evidence
  from catalog
  group by section
)
select jsonb_build_object(
  'schema_version', 1,
  'generated_at', current_timestamp,
  'migration_history_table', to_regclass('supabase_migrations.schema_migrations')::text,
  'sections', coalesce(jsonb_object_agg(section, evidence order by section), '{}'::jsonb)
) as production_schema_contract_snapshot
from sections;
