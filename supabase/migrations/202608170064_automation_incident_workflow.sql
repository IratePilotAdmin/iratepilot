begin;

create or replace function public.automation_incident_text_is_safe(p_value text)
returns boolean
language sql
immutable
set search_path = pg_catalog
as $$
  select coalesce(p_value, '') !~* '\m(password|passwd|secret|api[_ -]?key|access[_ -]?token|refresh[_ -]?token|authorization|bearer)\M[[:space:]]*[:=]'
    and coalesce(p_value, '') !~* '\m(sk|rk|pk)_(live|test)_[a-z0-9]{12,}\M'
    and coalesce(p_value, '') !~ '\m[0-9]{13,19}\M';
$$;

revoke all on function public.automation_incident_text_is_safe(text) from public, anon, authenticated;

create table if not exists public.automation_incidents (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(btrim(title)) between 8 and 160 and public.automation_incident_text_is_safe(title)),
  lane text not null check (lane in ('communications','bookings','partners','support','payments','suppliers')),
  runbook_id text not null check (runbook_id = lane),
  severity text not null check (severity in ('review','warning','critical')),
  status text not null default 'open' check (status in ('open','acknowledged','resolved')),
  source_reference text check (source_reference is null or (
    char_length(btrim(source_reference)) between 1 and 200
    and public.automation_incident_text_is_safe(source_reference)
  )),
  assigned_to uuid references public.profiles(id) on delete restrict,
  created_by uuid not null references public.profiles(id) on delete restrict,
  acknowledged_by uuid references public.profiles(id) on delete restrict,
  acknowledged_at timestamptz,
  resolved_by uuid references public.profiles(id) on delete restrict,
  resolved_at timestamptz,
  updated_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((acknowledged_at is null) = (acknowledged_by is null)),
  check ((resolved_at is null) = (resolved_by is null)),
  check (status = 'open' or acknowledged_at is not null),
  check (status <> 'resolved' or resolved_at is not null),
  check (acknowledged_at is null or acknowledged_at >= created_at),
  check (resolved_at is null or resolved_at >= acknowledged_at),
  check (updated_at >= created_at)
);

create index if not exists automation_incidents_status_updated_idx
  on public.automation_incidents (status, updated_at desc);
create index if not exists automation_incidents_assigned_updated_idx
  on public.automation_incidents (assigned_to, updated_at desc);

create table if not exists public.automation_incident_notes (
  id uuid primary key default gen_random_uuid(),
  incident_id uuid not null references public.automation_incidents(id) on delete restrict,
  author_id uuid not null references public.profiles(id) on delete restrict,
  body text not null check (char_length(btrim(body)) between 2 and 2000 and public.automation_incident_text_is_safe(body)),
  created_at timestamptz not null default now()
);

create index if not exists automation_incident_notes_incident_created_idx
  on public.automation_incident_notes (incident_id, created_at desc);

create table if not exists public.automation_incident_events (
  id uuid primary key default gen_random_uuid(),
  incident_id uuid not null references public.automation_incidents(id) on delete restrict,
  event_type text not null check (event_type in ('created','acknowledged','assigned','unassigned','note_added','resolved')),
  actor_id uuid not null references public.profiles(id) on delete restrict,
  actor_name text not null check (char_length(btrim(actor_name)) between 1 and 200),
  summary text not null check (char_length(btrim(summary)) between 2 and 500),
  created_at timestamptz not null default now()
);

create index if not exists automation_incident_events_incident_created_idx
  on public.automation_incident_events (incident_id, created_at desc);

comment on table public.automation_incidents is
  'Admin-owned incident coordination records; never an authorization or executor for external automation.';
comment on table public.automation_incident_notes is
  'Immutable, sanitized operator notes for automation incidents.';
comment on table public.automation_incident_events is
  'Immutable acknowledgment, assignment, note, and resolution receipts for automation incidents.';

alter table public.automation_incidents enable row level security;
alter table public.automation_incident_notes enable row level security;
alter table public.automation_incident_events enable row level security;
revoke all on table public.automation_incidents, public.automation_incident_notes, public.automation_incident_events
  from public, anon, authenticated;
grant all on table public.automation_incidents, public.automation_incident_notes, public.automation_incident_events
  to service_role;

create or replace function public.automation_incident_actor_name(p_actor_id uuid)
returns text
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_actor_name text;
begin
  select coalesce(nullif(btrim(full_name), ''), 'Administrator')
    into v_actor_name
    from public.profiles
   where id = p_actor_id and role = 'admin';
  if not found then raise exception 'Administrator authorization required'; end if;
  return v_actor_name;
end;
$$;

revoke all on function public.automation_incident_actor_name(uuid) from public, anon, authenticated;

create or replace function public.create_automation_incident(
  p_title text,
  p_lane text,
  p_severity text,
  p_source_reference text default null
)
returns public.automation_incidents
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_actor_id uuid := auth.uid();
  v_actor_name text;
  v_incident public.automation_incidents;
begin
  v_actor_name := public.automation_incident_actor_name(v_actor_id);
  insert into public.automation_incidents (
    title, lane, runbook_id, severity, source_reference, created_by, updated_by
  ) values (
    btrim(p_title), p_lane, p_lane, p_severity, nullif(btrim(p_source_reference), ''), v_actor_id, v_actor_id
  ) returning * into v_incident;

  insert into public.automation_incident_events (
    incident_id, event_type, actor_id, actor_name, summary
  ) values (
    v_incident.id, 'created', v_actor_id, v_actor_name,
    'Incident created for the ' || replace(p_lane, '_', ' ') || ' runbook.'
  );
  return v_incident;
