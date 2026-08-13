begin;

create table if not exists public.synxis_request_journal (
  id uuid primary key default uuid_generate_v4(),
  request_id text not null check (char_length(request_id) between 1 and 200),
  attempt_number integer not null check (attempt_number between 1 and 3),
  operation text not null check (operation in ('rate_push', 'inventory_push')),
  traffic_mode text not null check (traffic_mode in ('certification', 'production_smoke', 'live')),
  status text not null default 'started' check (status in ('started', 'succeeded', 'failed')),
  http_status integer check (http_status between 100 and 599),
  started_at timestamptz not null default clock_timestamp(),
  completed_at timestamptz,
  check (completed_at is null or completed_at >= started_at),
  unique (request_id, attempt_number)
);

create index if not exists synxis_request_journal_started_at_idx
  on public.synxis_request_journal (started_at desc);

comment on table public.synxis_request_journal is
  'Non-secret transport receipts for SynXis outbound attempts; SOAP bodies and credentials are prohibited.';

alter table public.synxis_request_journal enable row level security;
revoke all on table public.synxis_request_journal from public, anon, authenticated;

create or replace function public.begin_synxis_request_attempt(
  p_request_id text,
  p_attempt_number integer,
  p_operation text,
  p_traffic_mode text
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_id uuid;
begin
  insert into public.synxis_request_journal (
    request_id, attempt_number, operation, traffic_mode
  ) values (
    btrim(p_request_id), p_attempt_number, p_operation, p_traffic_mode
  ) returning id into v_id;
  return v_id;
exception
  when unique_violation then
    raise exception 'Duplicate SynXis request attempt';
end;
$$;

create or replace function public.complete_synxis_request_attempt(
  p_id uuid,
  p_status text,
  p_http_status integer default null
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if p_status not in ('succeeded', 'failed') then
    raise exception 'Invalid SynXis request completion status';
  end if;

  update public.synxis_request_journal
     set status = p_status,
         http_status = p_http_status,
         completed_at = clock_timestamp()
   where id = p_id
     and status = 'started';

  if not found then
    raise exception 'SynXis request attempt is missing or already completed';
  end if;
end;
$$;

revoke all on function public.begin_synxis_request_attempt(text, integer, text, text)
  from public, anon, authenticated;
revoke all on function public.complete_synxis_request_attempt(uuid, text, integer)
  from public, anon, authenticated;
grant execute on function public.begin_synxis_request_attempt(text, integer, text, text)
  to service_role;
grant execute on function public.complete_synxis_request_attempt(uuid, text, integer)
  to service_role;

create or replace function public.enforce_synxis_request_journal_immutability()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'SynXis request journal receipts cannot be deleted';
  end if;
  if old.status <> 'started'
    or new.status not in ('succeeded', 'failed')
    or old.request_id is distinct from new.request_id
    or old.id is distinct from new.id
    or old.attempt_number is distinct from new.attempt_number
    or old.operation is distinct from new.operation
    or old.traffic_mode is distinct from new.traffic_mode
    or old.started_at is distinct from new.started_at
    or old.completed_at is not null
    or new.completed_at is null then
    raise exception 'SynXis request journal receipts are immutable after one completion';
  end if;
  return new;
end;
$$;

revoke all on function public.enforce_synxis_request_journal_immutability()
  from public, anon, authenticated;

drop trigger if exists synxis_request_journal_immutable_trigger
  on public.synxis_request_journal;
create trigger synxis_request_journal_immutable_trigger
before update or delete on public.synxis_request_journal
for each row execute function public.enforce_synxis_request_journal_immutability();

commit;
