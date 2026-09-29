begin;

-- Completion leases are durable idempotency evidence. Deleting them can turn
-- an already-captured or already-dispatched workflow into a second execution,
-- so rollback must be a reviewed forward repair while Preview is relocked.
do $flight_consumer_preview_091_forward_only$
declare
  v_control_active boolean;
begin
  select not control.execution_kill_switch_engaged into v_control_active
    from public.flight_runtime_controls as control
   where control.control_key = 'global';
  raise exception using
    message = 'Migration 091 is forward-only and cannot be rolled back safely',
    detail = format('consumer_preview_active=%s', coalesce(v_control_active, false)),
    hint = 'Relock Consumer Preview and deploy a reviewed forward repair; never delete completion idempotency or lease evidence.';
end;
$flight_consumer_preview_091_forward_only$;

rollback;
