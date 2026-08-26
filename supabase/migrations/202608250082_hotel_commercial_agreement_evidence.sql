begin;

-- This migration is a separate post-lineage gate. It must run only after the
-- pinned hotel 070 package is accepted. A fee disclosure acknowledgement is
-- not a contract, so no hotel can pass commercial review or publication until
-- an exact counsel-approved agreement version and an executed receipt exist.
-- No agreement version is seeded here; the default state is deliberately HOLD.
do $$
begin
  if pg_catalog.to_regclass('public.partner_application_review_evidence') is null
    or pg_catalog.to_regclass('public.property_commercial_review_evidence') is null
    or pg_catalog.to_regprocedure(
      'public.record_property_commercial_review(uuid,text,text,boolean,boolean,boolean,boolean,text)'
    ) is null
    or pg_catalog.to_regprocedure(
      'public.set_property_publication_state(uuid,boolean)'
    ) is null
    or pg_catalog.to_regclass('public.direct_hotel_runtime_controls') is null
    or pg_catalog.to_regprocedure(
      'public.reserve_ai_hotel_planner_quota(uuid)'
    ) is null
    or pg_catalog.to_regclass('public.hotel_legacy_transaction_controls') is null
    or pg_catalog.to_regprocedure(
      'public.get_email_runtime_safety_version()'
    ) is null
  then
    raise exception 'Migrations 202608220070 through 202608220074 must be accepted before hotel commercial agreement evidence';
  end if;
end;
$$;

create table public.hotel_commercial_agreement_versions (
  agreement_version text primary key,
  template_document_sha256 text not null unique,
  counsel_approval_reference text not null unique,
  counsel_approved_at timestamptz not null,
  effective_at timestamptz not null,
  recorded_by uuid not null references public.profiles(id) on delete restrict,
  evidence_summary text not null,
  created_at timestamptz not null default now(),
  constraint hotel_commercial_agreement_version_token_check check (
    agreement_version ~ '^[a-z0-9][a-z0-9._-]{7,119}$'
  ),
  constraint hotel_commercial_agreement_template_digest_check check (
    template_document_sha256 ~ '^[a-f0-9]{64}$'
  ),
  constraint hotel_commercial_agreement_counsel_reference_check check (
    length(trim(counsel_approval_reference)) between 8 and 160
    and counsel_approval_reference !~ '[[:cntrl:]]'
  ),
  constraint hotel_commercial_agreement_version_dates_check check (
    effective_at >= counsel_approved_at
  ),
  constraint hotel_commercial_agreement_version_summary_check check (
    length(trim(evidence_summary)) between 20 and 2000
  )
);

create table public.hotel_commercial_agreement_version_retirements (
  agreement_version text primary key
    references public.hotel_commercial_agreement_versions(agreement_version)
    on delete restrict,
  retired_at timestamptz not null,
  retirement_reference text not null unique,
  recorded_by uuid not null references public.profiles(id) on delete restrict,
  reason_summary text not null,
  created_at timestamptz not null default now(),
  constraint hotel_commercial_agreement_retirement_reference_check check (
    length(trim(retirement_reference)) between 8 and 160
    and retirement_reference !~ '[[:cntrl:]]'
  ),
  constraint hotel_commercial_agreement_retirement_summary_check check (
    length(trim(reason_summary)) between 20 and 2000
  )
);

create table public.hotel_commercial_agreement_evidence (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  application_id uuid not null
    references public.partner_applications(id) on delete restrict,
  partner_id uuid not null references public.partners(id) on delete restrict,
  property_id uuid not null references public.properties(id) on delete restrict,
  agreement_version text not null
    references public.hotel_commercial_agreement_versions(agreement_version)
    on delete restrict,
  fee_disclosure_version text not null,
  execution_reference text not null unique,
  agreement_document_sha256 text not null unique,
  hotel_legal_business_name text not null,
  hotel_signatory_name text not null,
  hotel_signatory_title text not null,
  hotel_signed_at timestamptz not null,
  iratepilot_signed_at timestamptz not null,
  effective_at timestamptz not null,
  expires_at timestamptz,
  representative_authority_verified boolean not null,
  executed_agreement_verified boolean not null,
  recorded_by uuid not null references public.profiles(id) on delete restrict,
  evidence_summary text not null,
  created_at timestamptz not null default now(),
  constraint hotel_commercial_agreement_property_version_key
    unique (property_id, agreement_version),
  constraint hotel_commercial_agreement_application_version_key
    unique (application_id, agreement_version),
  constraint hotel_commercial_agreement_fee_version_check check (
    fee_disclosure_version = 'hotel_partner_fee_disclosure_13_3_2026-08-22_v1'
  ),
  constraint hotel_commercial_agreement_execution_reference_check check (
    length(trim(execution_reference)) between 8 and 160
    and execution_reference ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,159}$'
    and pg_catalog.strpos(execution_reference, '://') = 0
    and execution_reference !~ '[[:cntrl:]]'
  ),
  constraint hotel_commercial_agreement_document_digest_check check (
    agreement_document_sha256 ~ '^[a-f0-9]{64}$'
  ),
  constraint hotel_commercial_agreement_identity_lengths_check check (
    length(trim(hotel_legal_business_name)) between 2 and 200
    and length(trim(hotel_signatory_name)) between 2 and 120
    and length(trim(hotel_signatory_title)) between 2 and 120
    and hotel_signatory_name !~ '[[:cntrl:]]'
    and hotel_signatory_title !~ '[[:cntrl:]]'
  ),
  constraint hotel_commercial_agreement_execution_checks check (
    representative_authority_verified
    and executed_agreement_verified
    and effective_at >= greatest(hotel_signed_at, iratepilot_signed_at)
    and (expires_at is null or expires_at > effective_at)
  ),
  constraint hotel_commercial_agreement_evidence_summary_check check (
    length(trim(evidence_summary)) between 20 and 2000
  )
);

