begin;

-- Restoring any ambiguous terminal projection could strand terminal-success
-- Stripe captures, terminal Duffel TEST order responses, synchronous or async
-- booking finalization, or safety-critical refund compensation. Preserve the
-- repaired routines and audit history; any later change must be a reviewed
-- forward migration.
do $flight_consumer_preview_087_forward_only$
declare
  v_control_active boolean;
begin
  select not control.execution_kill_switch_engaged into v_control_active
    from public.flight_runtime_controls as control
   where control.control_key = 'global';
  raise exception using
    message = 'Migration 087 is forward-only and cannot be rolled back safely',
    detail = format('consumer_preview_active=%s', coalesce(v_control_active, false)),
    hint = 'Relock Consumer Preview and deploy a reviewed forward repair; do not restore ambiguous capture, Duffel terminal/finalization, or refund projections.';
end;
$flight_consumer_preview_087_forward_only$;

rollback;
