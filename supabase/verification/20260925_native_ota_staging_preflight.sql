-- Read-only prerequisite check for the iRatePilot PMS ↔ OTA migration sequence.
-- Run this in Supabase SQL Editor before applying any connector migration.
-- A missing relation or required column means STOP: do not apply the receiver
-- migration until the base schema and ordered outbox migrations are reconciled.

with expected(table_name, required_columns) as (
  values
    ('properties', array['id', 'partner_id', 'active']::text[]),
    ('partners', array['id', 'status', 'owner_id']::text[]),
    ('rooms', array['id', 'property_id', 'active']::text[]),
    ('inventory', array['room_id', 'stay_date', 'available_units', 'rate']::text[]),
    ('bookings', array[
      'id', 'confirmation_code', 'customer_id', 'property_id', 'room_id',
      'check_in', 'check_out', 'guests', 'subtotal', 'taxes', 'fees', 'total', 'status'
    ]::text[]),
    ('profiles', array['id', 'full_name', 'role']::text[]),
    ('revenue_daily_inputs', array[
      'property_id', 'room_id', 'stay_date', 'rooms_available', 'rooms_sold',
      'current_rate', 'competitor_rate', 'event_name'
    ]::text[]),
    ('revenue_recommendations', array[
      'property_id', 'room_id', 'stay_date', 'current_rate', 'recommended_rate',
      'occupancy_forecast', 'estimated_revenue_impact', 'reason', 'status'
    ]::text[]),
    ('irp_pms_outbox_connections', array[
      'property_id', 'connection_id', 'tenant_id', 'pms_property_id',
      'enabled', 'delivery_enabled', 'environment'
    ]::text[]),
    ('irp_pms_booking_versions', array['booking_id', 'version']::text[]),
    ('irp_pms_outbox', array[
      'event_id', 'booking_id', 'property_id', 'connection_id', 'tenant_id',
      'pms_property_id', 'source_version', 'event_payload', 'state', 'attempts',
      'due_at', 'lease_token', 'lease_until', 'result_code', 'created_at'
    ]::text[])
)
, table_state as (
  select
    e.table_name,
    to_regclass(format('public.%I', e.table_name)) is not null as relation_present,
    array(
      select required.column_name
      from unnest(e.required_columns) as required(column_name)
      where not exists (
        select 1
        from information_schema.columns c
        where c.table_schema = 'public'
          and c.table_name = e.table_name
          and c.column_name = required.column_name
      )
      order by required.column_name
    ) as missing_columns
  from expected e
), platform_state as (
  select
    to_regclass('auth.users') is not null as auth_users_present,
    to_regprocedure('auth.uid()') is not null as auth_uid_present,
    to_regprocedure('gen_random_uuid()') is not null as gen_random_uuid_present,
    exists (select 1 from pg_roles where rolname = 'anon') as anon_role_present,
    exists (select 1 from pg_roles where rolname = 'authenticated') as authenticated_role_present,
    exists (select 1 from pg_roles where rolname = 'service_role') as service_role_present
), revenue_integrity as (
  select
    (select count(*)::bigint from public.revenue_daily_inputs i
     left join public.rooms r on r.id = i.room_id
     where r.id is null or r.property_id <> i.property_id) as invalid_revenue_input_room_rows,
    (select count(*)::bigint from public.revenue_recommendations rec
     left join public.rooms r on r.id = rec.room_id
     where r.id is null or r.property_id <> rec.property_id) as invalid_recommendation_room_rows
), migration_history as (
  select
    to_regclass('supabase_migrations.schema_migrations') is not null as ledger_present,
    case
      when to_regclass('supabase_migrations.schema_migrations') is null then '[]'::jsonb
      else (
        select coalesce(jsonb_agg(version_node::text order by version_node::text), '[]'::jsonb)
        from unnest(xpath(
          '/table/row/version/text()',
          query_to_xml(
            $migration_query$
              select version::text as version
              from supabase_migrations.schema_migrations
              where version::text in (
                '202609070139','202609070140','202609070141','202609070157','202609070158',
                '202609230139','202609230140','202609230141','202609230142',
                '202609240143','202609240144','202609240145'
              )
              order by version
            $migration_query$,
            false,
            false,
            ''
          )
        )) as applied(version_node)
      )
    end as native_versions
)
select jsonb_build_object(
  'tables', (select jsonb_agg(jsonb_build_object(
    'table', table_name, 'relationPresent', relation_present,
    'missingColumns', to_jsonb(missing_columns)
  ) order by table_name) from table_state),
  'platform', (select to_jsonb(platform_state) from platform_state),
  'revenueIntegrity', (select to_jsonb(revenue_integrity) from revenue_integrity),
  'migrationHistory', (select jsonb_build_object(
    'ledgerPresent', ledger_present,
    'nativeVersions', native_versions,
    'nativeMigrationCount', jsonb_array_length(native_versions),
    'expectedNativeMigrationCount', 12
  ) from migration_history)
) as migration_preflight;
