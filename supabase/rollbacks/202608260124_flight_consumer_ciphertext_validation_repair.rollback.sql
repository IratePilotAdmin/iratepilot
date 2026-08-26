begin;

-- Restoring the inherited repetition bounds would make PostgreSQL raise
-- SQLSTATE 2201B whenever affected ciphertext validation runs. Preserve the
-- repaired constraints, routines, and audit history; any later change must be
-- another reviewed forward migration.
do $flight_consumer_preview_085_forward_only$
declare
  v_control_active boolean;
begin
  select not control.execution_kill_switch_engaged into v_control_active
    from public.flight_runtime_controls as control
   where control.control_key = 'global';
  raise exception using
    message = 'Migration 085 is forward-only and cannot be rolled back safely',
    detail = format('consumer_preview_active=%s', coalesce(v_control_active, false)),
    hint = 'Relock Consumer Preview and deploy a reviewed forward repair; do not restore PostgreSQL-incompatible ciphertext validators.';
end;
$flight_consumer_preview_085_forward_only$;

rollback;
