begin;

-- Restoring the known SQLSTATE-42702 activation wrapper would deliberately
-- reintroduce a runtime defect. Preserve the repaired function and its audit
-- history; any later change must be another reviewed forward migration.
do $flight_consumer_preview_082_forward_only$
declare
  v_control_active boolean;
begin
  select not control.execution_kill_switch_engaged into v_control_active
    from public.flight_runtime_controls as control
   where control.control_key = 'global';
  raise exception using
    message = 'Migration 082 is forward-only and cannot be rolled back safely',
    detail = format('consumer_preview_active=%s', coalesce(v_control_active, false)),
    hint = 'Relock Consumer Preview and deploy a reviewed forward repair; do not restore the ambiguous migration-081 activation CAS.';
end;
$flight_consumer_preview_082_forward_only$;

rollback;
