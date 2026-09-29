begin;

create table if not exists public.automation_escalation_policies (
  code text primary key check (code in (
    'critical_acknowledgement', 'warning_acknowledgement', 'review_acknowledgement',
    'critical_resolution', 'warning_resolution', 'review_resolution'
  )),
  label text not null check (char_length(btrim(label)) between 2 and 120),
  severity text not null check (severity in ('review', 'warning', 'critical')),
  checkpoint text not null check (checkpoint in ('acknowledgement', 'resolution')),
  warning_minutes integer not null check (warning_minutes > 0),
  target_minutes integer not null check (target_minutes > warning_minutes),
  enabled boolean not null default true,
  created_at timestamptz not null default now()
);

insert into public.automation_escalation_policies (
  code, label, severity, checkpoint, warning_minutes, target_minutes
) values
  ('critical_acknowledgement', 'Critical acknowledgment', 'critical', 'acknowledgement', 10, 15),
  ('warning_acknowledgement', 'Warning acknowledgment', 'warning', 'acknowledgement', 45, 60),
  ('review_acknowledgement', 'Review acknowledgment', 'review', 'acknowledgement', 180, 240),
  ('critical_resolution', 'Critical resolution', 'critical', 'resolution', 90, 120),
  ('warning_resolution', 'Warning resolution', 'warning', 'resolution', 360, 480),
  ('review_resolution', 'Review resolution', 'review', 'resolution', 1080, 1440)
on conflict (code) do nothing;

create table if not exists public.automation_policy_scans (
  id uuid primary key default gen_random_uuid(),
  scheduled_for date not null unique,
  observed_at timestamptz not null,
  scanner_mode text not null default 'observation_only' check (scanner_mode = 'observation_only'),
  incident_count integer not null default 0 check (incident_count >= 0),
  finding_count integer not null default 0 check (finding_count >= 0),
  provider_attention_count integer not null default 0 check (provider_attention_count >= 0),
  created_at timestamptz not null default now()
);

create table if not exists public.automation_slo_evaluations (
  id uuid primary key default gen_random_uuid(),
  scan_id uuid not null references public.automation_policy_scans(id) on delete restrict,
  incident_id uuid not null references public.automation_incidents(id) on delete restrict,
  policy_code text not null references public.automation_escalation_policies(code) on delete restrict,
  state text not null check (state in ('within_target', 'at_risk', 'breached')),
  elapsed_minutes integer not null check (elapsed_minutes >= 0),
  warning_minutes integer not null check (warning_minutes > 0),
  target_minutes integer not null check (target_minutes > warning_minutes),
  evaluated_at timestamptz not null,
  unique (scan_id, incident_id, policy_code)
);

create index if not exists automation_slo_evaluations_scan_state_idx
  on public.automation_slo_evaluations (scan_id, state);

create table if not exists public.automation_provider_health_snapshots (
  id uuid primary key default gen_random_uuid(),
  scan_id uuid not null references public.automation_policy_scans(id) on delete restrict,
  provider_lane text not null check (provider_lane in ('communications', 'payments', 'pms', 'synxis')),
  state text not null check (state in ('healthy', 'attention')),
  failure_count integer not null check (failure_count >= 0),
  stalled_count integer not null check (stalled_count >= 0),
  observed_at timestamptz not null,
  unique (scan_id, provider_lane)
);

create table if not exists public.automation_escalations (
  id uuid primary key default gen_random_uuid(),
  incident_id uuid not null references public.automation_incidents(id) on delete restrict,
  policy_code text not null references public.automation_escalation_policies(code) on delete restrict,
  status text not null default 'open' check (status in ('open', 'acknowledged', 'resolved')),
  first_detected_at timestamptz not null,
  latest_detected_at timestamptz not null,
  acknowledged_by uuid references public.profiles(id) on delete restrict,
  acknowledged_by_name text check (acknowledged_by_name is null or char_length(btrim(acknowledged_by_name)) between 1 and 200),
  acknowledged_at timestamptz,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (incident_id, policy_code),
  check ((acknowledged_at is null) = (acknowledged_by is null)),
  check ((acknowledged_at is null) = (acknowledged_by_name is null)),
  check (status = 'open' or acknowledged_at is not null or status = 'resolved'),
  check ((status = 'resolved') = (resolved_at is not null)),
  check (latest_detected_at >= first_detected_at),
  check (acknowledged_at is null or acknowledged_at >= first_detected_at),
  check (resolved_at is null or resolved_at >= first_detected_at),
  check (updated_at >= created_at)
);

