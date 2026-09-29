begin;

-- Migration 092 can create durable reconciliation evidence for already
-- terminal payment attempts. Reverting its wrappers would silently restore
-- redispatch/stranding hazards and deleting those cases would erase evidence.
do $flight_consumer_preview_092_forward_only$
declare
  v_control_active boolean;
begin
  select not control.execution_kill_switch_engaged into v_control_active
    from public.flight_runtime_controls as control
   where control.control_key = 'global';
  raise exception using
    message = 'Migration 092 is forward-only and cannot be rolled back safely',
    detail = format('consumer_preview_active=%s', coalesce(v_control_active, false)),
    hint = 'Relock Consumer Preview and deploy a reviewed forward repair; never erase terminal capture reconciliation or restore mutable-binding terminal replay.';
end;
$flight_consumer_preview_092_forward_only$;

rollback;
