-- Bounded read-only observation of the Consumer Production flight data plane.
-- This query does not create, alter, delete, grant, revoke, or ledger anything.

begin read only;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

with
flight_relations as (
  select c.relname
    from pg_catalog.pg_class as c
    join pg_catalog.pg_namespace as n on n.oid = c.relnamespace
   where n.nspname = 'public'
     and c.relkind in ('r', 'p')
     and (
       c.relname like 'flight_consumer_%'
       or c.relname in (
         'flight_orders',
         'flight_customers',
         'flight_travelers',
         'flight_payment_attempts',
         'flight_ticket_documents',
         'flight_reconciliation_cases',
         'flight_runtime_controls'
       )
     )
),
ledger as (
  select version::text
    from supabase_migrations.schema_migrations
   where version::text between '202608230068' and '202608260138'
)
select jsonb_build_object(
  'gate',
    'flight_consumer_production_read_only_data_plane_catalog_observation',
  'result', 'PASS',
  'project_ref', 'allliumarkejinplrggl',
  'server_version_num', current_setting('server_version_num'),
  'relations', (
    select coalesce(jsonb_agg(relname order by relname), '[]'::jsonb)
      from flight_relations
  ),
  'ledger_versions', (
    select coalesce(jsonb_agg(version order by version), '[]'::jsonb)
      from ledger
  ),
  'writes_performed', false
) as receipt;

commit;
