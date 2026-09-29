begin;

-- Additive intake fields. Legacy applications remain readable but cannot pass
-- the new approval function until their official data and attestations exist.
alter table public.partner_applications
  add column if not exists legal_business_name text,
  add column if not exists star_rating smallint,
  add column if not exists contact_role text,
  add column if not exists phone text,
  add column if not exists support_contact_email text,
  add column if not exists website_url text,
  add column if not exists address_line1 text,
  add column if not exists city text,
  add column if not exists region text,
  add column if not exists postal_code text,
  add column if not exists country_code text,
  add column if not exists description text,
  add column if not exists amenities text[],
  add column if not exists primary_image_url text,
  add column if not exists representative_authority_confirmed boolean not null default false,
  add column if not exists content_rights_confirmed boolean not null default false,
  add column if not exists information_accurate boolean not null default false,
  add column if not exists commercial_terms_version_acknowledged text,
  add column if not exists commercial_terms_acknowledged boolean not null default false,
  add column if not exists commercial_terms_acknowledged_at timestamptz,
  add column if not exists property_id uuid references public.properties(id) on delete set null;

-- The isolated Preview lineage already contains a subset of these intake
-- fields from 202608170062. Normalize the two differing definitions before
-- installing the canonical commercial contract. This remains safe on the
-- 72-version baseline because both operations become no-ops in substance.
do $$
declare
  v_star_rating_type text;
  v_amenities_type text;
begin
  select pg_catalog.format_type(attribute.atttypid, attribute.atttypmod)
  into v_star_rating_type
  from pg_catalog.pg_attribute as attribute
  where attribute.attrelid = 'public.partner_applications'::regclass
    and attribute.attname = 'star_rating'
    and attribute.attnum > 0
    and not attribute.attisdropped;

  select pg_catalog.format_type(attribute.atttypid, attribute.atttypmod)
  into v_amenities_type
  from pg_catalog.pg_attribute as attribute
  where attribute.attrelid = 'public.partner_applications'::regclass
    and attribute.attname = 'amenities'
    and attribute.attnum > 0
    and not attribute.attisdropped;

  if v_star_rating_type not in ('smallint', 'integer') then
    raise exception 'Migration 202608220070 requires partner_applications.star_rating to be smallint or integer';
  end if;

  if v_amenities_type is distinct from 'text[]' then
    raise exception 'Migration 202608220070 requires partner_applications.amenities to be text[]';
  end if;

  if exists (
    select 1
    from public.partner_applications
    where star_rating is not null
      and star_rating not in (4, 5)
  ) then
    raise exception 'Migration 202608220070 cannot normalize unsupported existing star ratings'
      using hint = 'Reconcile the aggregate blocker under a separately approved data-change gate.';
  end if;

  if exists (
    select 1
    from public.partner_applications
    where contact_role is not null
      and contact_role not in (
        'owner',
        'authorized_representative',
        'general_manager',
        'revenue_manager',
        'sales_manager'
      )
  ) then
    raise exception 'Migration 202608220070 cannot normalize unsupported existing contact roles'
      using hint = 'Reconcile the aggregate blocker under a separately approved data-change gate.';
  end if;
end;
$$;

alter table public.partner_applications
  drop constraint if exists partner_applications_star_rating_check,
  drop constraint if exists partner_applications_phone_length_check,
  drop constraint if exists partner_applications_description_length_check,
  drop constraint if exists partner_applications_amenities_count_check,
  drop constraint if exists partner_applications_property_id_fkey,
  drop constraint if exists partner_applications_commercial_intake_lengths_check,
  drop constraint if exists partner_applications_contact_role_check,
  drop constraint if exists partner_applications_country_code_check,
  drop constraint if exists partner_applications_secure_urls_check,
  drop constraint if exists partner_applications_commercial_acknowledgement_check;

alter table public.partner_applications
  alter column star_rating type smallint using star_rating::smallint,
  alter column star_rating drop default,
  alter column star_rating drop not null,
  alter column amenities drop default,
  alter column amenities drop not null;

