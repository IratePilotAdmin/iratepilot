begin;

create table if not exists public.automation_retry_requests (
  id uuid primary key default gen_random_uuid(),
  incident_id uuid not null references public.automation_incidents(id) on delete restrict,
  retry_kind text not null check (retry_kind in (
    'email_delivery_review',
    'stripe_event_reconciliation',
    'supplier_validation_review',
    'booking_operation_review'
  )),
  target_reference text not null check (
    char_length(btrim(target_reference)) between 2 and 200
    and public.automation_incident_text_is_safe(target_reference)
  ),
  reason text not null check (
    char_length(btrim(reason)) between 8 and 1000
    and public.automation_incident_text_is_safe(reason)
  ),
  idempotency_key text not null unique check (idempotency_key ~ '^[0-9a-f]{64}$'),
  status text not null default 'pending_approval' check (status in (
    'pending_approval', 'approved', 'dry_run_completed', 'cancelled'
  )),
  execution_mode text not null default 'dry_run_only' check (execution_mode = 'dry_run_only'),
  external_execution_requested boolean not null default false check (not external_execution_requested),
  dry_run_result text check (dry_run_result is null or dry_run_result = 'validated_no_executor'),
  requested_by uuid not null references public.profiles(id) on delete restrict,
  requested_by_name text not null check (char_length(btrim(requested_by_name)) between 1 and 200),
  updated_by uuid not null references public.profiles(id) on delete restrict,
  completed_at timestamptz,
  cancelled_by uuid references public.profiles(id) on delete restrict,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((status = 'dry_run_completed') = (completed_at is not null)),
  check ((status = 'dry_run_completed') = (dry_run_result is not null)),
  check ((status = 'cancelled') = (cancelled_at is not null)),
  check ((cancelled_at is null) = (cancelled_by is null)),
  check (completed_at is null or completed_at >= created_at),
  check (cancelled_at is null or cancelled_at >= created_at),
  check (updated_at >= created_at)
);

create index if not exists automation_retry_requests_status_updated_idx
  on public.automation_retry_requests (status, updated_at desc);
create index if not exists automation_retry_requests_incident_created_idx
  on public.automation_retry_requests (incident_id, created_at desc);

create table if not exists public.automation_retry_approvals (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.automation_retry_requests(id) on delete restrict,
  approver_id uuid not null references public.profiles(id) on delete restrict,
  approver_name text not null check (char_length(btrim(approver_name)) between 1 and 200),
  created_at timestamptz not null default now(),
  unique (request_id, approver_id)
);

create index if not exists automation_retry_approvals_request_created_idx
  on public.automation_retry_approvals (request_id, created_at desc);

create table if not exists public.automation_retry_receipts (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.automation_retry_requests(id) on delete restrict,
  receipt_type text not null check (receipt_type in (
    'requested', 'approved', 'approval_quorum_reached', 'cancelled', 'dry_run_validated'
  )),
  actor_id uuid not null references public.profiles(id) on delete restrict,
  actor_name text not null check (char_length(btrim(actor_name)) between 1 and 200),
  summary text not null check (char_length(btrim(summary)) between 2 and 500),
  created_at timestamptz not null default now()
);

create index if not exists automation_retry_receipts_request_created_idx
  on public.automation_retry_receipts (request_id, created_at desc);

comment on table public.automation_retry_requests is
  'Admin-only, idempotent authorization records for dry-run validation; never an external automation executor.';
comment on table public.automation_retry_approvals is
  'Immutable approvals from two distinct administrators, excluding the request creator.';
comment on table public.automation_retry_receipts is
  'Immutable request, approval, cancellation, and dry-run validation receipts.';

alter table public.automation_retry_requests enable row level security;
alter table public.automation_retry_approvals enable row level security;
alter table public.automation_retry_receipts enable row level security;
revoke all on table public.automation_retry_requests, public.automation_retry_approvals, public.automation_retry_receipts
  from public, anon, authenticated;
grant all on table public.automation_retry_requests, public.automation_retry_approvals, public.automation_retry_receipts
  to service_role;

