begin;

-- Restoring the ambiguous receipt lookup would strand terminal provider
-- attempts after any future local projection failure. Preserve the repaired
-- routine and audit history; any later change must be another reviewed
-- forward migration.
do $flight_consumer_preview_086_forward_only$
declare
  v_control_active boolean;
begin
  select not control.execution_kill_switch_engaged into v_control_active
    from public.flight_runtime_controls as control
   where control.control_key = 'global';
  raise exception using
    message = 'Migration 086 is forward-only and cannot be rolled back safely',
    detail = format('consumer_preview_active=%s', coalesce(v_control_active, false)),
    hint = 'Relock Consumer Preview and deploy a reviewed forward repair; do not restore the ambiguous reprice-failure receipt lookup.';
end;
$flight_consumer_preview_086_forward_only$;

rollback;