alter table public.partner_applications
  add constraint partner_applications_property_id_fkey foreign key (property_id)
    references public.properties(id) on delete set null,
  add constraint partner_applications_commercial_intake_lengths_check check (
    (legal_business_name is null or length(trim(legal_business_name)) between 2 and 200)
    and (phone is null or length(trim(phone)) between 7 and 30)
    and (support_contact_email is null or length(trim(support_contact_email)) between 3 and 254)
    and (address_line1 is null or length(trim(address_line1)) between 3 and 200)
    and (city is null or length(trim(city)) between 2 and 100)
    and (region is null or length(trim(region)) <= 100)
    and (postal_code is null or length(trim(postal_code)) between 2 and 20)
    and (description is null or length(trim(description)) between 120 and 4000)
    and (amenities is null or cardinality(amenities) between 1 and 20)
    and (star_rating is null or star_rating in (4, 5))
  ) not valid,
  add constraint partner_applications_contact_role_check check (
    contact_role is null or contact_role in (
      'owner',
      'authorized_representative',
      'general_manager',
      'revenue_manager',
      'sales_manager'
    )
  ) not valid,
  add constraint partner_applications_country_code_check check (
    country_code is null or country_code ~ '^[A-Z]{2}$'
  ) not valid,
  add constraint partner_applications_secure_urls_check check (
    (website_url is null or website_url ~* '^https://')
    and (primary_image_url is null or primary_image_url ~* '^https://')
  ) not valid,
  add constraint partner_applications_commercial_acknowledgement_check check (
    (
      not commercial_terms_acknowledged
      and commercial_terms_version_acknowledged is null
      and commercial_terms_acknowledged_at is null
    )
    or (
      commercial_terms_acknowledged
      and commercial_terms_version_acknowledged is not distinct from
        'hotel_partner_fee_disclosure_13_3_2026-08-22_v1'
      and commercial_terms_acknowledged_at is not null
    )
  ) not valid;

-- Allow one pending application per property for an authorized business email,
-- while preserving deduplication of repeated submissions for that property.
drop index if exists public.one_pending_partner_application_per_email;
drop index if exists public.one_pending_partner_application_per_email_and_property;
drop index if exists public.partner_applications_property_id_key;
create unique index one_pending_partner_application_per_email_and_property
  on public.partner_applications (lower(trim(email)), lower(trim(property_name)))
  where status = 'pending';
create unique index partner_applications_property_id_key
  on public.partner_applications (property_id)
  where property_id is not null;

-- The public route uses the service role, so the database function owns both
-- deduplication, a global storage-abuse ceiling, and the per-email rolling
-- quota. These are storage controls, not proof of a submitter's identity.
create or replace function public.submit_partner_application(
  p_legal_business_name text,
  p_property_name text,
  p_star_rating smallint,
  p_contact_name text,
  p_contact_role text,
  p_email text,
  p_phone text,
  p_support_contact_email text,
  p_property_type public.property_type,
  p_website_url text,
  p_address_line1 text,
  p_city text,
  p_region text,
  p_postal_code text,
  p_country_code text,
  p_description text,
  p_amenities text[],
  p_primary_image_url text,
  p_representative_authority_confirmed boolean,
  p_content_rights_confirmed boolean,
  p_information_accurate boolean,
  p_commercial_terms_version text,
  p_commercial_terms_acknowledged boolean,
  p_commercial_terms_acknowledged_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_normalized_email text := lower(trim(p_email));
  v_normalized_property text := lower(trim(p_property_name));
begin
  if p_commercial_terms_acknowledged is distinct from true
    or p_commercial_terms_version is distinct from
      'hotel_partner_fee_disclosure_13_3_2026-08-22_v1'
    or p_commercial_terms_acknowledged_at is null
  then
    raise exception 'The current hotel commercial disclosure must be acknowledged'
      using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('partner-application:global', 0)
  );
  perform pg_advisory_xact_lock(
    hashtextextended('partner-application:' || v_normalized_email, 0)
  );

  if exists (
    select 1
    from public.partner_applications
    where lower(trim(email)) = v_normalized_email
      and lower(trim(property_name)) = v_normalized_property
      and status = 'pending'
  ) then
    return jsonb_build_object('status', 'received', 'duplicate', true);
  end if;

  if (
    select count(*)
    from public.partner_applications
    where created_at >= now() - interval '24 hours'
  ) >= 200 then
    raise exception 'Global partner application intake capacity exceeded'
      using errcode = 'P0001';
  end if;

  if (
    select count(*)
    from public.partner_applications
    where lower(trim(email)) = v_normalized_email
      and created_at >= now() - interval '24 hours'
  ) >= 3 then
    raise exception 'Partner application intake quota exceeded'
      using errcode = 'P0001';
  end if;

  insert into public.partner_applications (
    legal_business_name,
    property_name,
    star_rating,
    contact_name,
    contact_role,
    email,
    phone,
    support_contact_email,
    property_type,
    website_url,
    address_line1,
    city,
    region,
    postal_code,
    country_code,
    description,
    amenities,
    primary_image_url,
    representative_authority_confirmed,
    content_rights_confirmed,
    information_accurate,
    commercial_terms_version_acknowledged,
    commercial_terms_acknowledged,
    commercial_terms_acknowledged_at,
    status
  ) values (
    p_legal_business_name,
    p_property_name,
    p_star_rating,
    p_contact_name,
    p_contact_role,
    v_normalized_email,
    p_phone,
    lower(trim(p_support_contact_email)),
    p_property_type,
    p_website_url,
    p_address_line1,
    p_city,
    nullif(trim(p_region), ''),
    p_postal_code,
    upper(trim(p_country_code)),
    p_description,
    p_amenities,
    p_primary_image_url,
    p_representative_authority_confirmed,
    p_content_rights_confirmed,
    p_information_accurate,
    p_commercial_terms_version,
    p_commercial_terms_acknowledged,
    p_commercial_terms_acknowledged_at,
    'pending'
  );

  return jsonb_build_object('status', 'received', 'duplicate', false);