create index hotel_commercial_agreement_evidence_property_idx
  on public.hotel_commercial_agreement_evidence (
    property_id,
    effective_at desc,
    created_at desc
  );

create table public.hotel_commercial_agreement_terminations (
  agreement_evidence_id uuid primary key
    references public.hotel_commercial_agreement_evidence(id)
    on delete restrict,
  property_id uuid not null references public.properties(id) on delete restrict,
  terminated_at timestamptz not null,
  termination_reference text not null unique,
  recorded_by uuid not null references public.profiles(id) on delete restrict,
  reason_summary text not null,
  created_at timestamptz not null default now(),
  constraint hotel_commercial_agreement_termination_reference_check check (
    length(trim(termination_reference)) between 8 and 160
    and termination_reference !~ '[[:cntrl:]]'
  ),
  constraint hotel_commercial_agreement_termination_summary_check check (
    length(trim(reason_summary)) between 20 and 2000
  )
);

alter table public.hotel_commercial_agreement_versions enable row level security;
alter table public.hotel_commercial_agreement_version_retirements enable row level security;
alter table public.hotel_commercial_agreement_evidence enable row level security;
alter table public.hotel_commercial_agreement_terminations enable row level security;

revoke all on public.hotel_commercial_agreement_versions
  from public, anon, authenticated, service_role;
revoke all on public.hotel_commercial_agreement_version_retirements
  from public, anon, authenticated, service_role;
revoke all on public.hotel_commercial_agreement_evidence
  from public, anon, authenticated, service_role;
revoke all on public.hotel_commercial_agreement_terminations
  from public, anon, authenticated, service_role;
grant select on public.hotel_commercial_agreement_versions to authenticated;
grant select on public.hotel_commercial_agreement_version_retirements to authenticated;
grant select on public.hotel_commercial_agreement_evidence to authenticated;
grant select on public.hotel_commercial_agreement_terminations to authenticated;

create policy "Admins view hotel commercial agreement versions"
  on public.hotel_commercial_agreement_versions
  for select to authenticated
  using (exists (
    select 1 from public.profiles
    where profiles.id = auth.uid() and profiles.role = 'admin'
  ));
create policy "Admins view hotel commercial agreement version retirements"
  on public.hotel_commercial_agreement_version_retirements
  for select to authenticated
  using (exists (
    select 1 from public.profiles
    where profiles.id = auth.uid() and profiles.role = 'admin'
  ));
create policy "Admins view hotel commercial agreement evidence"
  on public.hotel_commercial_agreement_evidence
  for select to authenticated
  using (exists (
    select 1 from public.profiles
    where profiles.id = auth.uid() and profiles.role = 'admin'
  ));
create policy "Admins view hotel commercial agreement terminations"
  on public.hotel_commercial_agreement_terminations
  for select to authenticated
  using (exists (
    select 1 from public.profiles
    where profiles.id = auth.uid() and profiles.role = 'admin'
  ));

-- Migration 070 creates the partner/property graph before it inserts the
-- approved review evidence. This trigger therefore validates the completed
-- graph inside the same transaction and rolls the whole approval back unless
-- the linked owner is the one uniquely matching, confirmed applicant account.
create function public.enforce_confirmed_hotel_applicant_approval_graph()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_application_email text;
  v_partner_owner_id uuid;
  v_matching_account_count bigint;
  v_confirmed_linked_owner_count bigint;
begin
  if new.decision <> 'approved' then
    return new;
  end if;

  select application.email, partner_record.owner_id
  into v_application_email, v_partner_owner_id
  from public.partner_applications as application
  join public.properties as property_record
    on property_record.id = application.property_id
  join public.partners as partner_record
    on partner_record.id = property_record.partner_id
  where application.id = new.application_id;

  if v_application_email is null or v_partner_owner_id is null then
    raise exception 'A uniquely matched confirmed applicant account is required before approval'
      using errcode = 'P0001';
  end if;

  select count(*),
    count(*) filter (
      where account.id = v_partner_owner_id
        and account.email_confirmed_at is not null
    )
  into v_matching_account_count, v_confirmed_linked_owner_count
  from auth.users as account
  where lower(account.email) = lower(v_application_email);

  if v_matching_account_count <> 1
    or v_confirmed_linked_owner_count <> 1
  then
    raise exception 'A uniquely matched confirmed applicant account is required before approval'
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;

revoke all on function public.enforce_confirmed_hotel_applicant_approval_graph()
  from public, anon, authenticated, service_role;
create trigger enforce_confirmed_hotel_applicant_approval_graph
before insert on public.partner_application_review_evidence
for each row execute function public.enforce_confirmed_hotel_applicant_approval_graph();

