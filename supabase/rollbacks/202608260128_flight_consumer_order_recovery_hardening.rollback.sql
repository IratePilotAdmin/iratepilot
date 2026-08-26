begin;

-- The hardened one-attempt recovery contract prevents expired or stale
-- authority from reaching provider dispatch. Restoring the predecessor would
-- reopen a redispatch race and hide missing response evidence behind an RPC
-- error, so any change must be another reviewed forward migration.
do $flight_consumer_preview_089_forward_only$
declare
  v_control_active boolean;
begin
  select not control.execution_kill_switch_engaged into v_control_active
    from public.flight_runtime_controls as control
   where control.control_key = 'global';
  raise exception using
    message = 'Migration 089 is forward-only and cannot be rolled back safely',
    detail = format('consumer_preview_active=%s', coalesce(v_control_active, false)),
    hint = 'Relock Consumer Preview and deploy a reviewed forward repair; do not restore stale create-order dispatch or exception-only evidence discovery.';
end;
$flight_consumer_preview_089_forward_only$;

rollback;