exception
  when unique_violation then
    return jsonb_build_object('status', 'received', 'duplicate', true);
end;
$$;

revoke all on function public.submit_partner_application(
  text, text, smallint, text, text, text, text, text,
  public.property_type, text, text, text, text, text, text, text,
  text[], text, boolean, boolean, boolean, text, boolean, timestamptz
) from public, anon, authenticated;
grant execute on function public.submit_partner_application(
  text, text, smallint, text, text, text, text, text,
  public.property_type, text, text, text, text, text, text, text,
  text[], text, boolean, boolean, boolean, text, boolean, timestamptz
) to service_role;

-- These exact fields are the forward contract for direct-hotel activation.
-- Defaults quarantine every legacy and newly created property.
alter table public.properties
  add column if not exists listing_scope text not null default 'legacy_quarantined',
  add column if not exists direct_request_mode text not null default 'disabled',
  add column if not exists commercial_terms_version text,
  add column if not exists commercial_verified_at timestamptz,
  add column if not exists commercial_verified_by uuid references public.profiles(id),
  add column if not exists support_contact_email text;

-- Every property that predates this commercial control plane is moved out of
-- public circulation. A later accountable commercial review and a
-- separate publication decision are both required to return it to public view.
update public.properties
set active = false,
    listing_scope = 'legacy_quarantined',
    direct_request_mode = 'disabled',
    commercial_terms_version = null,
    commercial_verified_at = null,
    commercial_verified_by = null
where active = true;

alter table public.properties
  drop constraint if exists properties_listing_scope_check,
  drop constraint if exists properties_direct_request_mode_check,
  drop constraint if exists properties_commercial_verification_check,
  drop constraint if exists properties_commercial_publication_guard;

alter table public.properties
  add constraint properties_listing_scope_check check (
    listing_scope in ('legacy_quarantined', 'synthetic', 'pilot', 'commercial')
  ),
  add constraint properties_direct_request_mode_check check (
    direct_request_mode in ('disabled', 'request_only')
  ),
  add constraint properties_commercial_verification_check check (
    commercial_verified_at is null
    or (
      commercial_verified_by is not null
      and commercial_terms_version is not null
      and commercial_terms_version = 'hotel_partner_fee_disclosure_13_3_2026-08-22_v1'
    )
  ) not valid,
  add constraint properties_commercial_publication_guard check (
    not active
    or (
      listing_scope = 'commercial'
      and direct_request_mode = 'request_only'
      and commercial_verified_at is not null
      and commercial_verified_by is not null
      and commercial_terms_version is not null
      and commercial_terms_version = 'hotel_partner_fee_disclosure_13_3_2026-08-22_v1'
      and nullif(trim(support_contact_email), '') is not null
    )
  ) not valid;

comment on column public.properties.listing_scope is
  'Fail-closed listing classification. Only a separately verified commercial property can become publication-ready.';
comment on column public.properties.direct_request_mode is
  'Direct-hotel request authority. Disabled by default; request_only never authorizes instant booking, payment, payout, or provider traffic.';

-- Tighten the public RLS predicate used by properties, rooms, and inventory.
-- Partner approval and active=true are insufficient without recorded
-- commercial-review evidence and the request-only boundary.
create or replace function public.is_approved_marketplace_property(p_property_id uuid)
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
      and properties.commercial_terms_version = 'hotel_partner_fee_disclosure_13_3_2026-08-22_v1'
      and nullif(trim(properties.support_contact_email), '') is not null
      and partners.status = 'approved'
  );
$$;

create or replace function public.is_approved_marketplace_room(p_room_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.rooms
    where rooms.id = p_room_id
      and rooms.active = true
      and public.is_approved_marketplace_property(rooms.property_id)
  );
$$;

revoke all on function public.is_approved_marketplace_property(uuid) from public;
revoke all on function public.is_approved_marketplace_room(uuid) from public;
grant execute on function public.is_approved_marketplace_property(uuid) to anon, authenticated;
grant execute on function public.is_approved_marketplace_room(uuid) to anon, authenticated;

drop policy if exists "Public can view active properties" on public.properties;
create policy "Public can view active properties"
  on public.properties for select to anon, authenticated
  using (public.is_approved_marketplace_property(id));

drop policy if exists "Public can view active rooms" on public.rooms;
create policy "Public can view active rooms"
  on public.rooms for select to anon, authenticated
  using (public.is_approved_marketplace_room(id));

drop policy if exists "Public can view inventory" on public.inventory;
create policy "Public can view inventory"
  on public.inventory for select to anon, authenticated
  using (public.is_approved_marketplace_room(room_id));

