begin;
set local lock_timeout = '5s';
set local statement_timeout = '20s';

-- Production currently uses the reviewed legacy two-argument provisioning RPC.
-- Keep its inactive-draft behavior, but make every admin decision pass through
-- an append-only evidence wrapper. This does not publish a property, enable
-- inventory, create a booking, start payouts, or activate supplier traffic.
do $partner_review_prerequisites$
begin
  if to_regprocedure('public.review_partner_application(uuid,text)') is null then
    raise exception 'The legacy partner review function is required before installing evidence capture';
  end if;
  if to_regclass('public.partner_applications') is null
    or to_regclass('public.profiles') is null
  then
    raise exception 'Partner application and profile tables are required before installing evidence capture';
  end if;
end;
$partner_review_prerequisites$;

create table if not exists public.partner_application_review_evidence (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.partner_applications(id) on delete restrict,
  reviewer_id uuid not null references public.profiles(id) on delete restrict,
  decision text not null check (decision in ('pending', 'approved', 'declined')),
  legal_business_verified boolean not null default false,
  representative_authority_verified boolean not null default false,
  content_rights_verified boolean not null default false,
  commercial_terms_acknowledgement_verified boolean not null default false,
  inactive_draft_scope_confirmed boolean not null default false,
  evidence_summary text not null check (length(trim(evidence_summary)) between 3 and 2000),
  created_at timestamptz not null default now(),
  constraint partner_application_approval_evidence_check check (
    decision <> 'approved'
    or (
      legal_business_verified
      and representative_authority_verified
      and content_rights_verified
      and commercial_terms_acknowledgement_verified
      and inactive_draft_scope_confirmed
      and length(trim(evidence_summary)) >= 20
    )
  )
);

alter table public.partner_application_review_evidence
  add column if not exists inactive_draft_scope_confirmed boolean not null default false;

create index if not exists partner_application_review_evidence_application_idx
  on public.partner_application_review_evidence (application_id, created_at desc);

alter table public.partner_application_review_evidence enable row level security;
revoke all on public.partner_application_review_evidence
  from public, anon, authenticated, service_role;
grant select on public.partner_application_review_evidence to authenticated;

drop policy if exists "Admins view partner application review evidence"
  on public.partner_application_review_evidence;
create policy "Admins view partner application review evidence"
  on public.partner_application_review_evidence
  for select to authenticated
  using (exists (
    select 1
    from public.profiles
    where profiles.id = auth.uid()
      and profiles.role = 'admin'
  ));

create or replace function public.prevent_partner_application_review_evidence_mutation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  raise exception 'Partner application review evidence is append-only'
    using errcode = '55000';
end;
$$;

revoke all on function public.prevent_partner_application_review_evidence_mutation()
  from public, anon, authenticated, service_role;

drop trigger if exists partner_application_review_evidence_append_only
  on public.partner_application_review_evidence;
create trigger partner_application_review_evidence_append_only
before update or delete on public.partner_application_review_evidence
for each row execute function public.prevent_partner_application_review_evidence_mutation();

create or replace function public.review_partner_application(
  p_application_id uuid,
  p_status text,
  p_legal_business_verified boolean,
  p_representative_authority_verified boolean,
  p_content_rights_verified boolean,
  p_commercial_terms_acknowledgement_verified boolean,
  p_inactive_draft_scope_confirmed boolean,
  p_review_notes text
)
returns public.partner_applications
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_before public.partner_applications;
  v_application public.partner_applications;
begin
  if not exists (
    select 1 from public.profiles
    where profiles.id = auth.uid() and profiles.role = 'admin'
  ) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  if p_status not in ('pending', 'approved', 'declined') then
    raise exception 'Invalid review decision' using errcode = '22023';
  end if;
  if length(trim(coalesce(p_review_notes, ''))) not between 3 and 2000 then
    raise exception 'Record a review note between 3 and 2,000 characters'
      using errcode = '22023';
  end if;

  select application.*
  into v_before
  from public.partner_applications as application
  where application.id = p_application_id
  for update;

  if not found then
    raise exception 'Partner application not found' using errcode = 'P0002';
  end if;

  if p_status = 'approved' and (
    p_legal_business_verified is distinct from true
    or p_representative_authority_verified is distinct from true
    or p_content_rights_verified is distinct from true
    or p_commercial_terms_acknowledgement_verified is distinct from true
    or p_inactive_draft_scope_confirmed is distinct from true
    or length(trim(p_review_notes)) < 20
    or v_before.legal_business_name is null
    or v_before.representative_authority_confirmed is distinct from true
    or v_before.commercial_terms_acknowledged is distinct from true
    or v_before.commercial_terms_version_acknowledged is distinct from
      'hotel_partner_fee_disclosure_13_3_2026-08-22_v1'
    or v_before.commercial_terms_acknowledged_at is null
  ) then
    raise exception 'Record all internal review evidence before approval'
      using errcode = 'P0001';
  end if;

  select *
  into v_application
  from public.review_partner_application(p_application_id, p_status);

  insert into public.partner_application_review_evidence (
    application_id,
    reviewer_id,
    decision,
    legal_business_verified,
    representative_authority_verified,
    content_rights_verified,
    commercial_terms_acknowledgement_verified,
    inactive_draft_scope_confirmed,
    evidence_summary
  ) values (
    p_application_id,
    auth.uid(),
    p_status,
    coalesce(p_legal_business_verified, false),
    coalesce(p_representative_authority_verified, false),
    coalesce(p_content_rights_verified, false),
    coalesce(p_commercial_terms_acknowledgement_verified, false),
    coalesce(p_inactive_draft_scope_confirmed, false),
    trim(p_review_notes)
  );

  return v_application;
end;
$$;

revoke all on function public.review_partner_application(
  uuid, text, boolean, boolean, boolean, boolean, boolean, text
) from public, anon, service_role;
grant execute on function public.review_partner_application(
  uuid, text, boolean, boolean, boolean, boolean, boolean, text
) to authenticated;

-- The wrapper is now the only authenticated decision path. It retains the
-- legacy function internally so its established inactive-draft behavior stays
-- unchanged and atomic with evidence insertion.
revoke all on function public.review_partner_application(uuid, text)
  from public, anon, authenticated, service_role;

comment on table public.partner_application_review_evidence is
  'Append-only accountable admin evidence for hotel application decisions; it grants no publication, booking, payment, payout, or supplier authority.';
comment on function public.review_partner_application(
  uuid, text, boolean, boolean, boolean, boolean, boolean, text
) is 'Records accountable hotel review evidence, then invokes the existing inactive-draft provisioning transaction.';

commit;