create function public.prevent_hotel_commercial_agreement_evidence_mutation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  raise exception 'Hotel commercial agreement evidence is append-only'
    using errcode = '55000';
end;
$$;

revoke all on function public.prevent_hotel_commercial_agreement_evidence_mutation()
  from public, anon, authenticated, service_role;

create trigger hotel_commercial_agreement_versions_append_only
before update or delete on public.hotel_commercial_agreement_versions
for each row execute function public.prevent_hotel_commercial_agreement_evidence_mutation();
create trigger hotel_commercial_agreement_version_retirements_append_only
before update or delete on public.hotel_commercial_agreement_version_retirements
for each row execute function public.prevent_hotel_commercial_agreement_evidence_mutation();
create trigger hotel_commercial_agreement_evidence_append_only
before update or delete on public.hotel_commercial_agreement_evidence
for each row execute function public.prevent_hotel_commercial_agreement_evidence_mutation();
create trigger hotel_commercial_agreement_terminations_append_only
before update or delete on public.hotel_commercial_agreement_terminations
for each row execute function public.prevent_hotel_commercial_agreement_evidence_mutation();

-- Returns an ID only when exactly one currently effective, non-retired,
-- non-terminated executed agreement is bound to the approved property graph.
create function public.current_hotel_commercial_agreement_evidence_id(
  p_property_id uuid
)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  with candidates as (
    select agreement.id, agreement.effective_at, agreement.created_at
    from public.hotel_commercial_agreement_evidence as agreement
    join public.hotel_commercial_agreement_versions as agreement_version
      on agreement_version.agreement_version = agreement.agreement_version
    join public.partner_applications as application
      on application.id = agreement.application_id
    join public.properties as property_record
      on property_record.id = agreement.property_id
    join public.partners as partner_record
      on partner_record.id = agreement.partner_id
    join auth.users as owner_account
      on owner_account.id = partner_record.owner_id
    where agreement.property_id = p_property_id
      and agreement.partner_id = property_record.partner_id
      and application.property_id = agreement.property_id
      and application.status = 'approved'
      and application.commercial_terms_acknowledged
      and application.commercial_terms_acknowledged_at is not null
      and application.commercial_terms_version_acknowledged =
        'hotel_partner_fee_disclosure_13_3_2026-08-22_v1'
      and partner_record.status = 'approved'
      and owner_account.email_confirmed_at is not null
      and lower(owner_account.email) = lower(application.email)
      and (
        select count(*)
        from auth.users as matching_account
        where lower(matching_account.email) = lower(application.email)
      ) = 1
      and agreement.hotel_legal_business_name =
        trim(application.legal_business_name)
      and agreement.fee_disclosure_version =
        'hotel_partner_fee_disclosure_13_3_2026-08-22_v1'
      and agreement.representative_authority_verified
      and agreement.executed_agreement_verified
      and agreement_version.effective_at <= now()
      and agreement.hotel_signed_at >= agreement_version.counsel_approved_at
      and agreement.iratepilot_signed_at >= agreement_version.counsel_approved_at
      and agreement.effective_at >= agreement_version.effective_at
      and agreement.effective_at <= now()
      and (agreement.expires_at is null or agreement.expires_at > now())
      and exists (
        select 1
        from public.partner_application_review_evidence as application_review
        where application_review.application_id = application.id
          and application_review.decision = 'approved'
          and application_review.legal_business_verified
          and application_review.representative_authority_verified
          and application_review.content_rights_verified
          and application_review.commercial_terms_acknowledgement_verified
      )
      and not exists (
        select 1
        from public.hotel_commercial_agreement_version_retirements as retirement
        where retirement.agreement_version = agreement.agreement_version
          and retirement.retired_at <= now()
      )
      and not exists (
        select 1
        from public.hotel_commercial_agreement_terminations as termination
        where termination.agreement_evidence_id = agreement.id
          and termination.terminated_at <= now()
      )
  )
  select case
    when count(*) = 1
      then (array_agg(candidates.id order by candidates.effective_at desc, candidates.created_at desc, candidates.id))[1]
    else null
  end
  from candidates;
$$;

