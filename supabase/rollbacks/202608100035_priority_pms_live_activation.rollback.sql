begin;

do $$
begin
  if exists (
    select 1 from public.priority_pms_launch_evidence
    where webhook_validated or production_smoke_validated or live_enabled
  ) then
    raise exception 'Refusing rollback: priority PMS live activation evidence exists';
  end if;
end $$;

alter table public.priority_pms_launch_evidence
  drop constraint if exists priority_pms_launch_evidence_activation_order,
  drop column if exists live_enabled,
  drop column if exists production_smoke_validated,
  drop column if exists webhook_validated;

commit;
