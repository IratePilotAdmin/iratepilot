begin;

create table if not exists public.automation_executor_registry (
  adapter_code text primary key check (adapter_code = 'email_outbox_receipt_check'),
  label text not null check (char_length(btrim(label)) between 2 and 120),
  source_retry_kind text not null check (source_retry_kind = 'email_delivery_review'),
  execution_mode text not null default 'internal_read_only_sandbox'
    check (execution_mode = 'internal_read_only_sandbox'),
  enabled boolean not null default false,
  network_access boolean not null default false check (not network_access),
  external_side_effects boolean not null default false check (not external_side_effects),
  updated_at timestamptz not null default now()
);

insert into public.automation_executor_registry (
  adapter_code, label, source_retry_kind
) values (
  'email_outbox_receipt_check', 'Email outbox receipt check', 'email_delivery_review'
) on conflict (adapter_code) do nothing;

create table if not exists public.automation_sandbox_executions (
  id uuid primary key default gen_random_uuid(),
  retry_request_id uuid not null unique references public.automation_retry_requests(id) on delete restrict,
  adapter_code text not null references public.automation_executor_registry(adapter_code) on delete restrict,
  idempotency_key text not null unique check (
    idempotency_key ~ '^email_outbox_receipt_check:[0-9a-f]{64}$'
  ),
  status text not null check (status in ('validated', 'blocked')),
  observed_status text check (observed_status is null or observed_status in (
    'pending', 'processing', 'sent', 'failed', 'suppressed', 'dead_letter'
  )),
  summary text not null check (
    char_length(btrim(summary)) between 2 and 500
    and public.automation_incident_text_is_safe(summary)
  ),
  execution_mode text not null default 'internal_read_only_sandbox'
    check (execution_mode = 'internal_read_only_sandbox'),
  network_accessed boolean not null default false check (not network_accessed),
  external_side_effect_created boolean not null default false check (not external_side_effect_created),
  message_sent boolean not null default false check (not message_sent),
  money_moved boolean not null default false check (not money_moved),
  executed_by uuid not null references public.profiles(id) on delete restrict,
  executed_by_name text not null check (char_length(btrim(executed_by_name)) between 1 and 200),
  created_at timestamptz not null default now(),
  check ((status = 'validated') = (observed_status is not null))
);

create index if not exists automation_sandbox_executions_created_idx
  on public.automation_sandbox_executions (created_at desc);

create table if not exists public.automation_sandbox_execution_events (
  id uuid primary key default gen_random_uuid(),
  execution_id uuid not null references public.automation_sandbox_executions(id) on delete restrict,
  event_type text not null check (event_type in ('validated', 'blocked')),
  actor_id uuid not null references public.profiles(id) on delete restrict,
  actor_name text not null check (char_length(btrim(actor_name)) between 1 and 200),
  summary text not null check (
    char_length(btrim(summary)) between 2 and 500
    and public.automation_incident_text_is_safe(summary)
  ),
  created_at timestamptz not null default now()
);

create index if not exists automation_sandbox_execution_events_execution_created_idx
  on public.automation_sandbox_execution_events (execution_id, created_at desc);

comment on table public.automation_executor_registry is
  'Database kill switch and immutable guardrails for one internal read-only sandbox adapter.';
comment on table public.automation_sandbox_executions is
  'Idempotent sanitized email-outbox receipt checks; never a sender, retry worker, or provider executor.';
comment on table public.automation_sandbox_execution_events is
  'Immutable validated or blocked receipts for internal read-only sandbox checks.';

alter table public.automation_executor_registry enable row level security;
alter table public.automation_sandbox_executions enable row level security;
alter table public.automation_sandbox_execution_events enable row level security;
revoke all on table
  public.automation_executor_registry,
  public.automation_sandbox_executions,
  public.automation_sandbox_execution_events
from public, anon, authenticated;
grant all on table
  public.automation_executor_registry,
  public.automation_sandbox_executions,
  public.automation_sandbox_execution_events
to service_role;

create or replace function public.run_email_outbox_receipt_sandbox(p_retry_request_id uuid)
returns public.automation_sandbox_executions
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_actor_id uuid := auth.uid();
  v_actor_name text;
  v_adapter public.automation_executor_registry;
  v_request public.automation_retry_requests;
  v_execution public.automation_sandbox_executions;
  v_observed_status text;
  v_receipt_found boolean := false;
  v_status text;
  v_summary text;
begin
  v_actor_name := public.automation_incident_actor_name(v_actor_id);
  select * into v_adapter
    from public.automation_executor_registry
   where adapter_code = 'email_outbox_receipt_check'
   for share;
  if not found or not v_adapter.enabled then
    raise exception 'Database sandbox-executor kill switch is disabled';
  end if;
  if v_adapter.network_access or v_adapter.external_side_effects then
    raise exception 'Sandbox adapter guardrail violation';
  end if;

  select * into v_request
    from public.automation_retry_requests
   where id = p_retry_request_id
   for update;
  if not found then raise exception 'Dry-run authorization request not found'; end if;
  if v_request.retry_kind <> 'email_delivery_review' or v_request.status <> 'dry_run_completed' then
    raise exception 'A completed email-delivery dry run is required';
  end if;

  select * into v_execution
    from public.automation_sandbox_executions
   where retry_request_id = p_retry_request_id;
  if found then return v_execution; end if;

  if v_request.target_reference ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    select status into v_observed_status
      from public.email_outbox
     where id = v_request.target_reference::uuid;
    v_receipt_found := found;
  end if;

  if v_receipt_found then
    v_status := 'validated';
    v_summary := 'Internal email outbox receipt exists with status ' || v_observed_status || '; no message was sent.';
  else
    v_status := 'blocked';
    v_summary := 'Internal email outbox receipt was not found for the sanitized reference; no message was sent.';
  end if;

  insert into public.automation_sandbox_executions (
    retry_request_id, adapter_code, idempotency_key, status, observed_status,
    summary, executed_by, executed_by_name
  ) values (
    p_retry_request_id,
    'email_outbox_receipt_check',
    'email_outbox_receipt_check:' || v_request.idempotency_key,
    v_status,
    case when v_receipt_found then v_observed_status else null end,
    v_summary,
    v_actor_id,
    v_actor_name
  ) returning * into v_execution;

  insert into public.automation_sandbox_execution_events (
    execution_id, event_type, actor_id, actor_name, summary
  ) values (
    v_execution.id, v_status, v_actor_id, v_actor_name, v_summary
  );
  return v_execution;
end;
$$;

create or replace function public.prevent_automation_sandbox_history_mutation()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  raise exception 'Automation sandbox execution history is immutable';
end;
$$;

revoke all on function public.prevent_automation_sandbox_history_mutation() from public, anon, authenticated;

drop trigger if exists automation_sandbox_executions_immutable_trigger on public.automation_sandbox_executions;
create trigger automation_sandbox_executions_immutable_trigger before update or delete on public.automation_sandbox_executions
for each row execute function public.prevent_automation_sandbox_history_mutation();
drop trigger if exists automation_sandbox_execution_events_immutable_trigger on public.automation_sandbox_execution_events;
create trigger automation_sandbox_execution_events_immutable_trigger before update or delete on public.automation_sandbox_execution_events
for each row execute function public.prevent_automation_sandbox_history_mutation();

revoke all on function public.run_email_outbox_receipt_sandbox(uuid) from public, anon, authenticated;
grant execute on function public.run_email_outbox_receipt_sandbox(uuid) to authenticated;

commit;