create function public.is_hotel_commercial_agreement_effective(
  p_property_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.current_hotel_commercial_agreement_evidence_id(p_property_id)
    is not null;
$$;

revoke all on function public.current_hotel_commercial_agreement_evidence_id(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.is_hotel_commercial_agreement_effective(uuid)
  from public, anon, authenticated, service_role;

-- Authenticated callers never receive access to the low-level effectiveness
-- helpers. Admin APIs use these bounded wrappers so authorization remains in
-- the database and legal-state evaluation is not duplicated in application
-- code.
create function public.get_hotel_commercial_agreement_admin_state(
  p_property_ids uuid[]
)
returns table (
  property_id uuid,
  current_evidence_id uuid,
  commercial_agreement_effective boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.profiles
    where profiles.id = auth.uid() and profiles.role = 'admin'
  ) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  if p_property_ids is null
    or pg_catalog.cardinality(p_property_ids) > 500
    or pg_catalog.array_position(p_property_ids, null) is not null
  then
    raise exception 'Property identifiers are incomplete or invalid'
      using errcode = '22023';
  end if;

  return query
  select requested.property_id,
    current_agreement.id,
    current_agreement.id is not null
  from (
    select distinct requested_id.property_id
    from pg_catalog.unnest(p_property_ids) as requested_id(property_id)
  ) as requested
  join public.properties as property_record
    on property_record.id = requested.property_id
  left join lateral (
    select public.current_hotel_commercial_agreement_evidence_id(
      property_record.id
    ) as id
  ) as current_agreement on true;
end;
$$;

revoke all on function public.get_hotel_commercial_agreement_admin_state(uuid[])
  from public, anon, service_role;
grant execute on function public.get_hotel_commercial_agreement_admin_state(uuid[])
  to authenticated;

create function public.list_available_counsel_approved_hotel_commercial_agreement_versions()
returns table (
  agreement_version text,
  effective_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.profiles
    where profiles.id = auth.uid() and profiles.role = 'admin'
  ) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  return query
  select version_record.agreement_version,
    version_record.effective_at
  from public.hotel_commercial_agreement_versions as version_record
  where version_record.effective_at <= now()
    and not exists (
      select 1
      from public.hotel_commercial_agreement_version_retirements as retirement
      where retirement.agreement_version = version_record.agreement_version
        and retirement.retired_at <= now()
    )
  order by version_record.effective_at desc,
    version_record.agreement_version;
end;
$$;

revoke all on function public.list_available_counsel_approved_hotel_commercial_agreement_versions()
  from public, anon, service_role;
grant execute on function public.list_available_counsel_approved_hotel_commercial_agreement_versions()
  to authenticated;

create function public.record_counsel_approved_hotel_commercial_agreement_version(
  p_agreement_version text,
  p_template_document_sha256 text,
  p_counsel_approval_reference text,
  p_counsel_approved_at timestamptz,
  p_effective_at timestamptz,
  p_review_notes text
)
returns public.hotel_commercial_agreement_versions
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_version public.hotel_commercial_agreement_versions;
  v_now timestamptz := pg_catalog.clock_timestamp();
begin
  if not exists (
    select 1 from public.profiles
    where profiles.id = auth.uid() and profiles.role = 'admin'
  ) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'hotel-commercial-agreement-version:' || coalesce(p_agreement_version, ''),
      0
    )
  );

  if p_agreement_version is null
    or p_agreement_version !~ '^[a-z0-9][a-z0-9._-]{7,119}$'
    or p_template_document_sha256 is null
    or p_template_document_sha256 !~ '^[a-f0-9]{64}$'
    or length(trim(coalesce(p_counsel_approval_reference, ''))) not between 8 and 160
    or p_counsel_approval_reference ~ '[[:cntrl:]]'
    or p_counsel_approved_at is null
    or p_counsel_approved_at > v_now
    or p_effective_at is null
    or p_effective_at < p_counsel_approved_at
    or length(trim(coalesce(p_review_notes, ''))) not between 20 and 2000
  then
    raise exception 'Counsel-approved hotel commercial agreement version evidence is incomplete or invalid'
      using errcode = '22023';
  end if;

  insert into public.hotel_commercial_agreement_versions (
    agreement_version,
    template_document_sha256,
    counsel_approval_reference,
    counsel_approved_at,
    effective_at,
    recorded_by,
    evidence_summary
  ) values (
    p_agreement_version,
    p_template_document_sha256,
    trim(p_counsel_approval_reference),
    p_counsel_approved_at,
    p_effective_at,
    auth.uid(),
    trim(p_review_notes)
  ) returning * into v_version;

  return v_version;
exception
  when unique_violation then
    raise exception 'This counsel-approved hotel commercial agreement version is already recorded'
      using errcode = 'P0001';
end;
$$;

revoke all on function public.record_counsel_approved_hotel_commercial_agreement_version(
  text, text, text, timestamptz, timestamptz, text
) from public, anon, service_role;
grant execute on function public.record_counsel_approved_hotel_commercial_agreement_version(
  text, text, text, timestamptz, timestamptz, text
) to authenticated;

create function public.record_hotel_commercial_agreement_receipt(
  p_property_id uuid,
  p_application_id uuid,
  p_agreement_version text,
  p_fee_disclosure_version text,
  p_execution_reference text,
  p_agreement_document_sha256 text,
  p_hotel_signatory_name text,
  p_hotel_signatory_title text,
  p_hotel_signed_at timestamptz,
  p_iratepilot_signed_at timestamptz,
  p_effective_at timestamptz,
  p_expires_at timestamptz,
  p_representative_authority_verified boolean,
  p_executed_agreement_verified boolean,
  p_review_notes text
)
returns public.hotel_commercial_agreement_evidence
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_application public.partner_applications;
  v_property public.properties;
  v_partner_status text;
  v_version public.hotel_commercial_agreement_versions;
  v_evidence public.hotel_commercial_agreement_evidence;
  v_now timestamptz := pg_catalog.clock_timestamp();