create or replace function public.create_automation_retry_request(
  p_incident_id uuid,
  p_retry_kind text,
  p_target_reference text,
  p_reason text,
  p_idempotency_key text
)
returns public.automation_retry_requests
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_actor_id uuid := auth.uid();
  v_actor_name text;
  v_incident public.automation_incidents;
  v_request public.automation_retry_requests;
begin
  v_actor_name := public.automation_incident_actor_name(v_actor_id);
  select * into v_incident
    from public.automation_incidents
   where id = p_incident_id
   for update;
  if not found then raise exception 'Automation incident not found'; end if;
  if v_incident.status <> 'acknowledged' then
    raise exception 'An acknowledged, unresolved incident is required';
  end if;

  insert into public.automation_retry_requests (
    incident_id, retry_kind, target_reference, reason, idempotency_key,
    requested_by, requested_by_name, updated_by
  ) values (
    p_incident_id, p_retry_kind, btrim(p_target_reference), btrim(p_reason), p_idempotency_key,
    v_actor_id, v_actor_name, v_actor_id
  )
  on conflict (idempotency_key) do nothing
  returning * into v_request;

  if v_request.id is null then
    select * into v_request
      from public.automation_retry_requests
     where idempotency_key = p_idempotency_key;
    return v_request;
  end if;

  insert into public.automation_retry_receipts (
    request_id, receipt_type, actor_id, actor_name, summary
  ) values (
    v_request.id, 'requested', v_actor_id, v_actor_name,
    'Dry-run-only authorization requested; no executor was invoked.'
  );
  return v_request;
end;
$$;

create or replace function public.approve_automation_retry_request(p_request_id uuid)
returns public.automation_retry_requests
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_actor_id uuid := auth.uid();
  v_actor_name text;
  v_request public.automation_retry_requests;
  v_incident public.automation_incidents;
  v_approval_count integer;
  v_rows integer;
begin
  v_actor_name := public.automation_incident_actor_name(v_actor_id);
  select * into v_request
    from public.automation_retry_requests
   where id = p_request_id
   for update;
  if not found then raise exception 'Dry-run request not found'; end if;
  if v_request.requested_by = v_actor_id then raise exception 'Requesters cannot approve their own request'; end if;
  if v_request.status not in ('pending_approval', 'approved') then raise exception 'Request cannot receive approvals'; end if;
  select * into v_incident
    from public.automation_incidents
   where id = v_request.incident_id and status = 'acknowledged'
   for key share;
  if not found then raise exception 'The source incident must remain acknowledged and unresolved'; end if;
  if v_request.status = 'approved' then
    perform 1 from public.automation_retry_approvals
     where request_id = p_request_id and approver_id = v_actor_id;
    if found then return v_request; end if;
    raise exception 'The approval quorum is already complete';
  end if;

  insert into public.automation_retry_approvals (request_id, approver_id, approver_name)
  values (p_request_id, v_actor_id, v_actor_name)
  on conflict (request_id, approver_id) do nothing;
  get diagnostics v_rows = row_count;

  if v_rows = 1 then
    insert into public.automation_retry_receipts (request_id, receipt_type, actor_id, actor_name, summary)
    values (p_request_id, 'approved', v_actor_id, v_actor_name, 'Independent administrator approval recorded.');
  end if;

  select count(*) into v_approval_count
    from public.automation_retry_approvals
   where request_id = p_request_id;

  if v_approval_count >= 2 and v_request.status = 'pending_approval' then
    update public.automation_retry_requests
       set status = 'approved', updated_by = v_actor_id, updated_at = now()
     where id = p_request_id
     returning * into v_request;
    insert into public.automation_retry_receipts (request_id, receipt_type, actor_id, actor_name, summary)
    values (p_request_id, 'approval_quorum_reached', v_actor_id, v_actor_name, 'Two distinct administrator approvals recorded; dry-run validation is available.');
  end if;
  return v_request;
end;
$$;

create or replace function public.cancel_automation_retry_request(p_request_id uuid)
returns public.automation_retry_requests
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_actor_id uuid := auth.uid();
  v_actor_name text;
  v_request public.automation_retry_requests;
