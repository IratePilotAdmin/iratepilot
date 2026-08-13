begin;

create table if not exists public.synxis_crs_evidence_audit (
  id uuid primary key default uuid_generate_v4(),
  provider_id text not null check (provider_id = 'sabre-synxis'),
  event_type text not null check (event_type in ('evidence_created', 'evidence_updated')),
  changed_fields text[] not null default '{}',
  evidence_snapshot jsonb not null,
  actor_id uuid,
  actor_name text not null check (char_length(actor_name) between 1 and 200),
  created_at timestamptz not null default now()
);

create index if not exists synxis_crs_evidence_audit_created_at_idx
  on public.synxis_crs_evidence_audit (created_at desc);

comment on table public.synxis_crs_evidence_audit is
  'Immutable, non-secret audit snapshots for Sabre SynXis certification and activation evidence.';

alter table public.synxis_crs_evidence_audit enable row level security;
revoke all on table public.synxis_crs_evidence_audit from public, anon, authenticated;

create or replace function public.record_synxis_crs_evidence_audit()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_changed_fields text[];
  v_actor_name text;
begin
  if tg_op = 'INSERT' then
    v_changed_fields := array[
      'vendor_approved', 'certification_environment_approved', 'property_mapped',
      'sandbox_validated', 'production_smoke_validated', 'live_enabled',
      'vendor_approval_reference', 'approved_environment', 'property_code',
      'support_contact', 'verification_notes'
    ];
  else
    select coalesce(array_agg(field_name order by field_name), '{}'::text[])
      into v_changed_fields
      from unnest(array[
        'vendor_approved', 'certification_environment_approved', 'property_mapped',
        'sandbox_validated', 'production_smoke_validated', 'live_enabled',
        'vendor_approval_reference', 'approved_environment', 'property_code',
        'support_contact', 'verification_notes'
      ]) as field_name
     where (to_jsonb(new) -> field_name) is distinct from (to_jsonb(old) -> field_name);
  end if;

  if tg_op = 'INSERT' or cardinality(v_changed_fields) > 0 then
    select nullif(btrim(full_name), '')
      into v_actor_name
      from public.profiles
     where id = new.updated_by;

    insert into public.synxis_crs_evidence_audit (
      provider_id, event_type, changed_fields, evidence_snapshot, actor_id, actor_name
    ) values (
      new.provider_id,
      case when tg_op = 'INSERT' then 'evidence_created' else 'evidence_updated' end,
      v_changed_fields,
      to_jsonb(new) - 'updated_by' - 'updated_at',
      new.updated_by,
      coalesce(v_actor_name, 'Administrator')
    );
  end if;

  return new;
end;
$$;

revoke all on function public.record_synxis_crs_evidence_audit() from public, anon, authenticated;

drop trigger if exists synxis_crs_evidence_audit_trigger
  on public.synxis_crs_launch_evidence;
create trigger synxis_crs_evidence_audit_trigger
after insert or update on public.synxis_crs_launch_evidence
for each row execute function public.record_synxis_crs_evidence_audit();

create or replace function public.prevent_synxis_crs_evidence_audit_mutation()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  raise exception 'SynXis CRS evidence audit events are immutable';
end;
$$;

revoke all on function public.prevent_synxis_crs_evidence_audit_mutation() from public, anon, authenticated;

drop trigger if exists synxis_crs_evidence_audit_immutable_trigger
  on public.synxis_crs_evidence_audit;
create trigger synxis_crs_evidence_audit_immutable_trigger
before update or delete on public.synxis_crs_evidence_audit
for each row execute function public.prevent_synxis_crs_evidence_audit_mutation();

commit;
