begin;

-- Removing an append-only association after a signed event has been admitted
-- would strand the exact replay again. Repair must remain forward-only.
do $flight_consumer_preview_090_forward_only$
declare
  v_control_active boolean;
begin
  select not control.execution_kill_switch_engaged into v_control_active
    from public.flight_runtime_controls as control
   where control.control_key = 'global';
  raise exception using
    message = 'Migration 090 is forward-only and cannot be rolled back safely',
    detail = format(
      'consumer_preview_active=%s', coalesce(v_control_active, false)
    ),
    hint = 'Relock Consumer Preview and deploy a reviewed forward repair; do not delete pending webhook association evidence or restore the early-event race.';
end;
$flight_consumer_preview_090_forward_only$;

rollback;