begin
  if not exists (
    select 1 from public.profiles
    where profiles.id = auth.uid() and profiles.role = 'admin'
  ) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  -- Version-before-property is the shared lifecycle lock order. It prevents a
  -- version retirement from racing a new receipt while the property lock also
  -- serializes receipt, termination, and publication decisions.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'hotel-commercial-agreement-version:' || coalesce(p_agreement_version, ''),
      0
    )
  );
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'hotel-commercial-agreement:' || coalesce(p_property_id::text, ''),
      0
    )
  );

  select application.*
  into v_application
  from public.partner_applications as application
  where application.id = p_application_id
  for update;

  select property_record.*
  into v_property
  from public.properties as property_record
  where property_record.id = p_property_id
  for update;

  if v_application.id is null
    or v_property.id is null
    or v_application.status <> 'approved'
    or v_application.property_id is distinct from p_property_id
  then
    raise exception 'The approved hotel application is not linked to this property'
      using errcode = 'P0001';
  end if;

  select partner.status
  into v_partner_status
  from public.partners as partner
  where partner.id = v_property.partner_id
  for update;

  if v_partner_status is distinct from 'approved'
    or not exists (
      select 1
      from public.partners as partner_record
      join auth.users as owner_account
        on owner_account.id = partner_record.owner_id
      where partner_record.id = v_property.partner_id
        and owner_account.email_confirmed_at is not null
        and lower(owner_account.email) = lower(v_application.email)
        and (
          select count(*)
          from auth.users as matching_account
          where lower(matching_account.email) = lower(v_application.email)
        ) = 1
    )
  then
    raise exception 'The approved hotel application is not linked to this property'
      using errcode = 'P0001';
  end if;
  if v_property.active then
    raise exception 'The property must remain inactive while agreement evidence is recorded'
      using errcode = 'P0001';
  end if;
  if not exists (
    select 1
    from public.partner_application_review_evidence as review
    where review.application_id = p_application_id
      and review.decision = 'approved'
      and review.legal_business_verified
      and review.representative_authority_verified
      and review.content_rights_verified
      and review.commercial_terms_acknowledgement_verified
  ) then
    raise exception 'The approved hotel application is not linked to this property'
      using errcode = 'P0001';
  end if;

  select agreement_version.*
  into v_version
  from public.hotel_commercial_agreement_versions as agreement_version
  where agreement_version.agreement_version = p_agreement_version
    and agreement_version.effective_at <= v_now
    and not exists (
      select 1
      from public.hotel_commercial_agreement_version_retirements as retirement
      where retirement.agreement_version = agreement_version.agreement_version
        and retirement.retired_at <= v_now
    )
  for update;

  if v_version.agreement_version is null then
    raise exception 'No counsel-approved hotel commercial agreement version is available'
      using errcode = 'P0001';
  end if;
  if public.current_hotel_commercial_agreement_evidence_id(p_property_id) is not null
    or exists (
      select 1
      from public.hotel_commercial_agreement_evidence as existing
      where existing.property_id = p_property_id
        and existing.agreement_version = p_agreement_version
    )
  then
    raise exception 'A hotel commercial agreement receipt already exists for this property and version'
      using errcode = 'P0001';
  end if;

  if p_fee_disclosure_version is distinct from
      'hotel_partner_fee_disclosure_13_3_2026-08-22_v1'
    or v_application.commercial_terms_version_acknowledged is distinct from
      p_fee_disclosure_version
    or not v_application.commercial_terms_acknowledged
    or v_application.commercial_terms_acknowledged_at is null
    or length(trim(coalesce(p_execution_reference, ''))) not between 8 and 160
    or p_execution_reference !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,159}$'
    or pg_catalog.strpos(coalesce(p_execution_reference, ''), '://') > 0
    or p_execution_reference ~ '[[:cntrl:]]'
    or p_agreement_document_sha256 is null
    or p_agreement_document_sha256 !~ '^[a-f0-9]{64}$'
    or length(trim(coalesce(p_hotel_signatory_name, ''))) not between 2 and 120
    or p_hotel_signatory_name ~ '[[:cntrl:]]'
    or length(trim(coalesce(p_hotel_signatory_title, ''))) not between 2 and 120
    or p_hotel_signatory_title ~ '[[:cntrl:]]'
    or p_hotel_signed_at is null
    or p_hotel_signed_at > v_now
    or p_iratepilot_signed_at is null
    or p_iratepilot_signed_at > v_now
    or p_hotel_signed_at < v_version.counsel_approved_at
    or p_iratepilot_signed_at < v_version.counsel_approved_at
    or p_effective_at is null
    or p_effective_at > v_now
    or p_effective_at < v_version.effective_at
    or p_effective_at < greatest(p_hotel_signed_at, p_iratepilot_signed_at)
    or (p_expires_at is not null and (
      p_expires_at <= p_effective_at or p_expires_at <= v_now
    ))
    or p_representative_authority_verified is distinct from true
    or p_executed_agreement_verified is distinct from true
    or length(trim(coalesce(p_review_notes, ''))) not between 20 and 2000
  then
    raise exception 'Hotel commercial agreement evidence is incomplete or invalid'
      using errcode = '22023';
  end if;

  insert into public.hotel_commercial_agreement_evidence (
    application_id,
    partner_id,
    property_id,
    agreement_version,
    fee_disclosure_version,
    execution_reference,
    agreement_document_sha256,
    hotel_legal_business_name,
    hotel_signatory_name,
    hotel_signatory_title,
    hotel_signed_at,
    iratepilot_signed_at,
    effective_at,
    expires_at,
    representative_authority_verified,
    executed_agreement_verified,
    recorded_by,
    evidence_summary
  ) values (
    p_application_id,
    v_property.partner_id,
    p_property_id,
    p_agreement_version,
    p_fee_disclosure_version,
    trim(p_execution_reference),
    p_agreement_document_sha256,
    trim(v_application.legal_business_name),
    trim(p_hotel_signatory_name),
    trim(p_hotel_signatory_title),
    p_hotel_signed_at,
    p_iratepilot_signed_at,
    p_effective_at,
    p_expires_at,
    p_representative_authority_verified,
    p_executed_agreement_verified,
    auth.uid(),
    trim(p_review_notes)
  ) returning * into v_evidence;

  return v_evidence;