create index if not exists automation_escalations_status_detected_idx
  on public.automation_escalations (status, latest_detected_at desc);

create table if not exists public.automation_escalation_events (
  id uuid primary key default gen_random_uuid(),
  escalation_id uuid not null references public.automation_escalations(id) on delete restrict,
  event_type text not null check (event_type in ('detected', 'acknowledged', 'resolved')),
  actor_id uuid references public.profiles(id) on delete restrict,
  actor_name text not null check (char_length(btrim(actor_name)) between 1 and 200),
  summary text not null check (
    char_length(btrim(summary)) between 2 and 1000
    and public.automation_incident_text_is_safe(summary)
  ),
  created_at timestamptz not null default now()
);

create index if not exists automation_escalation_events_escalation_created_idx
  on public.automation_escalation_events (escalation_id, created_at desc);

comment on table public.automation_policy_scans is
  'Idempotent daily observation-only SLO scans; never an automation executor or notification sender.';
comment on table public.automation_provider_health_snapshots is
  'Internal ledger-derived provider health; no provider endpoint is contacted.';
comment on table public.automation_escalation_events is
  'Immutable detection, acknowledgment, and automatic resolution receipts.';

alter table public.automation_escalation_policies enable row level security;
alter table public.automation_policy_scans enable row level security;
alter table public.automation_slo_evaluations enable row level security;
alter table public.automation_provider_health_snapshots enable row level security;
alter table public.automation_escalations enable row level security;
alter table public.automation_escalation_events enable row level security;
revoke all on table
  public.automation_escalation_policies,
  public.automation_policy_scans,
  public.automation_slo_evaluations,
  public.automation_provider_health_snapshots,
  public.automation_escalations,
  public.automation_escalation_events
from public, anon, authenticated;
grant all on table
  public.automation_escalation_policies,
  public.automation_policy_scans,
  public.automation_slo_evaluations,
  public.automation_provider_health_snapshots,
  public.automation_escalations,
  public.automation_escalation_events
to service_role;