end;
$$;

create or replace function public.update_automation_incident(
  p_incident_id uuid,
  p_action text,
  p_assignee_id uuid default null,
  p_resolution_note text default null
)
returns public.automation_incidents
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_actor_id uuid := auth.uid();
  v_actor_name text;
  v_assignee_name text;
  v_incident public.automation_incidents;
begin
  v_actor_name := public.automation_incident_actor_name(v_actor_id);
  select * into v_incident from public.automation_incidents where id = p_incident_id for update;
  if not found then raise exception 'Automation incident not found'; end if;

  if p_action = 'acknowledge' then
    if v_incident.status = 'resolved' then raise exception 'Resolved incidents cannot be acknowledged'; end if;
    if v_incident.acknowledged_at is null then
      update public.automation_incidents
         set status = 'acknowledged', acknowledged_by = v_actor_id,
             acknowledged_at = now(), updated_by = v_actor_id, updated_at = now()
       where id = p_incident_id returning * into v_incident;
      insert into public.automation_incident_events (incident_id, event_type, actor_id, actor_name, summary)
      values (p_incident_id, 'acknowledged', v_actor_id, v_actor_name, 'Incident acknowledged for operator review.');
    end if;
  elsif p_action = 'assign' then
    if v_incident.status = 'resolved' then raise exception 'Resolved incidents cannot be reassigned'; end if;
    if p_assignee_id is not null then
      v_assignee_name := public.automation_incident_actor_name(p_assignee_id);
    end if;
    update public.automation_incidents
       set assigned_to = p_assignee_id, updated_by = v_actor_id, updated_at = now()
     where id = p_incident_id returning * into v_incident;
    insert into public.automation_incident_events (incident_id, event_type, actor_id, actor_name, summary)
    values (
      p_incident_id,
      case when p_assignee_id is null then 'unassigned' else 'assigned' end,
      v_actor_id,
      v_actor_name,
      case when p_assignee_id is null then 'Incident assignment cleared.' else 'Incident assigned to ' || v_assignee_name || '.' end
    );
  elsif p_action = 'resolve' then
    if v_incident.status <> 'acknowledged' then raise exception 'Acknowledge the incident before resolution'; end if;
    if char_length(btrim(coalesce(p_resolution_note, ''))) < 2 then raise exception 'Resolution note is required'; end if;
    insert into public.automation_incident_notes (incident_id, author_id, body)
    values (p_incident_id, v_actor_id, btrim(p_resolution_note));
    update public.automation_incidents
       set status = 'resolved', resolved_by = v_actor_id, resolved_at = now(),
           updated_by = v_actor_id, updated_at = now()
     where id = p_incident_id returning * into v_incident;
    insert into public.automation_incident_events (incident_id, event_type, actor_id, actor_name, summary)
    values (p_incident_id, 'resolved', v_actor_id, v_actor_name, 'Incident resolved with an immutable resolution note.');
  else
    raise exception 'Invalid automation incident action';
  end if;
  return v_incident;
end;
$$;

create or replace function public.add_automation_incident_note(
  p_incident_id uuid,
  p_note text
)
returns public.automation_incident_notes
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_actor_id uuid := auth.uid();
  v_actor_name text;
  v_note public.automation_incident_notes;
begin
  v_actor_name := public.automation_incident_actor_name(v_actor_id);
  perform 1 from public.automation_incidents where id = p_incident_id;
  if not found then raise exception 'Automation incident not found'; end if;
  insert into public.automation_incident_notes (incident_id, author_id, body)
  values (p_incident_id, v_actor_id, btrim(p_note)) returning * into v_note;
  insert into public.automation_incident_events (incident_id, event_type, actor_id, actor_name, summary)
  values (p_incident_id, 'note_added', v_actor_id, v_actor_name, 'Sanitized operator note added.');
  return v_note;
end;
$$;

create or replace function public.prevent_automation_incident_history_mutation()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  raise exception 'Automation incident history is immutable';
end;
$$;

revoke all on function public.prevent_automation_incident_history_mutation() from public, anon, authenticated;

drop trigger if exists automation_incident_notes_immutable_trigger on public.automation_incident_notes;
create trigger automation_incident_notes_immutable_trigger
before update or delete on public.automation_incident_notes
for each row execute function public.prevent_automation_incident_history_mutation();

drop trigger if exists automation_incident_events_immutable_trigger on public.automation_incident_events;
create trigger automation_incident_events_immutable_trigger
before update or delete on public.automation_incident_events
for each row execute function public.prevent_automation_incident_history_mutation();

revoke all on function public.create_automation_incident(text,text,text,text) from public, anon, authenticated;
revoke all on function public.update_automation_incident(uuid,text,uuid,text) from public, anon, authenticated;
revoke all on function public.add_automation_incident_note(uuid,text) from public, anon, authenticated;
grant execute on function public.create_automation_incident(text,text,text,text) to authenticated;
grant execute on function public.update_automation_incident(uuid,text,uuid,text) to authenticated;
grant execute on function public.add_automation_incident_note(uuid,text) to authenticated;

commit;