exception
  when unique_violation then
    raise exception 'A hotel commercial agreement receipt already exists for this property and version'
      using errcode = 'P0001';
end;
$$;

revoke all on function public.record_hotel_commercial_agreement_receipt(
  uuid, uuid, text, text, text, text, text, text,
  timestamptz, timestamptz, timestamptz, timestamptz,
  boolean, boolean, text
) from public, anon, service_role;
grant execute on function public.record_hotel_commercial_agreement_receipt(
  uuid, uuid, text, text, text, text, text, text,
  timestamptz, timestamptz, timestamptz, timestamptz,
  boolean, boolean, text
) to authenticated;

alter table public.property_commercial_review_evidence
  add column commercial_agreement_evidence_id uuid
    references public.hotel_commercial_agreement_evidence(id)
    on delete restrict,
  add constraint property_commercial_review_agreement_required
    check (commercial_agreement_evidence_id is not null) not valid;

create function public.bind_property_commercial_review_agreement()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_current_agreement_id uuid;
begin
  v_current_agreement_id :=
    public.current_hotel_commercial_agreement_evidence_id(new.property_id);
  if v_current_agreement_id is null then
    raise exception 'An effective executed hotel commercial agreement is required before commercial review'
      using errcode = 'P0001';
  end if;
  if new.commercial_agreement_evidence_id is not null
    and new.commercial_agreement_evidence_id is distinct from v_current_agreement_id
  then
    raise exception 'Commercial review must use the current executed hotel agreement'
      using errcode = 'P0001';
  end if;
  new.commercial_agreement_evidence_id := v_current_agreement_id;
  return new;
end;
$$;

revoke all on function public.bind_property_commercial_review_agreement()
  from public, anon, authenticated, service_role;
create trigger bind_property_commercial_review_agreement
before insert on public.property_commercial_review_evidence
for each row execute function public.bind_property_commercial_review_agreement();

create function public.enforce_hotel_commercial_agreement_property_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_current_agreement_id uuid;
  v_requires_current_review boolean;
begin
  v_requires_current_review := (
    new.active and old.active is distinct from true
  ) or (
    (
      new.listing_scope is distinct from old.listing_scope
      or new.direct_request_mode is distinct from old.direct_request_mode
      or new.commercial_terms_version is distinct from old.commercial_terms_version
      or new.commercial_verified_at is distinct from old.commercial_verified_at
      or new.commercial_verified_by is distinct from old.commercial_verified_by
      or new.support_contact_email is distinct from old.support_contact_email
    )
    and (
      new.listing_scope = 'commercial'
      or new.direct_request_mode = 'request_only'
      or new.commercial_terms_version is not null
      or new.commercial_verified_at is not null
      or new.commercial_verified_by is not null
      or new.support_contact_email is not null
    )
  );

  if not v_requires_current_review then
    return new;
  end if;

  v_current_agreement_id :=
    public.current_hotel_commercial_agreement_evidence_id(new.id);
  if v_current_agreement_id is null
    or not exists (
      select 1
      from public.property_commercial_review_evidence as review
      where review.property_id = new.id
        and review.commercial_agreement_evidence_id = v_current_agreement_id
        and review.id = (
          select latest_review.id
          from public.property_commercial_review_evidence as latest_review
          where latest_review.property_id = new.id
            and latest_review.commercial_agreement_evidence_id =
              v_current_agreement_id
          order by latest_review.created_at desc, latest_review.id desc
          limit 1
        )
        and review.commercial_terms_version = new.commercial_terms_version
        and lower(trim(review.support_contact_email)) =
          lower(trim(new.support_contact_email))
        and review.reviewer_id = new.commercial_verified_by
        and review.created_at = new.commercial_verified_at
        and review.legal_business_verified
        and review.sole_owner_conflict_acknowledged
        and review.commercial_terms_evidence_verified
        and review.support_contact_verified
    )
  then
    raise exception 'An effective executed hotel commercial agreement and matching commercial review are required'
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;

revoke all on function public.enforce_hotel_commercial_agreement_property_guard()
  from public, anon, authenticated, service_role;
create trigger enforce_hotel_commercial_agreement_property_guard
before update of active, listing_scope, direct_request_mode,
  commercial_terms_version, commercial_verified_at, commercial_verified_by,
  support_contact_email
on public.properties
for each row execute function public.enforce_hotel_commercial_agreement_property_guard();