-- A one-use transaction receipt ensures that even an administrator cannot
-- activate a property with a direct table update. Only the publication RPC,
-- which validates the complete hotel graph, can create this receipt.
create table public.property_publication_authorizations (
  transaction_id bigint not null,
  property_id uuid not null,
  authorized_by uuid not null,
  created_at timestamptz not null default now(),
  primary key (transaction_id, property_id)
);
alter table public.property_publication_authorizations enable row level security;
revoke all on public.property_publication_authorizations
  from public, anon, authenticated, service_role;

-- Owners and delegated managers must not self-certify commercial readiness even
-- when another property policy permits ordinary draft-content updates.
create or replace function public.enforce_property_commercial_control_fields()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_is_admin boolean := exists (
    select 1
    from public.profiles
    where profiles.id = auth.uid()
      and profiles.role = 'admin'
  );
  v_publication_authorized boolean := false;
begin
  if tg_op = 'INSERT' then
    if new.active then
      raise exception 'Use the controlled publication action to activate a property'
        using errcode = '42501';
    end if;
    if auth.uid() is not null and not v_is_admin and (
      new.listing_scope <> 'legacy_quarantined'
      or new.direct_request_mode <> 'disabled'
      or new.commercial_terms_version is not null
      or new.commercial_verified_at is not null
      or new.commercial_verified_by is not null
    ) then
      raise exception 'Commercial property controls require administrator review'
        using errcode = '42501';
    end if;
    return new;
  end if;

  if new.active and old.active is distinct from true then
    delete from public.property_publication_authorizations
    where transaction_id = txid_current()
      and property_id = new.id
      and authorized_by = auth.uid()
    returning true into v_publication_authorized;
    if not coalesce(v_publication_authorized, false) then
      raise exception 'Use the controlled publication action to activate a property'
        using errcode = '42501';
    end if;
  end if;

  if old.active and new.active and (
    new.id is distinct from old.id
    or new.partner_id is distinct from old.partner_id
    or new.star_rating is distinct from old.star_rating
    or new.image_url is distinct from old.image_url
    or new.amenities is distinct from old.amenities
    or new.listing_scope is distinct from old.listing_scope
    or new.direct_request_mode is distinct from old.direct_request_mode
    or new.commercial_terms_version is distinct from old.commercial_terms_version
    or new.commercial_verified_at is distinct from old.commercial_verified_at
    or new.commercial_verified_by is distinct from old.commercial_verified_by
    or new.support_contact_email is distinct from old.support_contact_email
  ) then
    raise exception 'Unpublish the property before changing commercial property terms'
      using errcode = 'P0001';
  end if;

  if auth.uid() is not null and not v_is_admin and (
    new.active is distinct from old.active
    or new.listing_scope is distinct from old.listing_scope
    or new.direct_request_mode is distinct from old.direct_request_mode
    or new.commercial_terms_version is distinct from old.commercial_terms_version
    or new.commercial_verified_at is distinct from old.commercial_verified_at
    or new.commercial_verified_by is distinct from old.commercial_verified_by
    or new.support_contact_email is distinct from old.support_contact_email
  ) then
    raise exception 'Commercial property controls require administrator review'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke all on function public.enforce_property_commercial_control_fields()
  from public, anon, authenticated;
drop trigger if exists enforce_property_commercial_control_fields
  on public.properties;
create trigger enforce_property_commercial_control_fields
before insert or update on public.properties
for each row execute function public.enforce_property_commercial_control_fields();

-- Append-only internal evidence. It contains no credentials, bank data,
-- provider identifiers, or claimed independent/legal approval.
create table if not exists public.partner_application_review_evidence (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  application_id uuid not null references public.partner_applications(id) on delete restrict,
  reviewer_id uuid not null references public.profiles(id) on delete restrict,
  decision text not null check (decision in ('pending', 'approved', 'declined')),
  legal_business_verified boolean not null default false,
  representative_authority_verified boolean not null default false,
  content_rights_verified boolean not null default false,
  commercial_terms_acknowledgement_verified boolean not null default false,
  evidence_summary text not null check (length(trim(evidence_summary)) between 3 and 2000),
  created_at timestamptz not null default now(),
  constraint partner_application_approval_evidence_check check (
    decision <> 'approved'
    or (
      legal_business_verified
      and representative_authority_verified
      and content_rights_verified
      and commercial_terms_acknowledgement_verified
      and length(trim(evidence_summary)) >= 20
    )
  )
);

create index if not exists partner_application_review_evidence_application_idx
  on public.partner_application_review_evidence (application_id, created_at desc);

alter table public.partner_application_review_evidence enable row level security;
revoke all on public.partner_application_review_evidence from public, anon, authenticated, service_role;
grant select on public.partner_application_review_evidence to authenticated;
grant select, insert on public.partner_application_review_evidence to service_role;

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

