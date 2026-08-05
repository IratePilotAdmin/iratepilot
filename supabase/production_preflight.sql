-- Read-only production schema inventory.
-- Run this before repairing migration history or applying migrations.
select
  to_regclass('supabase_migrations.schema_migrations')::text as migration_history_table,
  to_regclass('public.booking_messages')::text as booking_messages_table,
  to_regprocedure('public.send_booking_message(uuid,text)')::text as send_booking_message_function,
  to_regprocedure('public.cancel_unpaid_confirmed_booking(uuid,text)')::text as cancel_unpaid_booking_function,
  to_regprocedure('public.review_booking(uuid,text,text)')::text as review_booking_function,
  to_regprocedure('public.finalize_test_booking_refund(uuid,text,numeric)')::text as finalize_refund_function,
  (
    select count(*)
    from pg_catalog.pg_tables
    where schemaname = 'public'
  ) as public_table_count,
  coalesce((
    select jsonb_agg(tablename order by tablename)
    from pg_catalog.pg_tables
    where schemaname = 'public'
  ), '[]'::jsonb) as public_tables;
