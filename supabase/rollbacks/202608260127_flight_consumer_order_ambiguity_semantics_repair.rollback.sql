begin;

-- Restoring the migration-075 ambiguity semantics would make reviewed replay
-- unreachable again and could route a definitive provider failure toward
-- provider-created recovery. Preserve the repaired evidence interpretation;
-- any later change must be a reviewed forward migration from a relocked state.
do $flight_consumer_preview_088_forward_only$
declare
  v_control_active boolean;
begin
  select not control.execution_kill_switch_engaged into v_control_active
    from public.flight_runtime_controls as control
   where control.control_key = 'global';
  raise exception using
    message = 'Migration 088 is forward-only and cannot be rolled back safely',
    detail = format('consumer_preview_active=%s', coalesce(v_control_active, false)),
    hint = 'Relock Consumer Preview and deploy a reviewed forward repair; do not restore unreachable reviewed replay or unsafe terminal-failure targeting.';
end;
$flight_consumer_preview_088_forward_only$;

rollback;