create table if not exists public.property_commercial_review_evidence (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete restrict,
  reviewer_id uuid not null references public.profiles(id) on delete restrict,
  commercial_terms_version text not null
    check (commercial_terms_version = 'hotel_partner_fee_disclosure_13_3_2026-08-22_v1'),
  support_contact_email text not null
    check (length(trim(support_contact_email)) between 3 and 254),
  legal_business_verified boolean not null default false,
  sole_owner_conflict_acknowledged boolean not null default false,
  reviewer_is_partner_owner boolean not null,
  commercial_terms_evidence_verified boolean not null default false,
  support_contact_verified boolean not null default false,
  evidence_summary text not null
    check (length(trim(evidence_summary)) between 20 and 2000),
  created_at timestamptz not null default now(),
  constraint property_commercial_review_complete_check check (
    legal_business_verified
    and sole_owner_conflict_acknowledged
    and commercial_terms_evidence_verified
    and support_contact_verified
  )
);

create index if not exists property_commercial_review_evidence_property_idx
  on public.property_commercial_review_evidence (property_id, created_at desc);

alter table public.property_commercial_review_evidence enable row level security;
revoke all on public.property_commercial_review_evidence from public, anon, authenticated, service_role;
grant select on public.property_commercial_review_evidence to authenticated;
grant select, insert on public.property_commercial_review_evidence to service_role;

drop policy if exists "Admins view property commercial review evidence"
  on public.property_commercial_review_evidence;
create policy "Admins view property commercial review evidence"
  on public.property_commercial_review_evidence
  for select to authenticated
  using (exists (
    select 1
    from public.profiles
    where profiles.id = auth.uid()
      and profiles.role = 'admin'
  ));

-- Review records are append-only for every database role, including the
-- service role. Corrections require a new evidence record rather than mutation.
create or replace function public.prevent_commercial_review_evidence_mutation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  raise exception 'Commercial review evidence is append-only'
    using errcode = '55000';
end;
$$;

revoke all on function public.prevent_commercial_review_evidence_mutation()
  from public, anon, authenticated;

drop trigger if exists partner_application_review_evidence_append_only
  on public.partner_application_review_evidence;
create trigger partner_application_review_evidence_append_only
before update or delete on public.partner_application_review_evidence
for each row execute function public.prevent_commercial_review_evidence_mutation();

drop trigger if exists property_commercial_review_evidence_append_only
  on public.property_commercial_review_evidence;
create trigger property_commercial_review_evidence_append_only
before update or delete on public.property_commercial_review_evidence
for each row execute function public.prevent_commercial_review_evidence_mutation();

-- Accountable internal owner review is deliberately separate from publication.
-- The evidence explicitly records the sole-owner conflict and never claims an
-- independent approval. The action always leaves the property inactive.
create or replace function public.record_property_commercial_review(
  p_property_id uuid,
  p_commercial_terms_version text,
  p_support_contact_email text,
  p_legal_business_verified boolean,
  p_sole_owner_conflict_acknowledged boolean,
  p_commercial_terms_evidence_verified boolean,
  p_support_contact_verified boolean,
  p_review_notes text
)
returns public.properties
language plpgsql
security definer
set search_path = public
as $$
declare
  v_property public.properties;
  v_partner_owner_id uuid;
  v_partner_status text;
  v_review record;
begin
  if not exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  ) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  select
    properties as property_record,
    partners.owner_id as partner_owner_id,
    partners.status as partner_status
  into v_review
  from public.properties
  join public.partners on partners.id = properties.partner_id
  where properties.id = p_property_id
  for update of properties;

  if not found then
    raise exception 'Property not found' using errcode = 'P0002';
  end if;
  v_property := v_review.property_record;
  v_partner_owner_id := v_review.partner_owner_id;
  v_partner_status := v_review.partner_status;
  if v_partner_status <> 'approved' then
    raise exception 'The partner must be approved before commercial verification'
      using errcode = 'P0001';
  end if;
  if v_property.active then
    raise exception 'Pause the property before commercial verification'
      using errcode = 'P0001';
  end if;
  if not exists (
    select 1
    from public.partner_applications
    where partner_applications.property_id = p_property_id
      and partner_applications.status = 'approved'
  ) then
    raise exception 'An approved linked hotel application is required'
      using errcode = 'P0001';
  end if;
  if not exists (
    select 1
    from public.partner_application_review_evidence
    join public.partner_applications
      on partner_applications.id = partner_application_review_evidence.application_id
    where partner_applications.property_id = p_property_id
      and partner_application_review_evidence.decision = 'approved'
  ) then
    raise exception 'Approved application review evidence is required'
      using errcode = 'P0001';
  end if;
  if not p_legal_business_verified
    or not p_sole_owner_conflict_acknowledged
    or not p_commercial_terms_evidence_verified
    or not p_support_contact_verified
  then
    raise exception 'Complete every accountable internal owner-review check'
      using errcode = 'P0001';
  end if;
  if p_commercial_terms_version is distinct from 'hotel_partner_fee_disclosure_13_3_2026-08-22_v1'
    or length(trim(coalesce(p_support_contact_email, ''))) not between 3 and 254
    or p_support_contact_email !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    or length(trim(coalesce(p_review_notes, ''))) not between 20 and 2000
  then
    raise exception 'Commercial review evidence is incomplete or invalid'
      using errcode = '22023';
  end if;

  insert into public.property_commercial_review_evidence (
    property_id,
    reviewer_id,
    commercial_terms_version,
    support_contact_email,
    legal_business_verified,
    sole_owner_conflict_acknowledged,
    reviewer_is_partner_owner,
    commercial_terms_evidence_verified,
    support_contact_verified,
    evidence_summary
  ) values (
    p_property_id,
    auth.uid(),
    trim(p_commercial_terms_version),
    lower(trim(p_support_contact_email)),
    p_legal_business_verified,
    p_sole_owner_conflict_acknowledged,
    v_partner_owner_id = auth.uid(),
    p_commercial_terms_evidence_verified,
    p_support_contact_verified,
    trim(p_review_notes)
  );

  update public.properties
  set active = false,
      listing_scope = 'commercial',
      direct_request_mode = 'request_only',
      commercial_terms_version = trim(p_commercial_terms_version),
      commercial_verified_at = now(),
      commercial_verified_by = auth.uid(),
      support_contact_email = lower(trim(p_support_contact_email))
  where id = p_property_id
  returning * into v_property;

  return v_property;