begin
  v_actor_name := public.automation_incident_actor_name(v_actor_id);
  select * into v_request
    from public.automation_retry_requests
   where id = p_request_id
   for update;
  if not found then raise exception 'Dry-run request not found'; end if;
  if v_request.status = 'dry_run_completed' then raise exception 'Completed dry runs cannot be cancelled'; end if;
  if v_request.status = 'cancelled' then return v_request; end if;

  update public.automation_retry_requests
     set status = 'cancelled', cancelled_by = v_actor_id, cancelled_at = now(),
         updated_by = v_actor_id, updated_at = now()
   where id = p_request_id
   returning * into v_request;
  insert into public.automation_retry_receipts (request_id, receipt_type, actor_id, actor_name, summary)
  values (p_request_id, 'cancelled', v_actor_id, v_actor_name, 'Dry-run authorization request cancelled; no executor was invoked.');
  return v_request;
end;
$$;

create or replace function public.record_automation_retry_dry_run(p_request_id uuid)
returns public.automation_retry_requests
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_actor_id uuid := auth.uid();
  v_actor_name text;
  v_request public.automation_retry_requests;
  v_incident public.automation_incidents;
  v_approval_count integer;
begin
  v_actor_name := public.automation_incident_actor_name(v_actor_id);
  select * into v_request
    from public.automation_retry_requests
   where id = p_request_id
   for update;
  if not found then raise exception 'Dry-run request not found'; end if;
  if v_request.status = 'dry_run_completed' then return v_request; end if;
  if v_request.status <> 'approved' then raise exception 'Two distinct approvals are required'; end if;
  select * into v_incident
    from public.automation_incidents
   where id = v_request.incident_id and status = 'acknowledged'
   for key share;
  if not found then raise exception 'The source incident must remain acknowledged and unresolved'; end if;

  select count(distinct approver_id) into v_approval_count
    from public.automation_retry_approvals
   where request_id = p_request_id;
  if v_approval_count < 2 then raise exception 'Two distinct approvals are required'; end if;

  update public.automation_retry_requests
     set status = 'dry_run_completed', dry_run_result = 'validated_no_executor',
         completed_at = now(), updated_by = v_actor_id, updated_at = now()
   where id = p_request_id
   returning * into v_request;
  insert into public.automation_retry_receipts (request_id, receipt_type, actor_id, actor_name, summary)
  values (p_request_id, 'dry_run_validated', v_actor_id, v_actor_name, 'Dry-run validation completed; no executor or external provider was invoked.');
  return v_request;
end;
$$;

create or replace function public.prevent_automation_retry_history_mutation()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  raise exception 'Automation retry approval and receipt history is immutable';
end;
$$;

revoke all on function public.prevent_automation_retry_history_mutation() from public, anon, authenticated;

drop trigger if exists automation_retry_approvals_immutable_trigger on public.automation_retry_approvals;
create trigger automation_retry_approvals_immutable_trigger
before update or delete on public.automation_retry_approvals
for each row execute function public.prevent_automation_retry_history_mutation();

drop trigger if exists automation_retry_receipts_immutable_trigger on public.automation_retry_receipts;
create trigger automation_retry_receipts_immutable_trigger
before update or delete on public.automation_retry_receipts
for each row execute function public.prevent_automation_retry_history_mutation();

revoke all on function public.create_automation_retry_request(uuid,text,text,text,text) from public, anon, authenticated;
revoke all on function public.approve_automation_retry_request(uuid) from public, anon, authenticated;
revoke all on function public.cancel_automation_retry_request(uuid) from public, anon, authenticated;
revoke all on function public.record_automation_retry_dry_run(uuid) from public, anon, authenticated;
grant execute on function public.create_automation_retry_request(uuid,text,text,text,text) to authenticated;
grant execute on function public.approve_automation_retry_request(uuid) to authenticated;
grant execute on function public.cancel_automation_retry_request(uuid) to authenticated;
grant execute on function public.record_automation_retry_dry_run(uuid) to authenticated;

commit;