-- Public visibility is dynamic. Expiration, agreement termination, or version
-- retirement hides the property even if a stale active=true value remains.
create or replace function public.is_approved_marketplace_property(
  p_property_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.properties
    join public.partners on partners.id = properties.partner_id
    where properties.id = p_property_id
      and properties.active = true
      and properties.listing_scope = 'commercial'
      and properties.direct_request_mode = 'request_only'
      and properties.commercial_verified_at is not null
      and properties.commercial_verified_by is not null
      and properties.commercial_terms_version =
        'hotel_partner_fee_disclosure_13_3_2026-08-22_v1'
      and nullif(trim(properties.support_contact_email), '') is not null
      and partners.status = 'approved'
      and public.is_hotel_commercial_agreement_effective(properties.id)
      and exists (
        select 1
        from public.property_commercial_review_evidence as review
        where review.property_id = properties.id
          and review.commercial_agreement_evidence_id =
            public.current_hotel_commercial_agreement_evidence_id(properties.id)
          and review.id = (
            select latest_review.id
            from public.property_commercial_review_evidence as latest_review
            where latest_review.property_id = properties.id
              and latest_review.commercial_agreement_evidence_id =
                public.current_hotel_commercial_agreement_evidence_id(
                  properties.id
                )
            order by latest_review.created_at desc, latest_review.id desc
            limit 1
          )
          and review.commercial_terms_version = properties.commercial_terms_version
          and lower(trim(review.support_contact_email)) =
            lower(trim(properties.support_contact_email))
          and review.reviewer_id = properties.commercial_verified_by
          and review.created_at = properties.commercial_verified_at
          and review.legal_business_verified
          and review.sole_owner_conflict_acknowledged
          and review.commercial_terms_evidence_verified
          and review.support_contact_verified
      )
  );
$$;

-- Preserve the exact, already-reviewed graph-locking implementation as an
-- uncallable inner function. The public RPC name becomes the agreement-aware
-- wrapper, so no application caller can bypass the new legal/commercial gate.
alter function public.set_property_publication_state(uuid, boolean)
  rename to set_property_publication_state_graph_guarded;
alter function public.set_property_publication_state_graph_guarded(uuid, boolean)
  set search_path = '';
revoke all on function public.set_property_publication_state_graph_guarded(uuid, boolean)
  from public, anon, authenticated, service_role;

create function public.set_property_publication_state(
  p_property_id uuid,
  p_active boolean
)
returns public.properties
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_current_agreement_id uuid;
begin
  if not exists (
    select 1 from public.profiles
    where profiles.id = auth.uid() and profiles.role = 'admin'
  ) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  if p_active is null then
    raise exception 'A publication state is required' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'hotel-commercial-agreement:' || coalesce(p_property_id::text, ''),
      0
    )
  );

  if p_active then
    v_current_agreement_id :=
      public.current_hotel_commercial_agreement_evidence_id(p_property_id);
    if v_current_agreement_id is null
      or not exists (
        select 1
        from public.property_commercial_review_evidence as review
        join public.properties as property_record
          on property_record.id = review.property_id
        where property_record.id = p_property_id
          and review.commercial_agreement_evidence_id = v_current_agreement_id
          and review.id = (
            select latest_review.id
            from public.property_commercial_review_evidence as latest_review
            where latest_review.property_id = property_record.id
              and latest_review.commercial_agreement_evidence_id =
                v_current_agreement_id
            order by latest_review.created_at desc, latest_review.id desc
            limit 1
          )
          and review.commercial_terms_version =
            property_record.commercial_terms_version
          and lower(trim(review.support_contact_email)) =
            lower(trim(property_record.support_contact_email))
          and review.reviewer_id = property_record.commercial_verified_by
          and review.created_at = property_record.commercial_verified_at
          and review.legal_business_verified
          and review.sole_owner_conflict_acknowledged
          and review.commercial_terms_evidence_verified
          and review.support_contact_verified
      )
    then
      raise exception 'An effective executed hotel commercial agreement and matching commercial review are required before publication'
        using errcode = 'P0001';
    end if;
  end if;

  return public.set_property_publication_state_graph_guarded(
    p_property_id,
    p_active
  );
end;
$$;

revoke all on function public.set_property_publication_state(uuid, boolean)
  from public, anon, service_role;
grant execute on function public.set_property_publication_state(uuid, boolean)
  to authenticated;

create function public.terminate_hotel_commercial_agreement(
  p_agreement_evidence_id uuid,
  p_termination_reference text,
  p_terminated_at timestamptz,
  p_reason text
)
returns public.hotel_commercial_agreement_terminations
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_agreement public.hotel_commercial_agreement_evidence;
  v_termination public.hotel_commercial_agreement_terminations;
  v_now timestamptz := pg_catalog.clock_timestamp();