end;
$$;

revoke all on function public.record_property_commercial_review(
  uuid, text, text, boolean, boolean, boolean, boolean, text
) from public, anon, service_role;
grant execute on function public.record_property_commercial_review(
  uuid, text, text, boolean, boolean, boolean, boolean, text
) to authenticated;

-- Publication is a separate administrator decision. The function locks and
-- validates the complete property/room/inventory graph in one transaction.
-- It does not create a reservation, payment, payout, credential, or provider
-- request and it cannot advance the direct-request runtime switches.
create or replace function public.set_property_publication_state(
  p_property_id uuid,
  p_active boolean
)
returns public.properties
language plpgsql
security definer
set search_path = public
as $$
declare
  v_property public.properties;
begin
  if not exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  ) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  if p_active is null then
    raise exception 'A publication state is required' using errcode = '22023';
  end if;

  -- These table locks are intentionally coarse and short-lived. Publication is
  -- rare; blocking concurrent room/inventory writes closes the insert race that
  -- row locks over only the existing graph cannot prevent.
  lock table public.rooms, public.inventory in share row exclusive mode;

  select properties.*
  into v_property
  from public.properties
  where properties.id = p_property_id
  for update;

  if not found then
    raise exception 'Property not found' using errcode = 'P0002';
  end if;

  if not p_active then
    update public.properties
    set active = false
    where id = p_property_id
    returning * into v_property;
    return v_property;
  end if;

  perform rooms.id
  from public.rooms
  where rooms.property_id = p_property_id
  for update;
  perform inventory.id
  from public.inventory
  join public.rooms on rooms.id = inventory.room_id
  where rooms.property_id = p_property_id
  for update of inventory;

  if v_property.listing_scope is distinct from 'commercial'
    or v_property.direct_request_mode is distinct from 'request_only'
    or v_property.commercial_terms_version is distinct from
      'hotel_partner_fee_disclosure_13_3_2026-08-22_v1'
    or v_property.commercial_verified_at is null
    or v_property.commercial_verified_by is null
    or nullif(trim(v_property.support_contact_email), '') is null
    or v_property.support_contact_email !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    or v_property.star_rating is null
    or v_property.star_rating not in (4, 5)
    or nullif(trim(v_property.image_url), '') is null
    or v_property.image_url !~* '^https://'
    or coalesce(cardinality(v_property.amenities), 0) = 0
    or not exists (
      select 1 from public.partners
      where partners.id = v_property.partner_id
        and partners.status = 'approved'
    )
  then
    raise exception 'The property does not satisfy the commercial publication guard'
      using errcode = 'P0001';
  end if;

  if not exists (
    select 1 from public.rooms
    where rooms.property_id = p_property_id and rooms.active = true
  ) or exists (
    select 1
    from public.rooms
    where rooms.property_id = p_property_id
      and rooms.active = true
      and (
        rooms.base_rate is null
        or rooms.base_rate < 25 or rooms.base_rate > 25000
        or rooms.max_guests is null
        or rooms.max_guests < 1 or rooms.max_guests > 30
        or nullif(trim(rooms.direct_rate_plan_code), '') is null
        or nullif(trim(rooms.direct_rate_plan_name), '') is null
        or rooms.direct_currency_code is distinct from 'USD'
        or length(trim(coalesce(rooms.direct_cancellation_policy, ''))) < 10
        or nullif(trim(rooms.direct_cancellation_policy_version), '') is null
      )
  ) then
    raise exception 'Every active room requires valid direct rate and cancellation terms'
      using errcode = 'P0001';
  end if;

  if exists (
    select 1
    from public.rooms
    where rooms.property_id = p_property_id
      and rooms.active = true
      and not exists (
        select 1
        from public.inventory
        where inventory.room_id = rooms.id
          and inventory.stay_date >= current_date
          and inventory.available_units between 1 and 500
          and inventory.rate between 25 and 25000
          and inventory.direct_tax_amount between 0 and 25000
          and inventory.direct_mandatory_fee_amount between 0 and 25000
      )
  ) then
    raise exception 'Every active room requires valid future sellable inventory with taxes and mandatory fees'
      using errcode = 'P0001';
  end if;

  if not v_property.active then
    insert into public.property_publication_authorizations (
      transaction_id,
      property_id,
      authorized_by
    ) values (
      txid_current(),
      p_property_id,
      auth.uid()
    )
    on conflict (transaction_id, property_id) do update
      set authorized_by = excluded.authorized_by,
          created_at = now();
  end if;

  update public.properties
  set active = true
  where id = p_property_id
  returning * into v_property;
  return v_property;
