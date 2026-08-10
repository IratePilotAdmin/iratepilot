begin;

alter table public.priority_pms_launch_evidence
  add column if not exists webhook_validated boolean not null default false,
  add column if not exists production_smoke_validated boolean not null default false,
  add column if not exists live_enabled boolean not null default false;

alter table public.priority_pms_launch_evidence
  drop constraint if exists priority_pms_launch_evidence_activation_order,
  add constraint priority_pms_launch_evidence_activation_order check (
    (not webhook_validated or sandbox_validated)
    and (not production_smoke_validated or webhook_validated)
    and (not live_enabled or production_smoke_validated)
  );

comment on column public.priority_pms_launch_evidence.live_enabled is
  'Explicit operator-controlled production traffic switch; requires every preceding launch gate.';

commit;