create or replace function public.run_automation_policy_scan(p_observed_at timestamptz default now())
returns public.automation_policy_scans
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_scheduled_for date := (p_observed_at at time zone 'UTC')::date;
  v_scan public.automation_policy_scans;
  v_evaluation record;
  v_escalation public.automation_escalations;
  v_failure_count integer;
  v_stalled_count integer;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Service-role policy scanner authorization required';
  end if;

  insert into public.automation_policy_scans (scheduled_for, observed_at)
  values (v_scheduled_for, p_observed_at)
  on conflict (scheduled_for) do nothing
  returning * into v_scan;
  if v_scan.id is null then
    select * into v_scan from public.automation_policy_scans where scheduled_for = v_scheduled_for;
    return v_scan;
  end if;

  insert into public.automation_slo_evaluations (
    scan_id, incident_id, policy_code, state, elapsed_minutes,
    warning_minutes, target_minutes, evaluated_at
  )
  select
    v_scan.id,
    incident.id,
    policy.code,
    case
      when elapsed.minutes >= policy.target_minutes then 'breached'
      when elapsed.minutes >= policy.warning_minutes then 'at_risk'
      else 'within_target'
    end,
    elapsed.minutes,
    policy.warning_minutes,
    policy.target_minutes,
    p_observed_at
  from public.automation_incidents incident
  join public.automation_escalation_policies policy
    on policy.severity = incident.severity and policy.enabled
  cross join lateral (
    select greatest(0, floor(extract(epoch from (
      p_observed_at - case
        when policy.checkpoint = 'acknowledgement' then incident.created_at
        else incident.acknowledged_at
      end
    )) / 60)::integer) as minutes
  ) elapsed
  where
    (policy.checkpoint = 'acknowledgement' and incident.status = 'open')
    or (policy.checkpoint = 'resolution' and incident.status = 'acknowledged');

  select count(*) into v_failure_count
    from public.email_outbox
   where status in ('failed', 'dead_letter') and updated_at >= p_observed_at - interval '24 hours';
  select count(*) into v_stalled_count
    from public.email_outbox
   where status = 'processing' and updated_at < p_observed_at - interval '1 hour';
  insert into public.automation_provider_health_snapshots
    (scan_id, provider_lane, state, failure_count, stalled_count, observed_at)
  values (v_scan.id, 'communications', case when v_failure_count + v_stalled_count > 0 then 'attention' else 'healthy' end, v_failure_count, v_stalled_count, p_observed_at);

  select count(*) into v_failure_count
    from public.stripe_financial_events
   where processing_status = 'failed' and updated_at >= p_observed_at - interval '24 hours';
  select count(*) into v_stalled_count
    from public.stripe_financial_events
   where processing_status = 'processing' and updated_at < p_observed_at - interval '1 hour';
  insert into public.automation_provider_health_snapshots
    (scan_id, provider_lane, state, failure_count, stalled_count, observed_at)
  values (v_scan.id, 'payments', case when v_failure_count + v_stalled_count > 0 then 'attention' else 'healthy' end, v_failure_count, v_stalled_count, p_observed_at);

  select count(*) into v_failure_count
    from public.pms_connection_test_events
   where result = 'failed' and created_at >= p_observed_at - interval '24 hours';
  v_stalled_count := 0;
  insert into public.automation_provider_health_snapshots
    (scan_id, provider_lane, state, failure_count, stalled_count, observed_at)
  values (v_scan.id, 'pms', case when v_failure_count > 0 then 'attention' else 'healthy' end, v_failure_count, v_stalled_count, p_observed_at);

  select count(*) into v_failure_count
    from public.synxis_request_journal
   where status = 'failed' and started_at >= p_observed_at - interval '24 hours';
  select count(*) into v_stalled_count
    from public.synxis_request_journal
   where status = 'started' and started_at < p_observed_at - interval '1 hour';
  insert into public.automation_provider_health_snapshots
    (scan_id, provider_lane, state, failure_count, stalled_count, observed_at)
  values (v_scan.id, 'synxis', case when v_failure_count + v_stalled_count > 0 then 'attention' else 'healthy' end, v_failure_count, v_stalled_count, p_observed_at);

  for v_evaluation in
    select evaluation.*
      from public.automation_slo_evaluations evaluation
     where evaluation.scan_id = v_scan.id and evaluation.state = 'breached'
  loop
    select * into v_escalation
      from public.automation_escalations
     where incident_id = v_evaluation.incident_id and policy_code = v_evaluation.policy_code
     for update;
    if not found then
      insert into public.automation_escalations (
        incident_id, policy_code, first_detected_at, latest_detected_at
      ) values (
        v_evaluation.incident_id, v_evaluation.policy_code, p_observed_at, p_observed_at
      ) returning * into v_escalation;
      insert into public.automation_escalation_events (
        escalation_id, event_type, actor_id, actor_name, summary
      ) values (
        v_escalation.id, 'detected', null, 'Scheduled policy scanner',
        'SLO breach detected from internal incident timing; no external notification was sent.'
      );
    elsif v_escalation.status <> 'resolved' then
      update public.automation_escalations
         set latest_detected_at = p_observed_at, updated_at = now()
       where id = v_escalation.id;
    end if;
  end loop;

  for v_escalation in
    select escalation.*
      from public.automation_escalations escalation
      join public.automation_escalation_policies policy on policy.code = escalation.policy_code
      join public.automation_incidents incident on incident.id = escalation.incident_id
     where escalation.status <> 'resolved'
       and (
         (policy.checkpoint = 'acknowledgement' and incident.status <> 'open')
         or (policy.checkpoint = 'resolution' and incident.status = 'resolved')
       )
     for update of escalation
  loop
    update public.automation_escalations
       set status = 'resolved', resolved_at = p_observed_at, updated_at = now()
     where id = v_escalation.id;
    insert into public.automation_escalation_events (
      escalation_id, event_type, actor_id, actor_name, summary
    ) values (
      v_escalation.id, 'resolved', null, 'Scheduled policy scanner',
      'Escalation resolved after the source incident reached its policy checkpoint.'
    );
  end loop;

  update public.automation_policy_scans
     set incident_count = (
           select count(distinct incident_id) from public.automation_slo_evaluations where scan_id = v_scan.id
         ),
         finding_count = (
           select count(*) from public.automation_slo_evaluations where scan_id = v_scan.id and state = 'breached'
         ),
         provider_attention_count = (
           select count(*) from public.automation_provider_health_snapshots where scan_id = v_scan.id and state = 'attention'
         )
   where id = v_scan.id
   returning * into v_scan;
  return v_scan;