end;
$$;

revoke all on function public.set_property_publication_state(uuid, boolean)
  from public, anon, service_role;
grant execute on function public.set_property_publication_state(uuid, boolean)
  to authenticated;

-- A published property cannot have commercial room/rate/tax/policy evidence
-- rewritten underneath the atomic review. Availability-only decrements and
-- releases remain allowed for direct-request holds. Material edits require a
-- separate administrator unpublish decision first.
create or replace function public.enforce_published_hotel_commercial_stability()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old_property_id uuid;
  v_new_property_id uuid;
  v_published boolean;
begin
  if tg_table_name = 'rooms' then
    if tg_op <> 'INSERT' then v_old_property_id := old.property_id; end if;
    if tg_op <> 'DELETE' then v_new_property_id := new.property_id; end if;
    select exists (
      select 1 from public.properties
      where properties.id in (v_old_property_id, v_new_property_id)
        and properties.active = true
    ) into v_published;
    if v_published and (
      tg_op <> 'UPDATE'
      or new.id is distinct from old.id
      or new.property_id is distinct from old.property_id
      or new.active is distinct from old.active
      or new.base_rate is distinct from old.base_rate
      or new.max_guests is distinct from old.max_guests
      or new.direct_rate_plan_code is distinct from old.direct_rate_plan_code
      or new.direct_rate_plan_name is distinct from old.direct_rate_plan_name
      or new.direct_currency_code is distinct from old.direct_currency_code
      or new.direct_cancellation_policy is distinct from old.direct_cancellation_policy
      or new.direct_cancellation_policy_version is distinct from old.direct_cancellation_policy_version
    ) then
      raise exception 'Unpublish the property before changing commercial room terms'
        using errcode = 'P0001';
    end if;
  else
    if tg_op <> 'INSERT' then
      select rooms.property_id into v_old_property_id
      from public.rooms where rooms.id = old.room_id;
    end if;
    if tg_op <> 'DELETE' then
      select rooms.property_id into v_new_property_id
      from public.rooms where rooms.id = new.room_id;
    end if;
    select exists (
      select 1 from public.properties
      where properties.id in (v_old_property_id, v_new_property_id)
        and properties.active = true
    ) into v_published;
    if v_published and (
      tg_op <> 'UPDATE'
      or new.id is distinct from old.id
      or new.room_id is distinct from old.room_id
      or new.stay_date is distinct from old.stay_date
      or new.rate is distinct from old.rate
      or new.direct_tax_amount is distinct from old.direct_tax_amount
      or new.direct_mandatory_fee_amount is distinct from old.direct_mandatory_fee_amount
    ) then
      raise exception 'Unpublish the property before changing commercial inventory terms'
        using errcode = 'P0001';
    end if;
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

revoke all on function public.enforce_published_hotel_commercial_stability()
  from public, anon, authenticated;
drop trigger if exists enforce_published_hotel_room_stability on public.rooms;
create trigger enforce_published_hotel_room_stability
before insert or update or delete on public.rooms
for each row execute function public.enforce_published_hotel_commercial_stability();
drop trigger if exists enforce_published_hotel_inventory_stability on public.inventory;
create trigger enforce_published_hotel_inventory_stability
before insert or update or delete on public.inventory
for each row execute function public.enforce_published_hotel_commercial_stability();

-- Remove the legacy two-argument approval path so internal evidence cannot be
-- bypassed. Approval creates only an inactive, quarantined property draft.
drop function if exists public.review_partner_application(uuid, text);
create or replace function public.review_partner_application(
  p_application_id uuid,
  p_status text,
  p_legal_business_verified boolean,
  p_representative_authority_verified boolean,
  p_content_rights_verified boolean,
  p_commercial_terms_acknowledgement_verified boolean,
  p_review_notes text
)
returns public.partner_applications
language plpgsql
security definer
set search_path = public
as $$
declare
  v_application public.partner_applications;
  v_user_id uuid;
  v_partner_id uuid;
  v_property_id uuid;
  v_slug_base text;
  v_slug text;