begin
  if not exists (
    select 1 from public.profiles
    where profiles.id = auth.uid() and profiles.role = 'admin'
  ) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  select agreement.*
  into v_agreement
  from public.hotel_commercial_agreement_evidence as agreement
  where agreement.id = p_agreement_evidence_id
  for update;
  if v_agreement.id is null then
    raise exception 'Hotel commercial agreement evidence not found'
      using errcode = 'P0002';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'hotel-commercial-agreement:' || v_agreement.property_id::text,
      0
    )
  );

  if exists (
    select 1 from public.hotel_commercial_agreement_terminations
    where agreement_evidence_id = p_agreement_evidence_id
  ) then
    raise exception 'The hotel commercial agreement is already terminated'
      using errcode = 'P0001';
  end if;
  if p_terminated_at is null
    or p_terminated_at < v_agreement.effective_at
    or p_terminated_at > v_now
    or length(trim(coalesce(p_termination_reference, ''))) not between 8 and 160
    or p_termination_reference ~ '[[:cntrl:]]'
    or length(trim(coalesce(p_reason, ''))) not between 20 and 2000
  then
    raise exception 'Hotel commercial agreement termination evidence is incomplete or invalid'
      using errcode = '22023';
  end if;

  -- Deactivate before recording the terminal event so the existing publication
  -- guard sees the still-effective agreement. Both writes commit atomically.
  update public.properties
  set active = false
  where id = v_agreement.property_id;

  insert into public.hotel_commercial_agreement_terminations (
    agreement_evidence_id,
    property_id,
    terminated_at,
    termination_reference,
    recorded_by,
    reason_summary
  ) values (
    v_agreement.id,
    v_agreement.property_id,
    p_terminated_at,
    trim(p_termination_reference),
    auth.uid(),
    trim(p_reason)
  ) returning * into v_termination;

  return v_termination;
end;
$$;

revoke all on function public.terminate_hotel_commercial_agreement(
  uuid, text, timestamptz, text
) from public, anon, service_role;
grant execute on function public.terminate_hotel_commercial_agreement(
  uuid, text, timestamptz, text
) to authenticated;

create function public.retire_counsel_approved_hotel_commercial_agreement_version(
  p_agreement_version text,
  p_retirement_reference text,
  p_retired_at timestamptz,
  p_reason text
)
returns public.hotel_commercial_agreement_version_retirements
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_version public.hotel_commercial_agreement_versions;
  v_retirement public.hotel_commercial_agreement_version_retirements;
  v_property_id uuid;
  v_now timestamptz := pg_catalog.clock_timestamp();
begin
  if not exists (
    select 1 from public.profiles
    where profiles.id = auth.uid() and profiles.role = 'admin'
  ) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'hotel-commercial-agreement-version:' || coalesce(p_agreement_version, ''),
      0
    )
  );

  -- Lock every affected property in a deterministic order before taking the
  -- version row lock. Receipt uses the same version-then-property order.
  for v_property_id in
    select distinct agreement.property_id
    from public.hotel_commercial_agreement_evidence as agreement
    where agreement.agreement_version = p_agreement_version
    order by agreement.property_id
  loop
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(
        'hotel-commercial-agreement:' || v_property_id::text,
        0
      )
    );
  end loop;

  select agreement_version.*
  into v_version
  from public.hotel_commercial_agreement_versions as agreement_version
  where agreement_version.agreement_version = p_agreement_version
  for update;
  if v_version.agreement_version is null then
    raise exception 'Counsel-approved hotel commercial agreement version not found'
      using errcode = 'P0002';
  end if;
  if exists (
    select 1 from public.hotel_commercial_agreement_version_retirements
    where agreement_version = p_agreement_version
  ) then
    raise exception 'The counsel-approved hotel commercial agreement version is already retired'
      using errcode = 'P0001';
  end if;
  if p_retired_at is null
    or p_retired_at < v_version.effective_at
    or p_retired_at > v_now
    or length(trim(coalesce(p_retirement_reference, ''))) not between 8 and 160
    or p_retirement_reference ~ '[[:cntrl:]]'
    or length(trim(coalesce(p_reason, ''))) not between 20 and 2000
  then
    raise exception 'Hotel commercial agreement version retirement evidence is incomplete or invalid'
      using errcode = '22023';
  end if;

  update public.properties as property_record
  set active = false
  where property_record.active
    and exists (
      select 1
      from public.hotel_commercial_agreement_evidence as agreement
      where agreement.property_id = property_record.id
        and agreement.agreement_version = p_agreement_version
    );

  insert into public.hotel_commercial_agreement_version_retirements (
    agreement_version,
    retired_at,
    retirement_reference,
    recorded_by,
    reason_summary
  ) values (
    p_agreement_version,
    p_retired_at,
    trim(p_retirement_reference),
    auth.uid(),
    trim(p_reason)
  ) returning * into v_retirement;

  return v_retirement;
end;
$$;

revoke all on function public.retire_counsel_approved_hotel_commercial_agreement_version(
  text, text, timestamptz, text
) from public, anon, service_role;
grant execute on function public.retire_counsel_approved_hotel_commercial_agreement_version(
  text, text, timestamptz, text
) to authenticated;

comment on table public.hotel_commercial_agreement_versions is
  'Immutable metadata for counsel-approved agreement templates. This migration seeds no version, so counsel drafts grant no execution authority.';
comment on table public.hotel_commercial_agreement_evidence is
  'Immutable, minimized metadata for an externally executed property-specific hotel agreement. It stores no contract body, signature image, credential, bank data, or payment data.';
comment on table public.hotel_commercial_agreement_terminations is
  'Append-only terminal agreement evidence. Recording termination atomically deactivates the property and immediately fails public visibility closed.';
comment on function public.record_hotel_commercial_agreement_receipt(
  uuid, uuid, text, text, text, text, text, text,
  timestamptz, timestamptz, timestamptz, timestamptz,
  boolean, boolean, text
) is 'Records a verified executed-agreement receipt only; it does not review or publish a property, enable bookings, or authorize payments, payouts, email, or supplier traffic.';

commit;