end;
$$;

create or replace function public.acknowledge_automation_escalation(
  p_escalation_id uuid,
  p_note text
)
returns public.automation_escalations
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_actor_id uuid := auth.uid();
  v_actor_name text;
  v_escalation public.automation_escalations;
begin
  v_actor_name := public.automation_incident_actor_name(v_actor_id);
  if char_length(btrim(coalesce(p_note, ''))) not between 2 and 500
     or not public.automation_incident_text_is_safe(p_note) then
    raise exception 'A sanitized acknowledgment note is required';
  end if;
  select * into v_escalation
    from public.automation_escalations
   where id = p_escalation_id
   for update;
  if not found then raise exception 'Automation escalation not found'; end if;
  if v_escalation.status = 'resolved' then raise exception 'Resolved escalations cannot be acknowledged'; end if;
  if v_escalation.status = 'acknowledged' then return v_escalation; end if;

  update public.automation_escalations
     set status = 'acknowledged', acknowledged_by = v_actor_id,
         acknowledged_by_name = v_actor_name, acknowledged_at = now(), updated_at = now()
   where id = p_escalation_id
   returning * into v_escalation;
  insert into public.automation_escalation_events (
    escalation_id, event_type, actor_id, actor_name, summary
  ) values (
    p_escalation_id, 'acknowledged', v_actor_id, v_actor_name,
    'Escalation acknowledged: ' || btrim(p_note)
  );
  return v_escalation;
end;
$$;

create or replace function public.prevent_automation_policy_history_mutation()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  raise exception 'Automation policy history is immutable';
end;
$$;

revoke all on function public.prevent_automation_policy_history_mutation() from public, anon, authenticated;

drop trigger if exists automation_escalation_policies_immutable_trigger on public.automation_escalation_policies;
create trigger automation_escalation_policies_immutable_trigger before update or delete on public.automation_escalation_policies
for each row execute function public.prevent_automation_policy_history_mutation();
drop trigger if exists automation_slo_evaluations_immutable_trigger on public.automation_slo_evaluations;
create trigger automation_slo_evaluations_immutable_trigger before update or delete on public.automation_slo_evaluations
for each row execute function public.prevent_automation_policy_history_mutation();
drop trigger if exists automation_provider_health_snapshots_immutable_trigger on public.automation_provider_health_snapshots;
create trigger automation_provider_health_snapshots_immutable_trigger before update or delete on public.automation_provider_health_snapshots
for each row execute function public.prevent_automation_policy_history_mutation();
drop trigger if exists automation_escalation_events_immutable_trigger on public.automation_escalation_events;
create trigger automation_escalation_events_immutable_trigger before update or delete on public.automation_escalation_events
for each row execute function public.prevent_automation_policy_history_mutation();

revoke all on function public.run_automation_policy_scan(timestamptz) from public, anon, authenticated;
revoke all on function public.acknowledge_automation_escalation(uuid,text) from public, anon, authenticated;
grant execute on function public.run_automation_policy_scan(timestamptz) to service_role;
grant execute on function public.acknowledge_automation_escalation(uuid,text) to authenticated;

commit;