begin
  if not exists (
    select 1
    from public.profiles
    where id = auth.uid() and role = 'admin'
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

  select *
  into v_application
  from public.partner_applications
  where id = p_application_id
  for update;

  if not found then
    raise exception 'Partner application not found' using errcode = 'P0002';
  end if;
  if v_application.status = 'approved' and p_status <> 'approved' then
    raise exception 'Approved partner access must be managed separately'
      using errcode = 'P0001';
  end if;

  if p_status = 'approved' then
    if v_application.legal_business_name is null
      or v_application.star_rating not in (4, 5)
      or v_application.contact_role is null
      or v_application.phone is null
      or v_application.support_contact_email is null
      or v_application.website_url is null
      or v_application.address_line1 is null
      or v_application.city is null
      or v_application.postal_code is null
      or v_application.country_code is null
      or v_application.description is null
      or coalesce(cardinality(v_application.amenities), 0) = 0
      or v_application.primary_image_url is null
      or not v_application.representative_authority_confirmed
      or not v_application.content_rights_confirmed
      or not v_application.information_accurate
      or not v_application.commercial_terms_acknowledged
      or v_application.commercial_terms_version_acknowledged is distinct from
        'hotel_partner_fee_disclosure_13_3_2026-08-22_v1'
      or v_application.commercial_terms_acknowledged_at is null
    then
      raise exception 'Complete and verify the commercial hotel intake before approval'
        using errcode = 'P0001';
    end if;

    if not p_legal_business_verified
      or not p_representative_authority_verified
      or not p_content_rights_verified
      or not p_commercial_terms_acknowledgement_verified
      or length(trim(p_review_notes)) < 20
    then
      raise exception 'Record all internal review evidence before approval'
        using errcode = 'P0001';
    end if;

    select id
    into v_user_id
    from auth.users
    where lower(email) = lower(v_application.email)
    order by created_at
    limit 1;

    if v_user_id is null then
      raise exception 'Applicant must register with the application email before approval'
        using errcode = 'P0002';
    end if;
    update public.profiles
    set role = case when role = 'admin' then role else 'partner'::public.user_role end
    where id = v_user_id;

    if not found then
      raise exception 'The registered applicant profile could not be found'
        using errcode = 'P0002';
    end if;

    insert into public.partners (owner_id, business_name, status)
    values (v_user_id, v_application.legal_business_name, 'approved')
    on conflict (owner_id) do update
      set business_name = excluded.business_name,
          status = 'approved'
    returning id into v_partner_id;

    if v_application.property_id is null then
      v_slug_base := trim(both '-' from regexp_replace(
        lower(trim(v_application.property_name)),
        '[^a-z0-9]+',
        '-',
        'g'
      ));
      if v_slug_base = '' then
        v_slug_base := 'hotel';
      end if;
      v_slug := v_slug_base;
      if exists (select 1 from public.properties where slug = v_slug) then
        v_slug := v_slug_base || '-' || substring(v_application.id::text, 1, 8);
      end if;

      insert into public.properties (
        partner_id,
        name,
        slug,
        type,
        star_rating,
        description,
        image_url,
        amenities,
        city,
        region,
        country,
        active,
        listing_scope,
        direct_request_mode,
        support_contact_email
      ) values (
        v_partner_id,
        v_application.property_name,
        v_slug,
        v_application.property_type,
        v_application.star_rating,
        v_application.description,
        v_application.primary_image_url,
        v_application.amenities,
        v_application.city,
        v_application.region,
        v_application.country_code,
        false,
        'legacy_quarantined',
        'disabled',
        v_application.support_contact_email
      ) returning id into v_property_id;

      update public.partner_applications
      set property_id = v_property_id
      where id = p_application_id;
    end if;
  end if;

  insert into public.partner_application_review_evidence (
    application_id,
    reviewer_id,
    decision,
    legal_business_verified,
    representative_authority_verified,
    content_rights_verified,
    commercial_terms_acknowledgement_verified,
    evidence_summary
  ) values (
    p_application_id,
    auth.uid(),
    p_status,
    p_legal_business_verified,
    p_representative_authority_verified,
    p_content_rights_verified,
    p_commercial_terms_acknowledgement_verified,
    trim(p_review_notes)
  );

  update public.partner_applications
  set status = p_status
  where id = p_application_id
  returning * into v_application;

  return v_application;
end;
$$;

revoke all on function public.review_partner_application(
  uuid, text, boolean, boolean, boolean, boolean, text
) from public, anon, service_role;
grant execute on function public.review_partner_application(
  uuid, text, boolean, boolean, boolean, boolean, text
) to authenticated;

comment on function public.review_partner_application(
  uuid, text, boolean, boolean, boolean, boolean, text
) is 'Records internal commercial-intake review evidence and creates only an inactive, legacy-quarantined draft; does not authorize publication, provider traffic, reservations, payments, payouts, or Production.';

commit;
