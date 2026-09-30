begin;

-- A release authorization is append-only evidence. It cannot enable hotel
-- publication, supplier traffic, payments, webhooks, payouts, or public booking;
-- every independent runtime switch remains required.
create table public.hotel_marketplace_release_authorizations (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  approval_reference text not null unique,
  approved_at timestamptz not null,
  expires_at timestamptz not null,
  hotel_intake_verified boolean not null,
  inventory_verified boolean not null,
  commercial_review_verified boolean not null,
  supplier_connection_verified boolean not null,
  production_payments_verified boolean not null,
  support_operations_verified boolean not null,
  rollback_plan_verified boolean not null,
  review_notes text not null,
  recorded_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint hotel_marketplace_release_reference_check check (
    approval_reference ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,159}$'
  ),
  constraint hotel_marketplace_release_window_check check (
    approved_at <= created_at
    and expires_at > created_at
    and expires_at <= approved_at + interval '7 days'
  ),
  constraint hotel_marketplace_release_verifications_check check (
    hotel_intake_verified
    and inventory_verified
    and commercial_review_verified
    and supplier_connection_verified
    and production_payments_verified
    and support_operations_verified
    and rollback_plan_verified
  ),
  constraint hotel_marketplace_release_notes_check check (
    length(trim(review_notes)) between 20 and 2000
    and review_notes !~ '[[:cntrl:]]'
  )
);

create table public.hotel_marketplace_release_authorization_revocations (
  authorization_id uuid primary key
    references public.hotel_marketplace_release_authorizations(id) on delete restrict,
  revoked_at timestamptz not null default now(),
  revocation_reference text not null unique,
  reason_summary text not null,
  recorded_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint hotel_marketplace_release_revocation_reference_check check (
    revocation_reference ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,159}$'
  ),
  constraint hotel_marketplace_release_revocation_reason_check check (
    length(trim(reason_summary)) between 20 and 2000
    and reason_summary !~ '[[:cntrl:]]'
  )
);

alter table public.hotel_marketplace_release_authorizations enable row level security;
alter table public.hotel_marketplace_release_authorization_revocations enable row level security;
revoke all on public.hotel_marketplace_release_authorizations from public, anon, authenticated, service_role;
revoke all on public.hotel_marketplace_release_authorization_revocations from public, anon, authenticated, service_role;
grant select on public.hotel_marketplace_release_authorizations to authenticated;
grant select on public.hotel_marketplace_release_authorization_revocations to authenticated;

create policy "Admins view hotel marketplace release authorizations"
  on public.hotel_marketplace_release_authorizations for select to authenticated
  using (exists (
    select 1 from public.profiles
    where profiles.id = auth.uid() and profiles.role = 'admin'
  ));
create policy "Admins view hotel marketplace release authorization revocations"
  on public.hotel_marketplace_release_authorization_revocations for select to authenticated
  using (exists (
    select 1 from public.profiles
    where profiles.id = auth.uid() and profiles.role = 'admin'
  ));

create function public.prevent_hotel_marketplace_release_evidence_mutation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  raise exception 'Hotel marketplace release evidence is append-only' using errcode = '55000';
end;
$$;
revoke all on function public.prevent_hotel_marketplace_release_evidence_mutation()
  from public, anon, authenticated, service_role;

create trigger hotel_marketplace_release_authorizations_append_only
before update or delete on public.hotel_marketplace_release_authorizations
for each row execute function public.prevent_hotel_marketplace_release_evidence_mutation();
create trigger hotel_marketplace_release_authorization_revocations_append_only
before update or delete on public.hotel_marketplace_release_authorization_revocations
for each row execute function public.prevent_hotel_marketplace_release_evidence_mutation();

create function public.record_hotel_marketplace_release_authorization(
  p_approval_reference text,
  p_approved_at timestamptz,
  p_expires_at timestamptz,
  p_hotel_intake_verified boolean,
  p_inventory_verified boolean,
  p_commercial_review_verified boolean,
  p_supplier_connection_verified boolean,
  p_production_payments_verified boolean,
  p_support_operations_verified boolean,
  p_rollback_plan_verified boolean,
  p_review_notes text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if not exists (
    select 1 from public.profiles
    where profiles.id = auth.uid() and profiles.role = 'admin'
  ) then
    raise exception 'Administrator access is required' using errcode = '42501';
  end if;
  if p_approved_at > now()
    or p_expires_at <= now()
    or p_expires_at > p_approved_at + interval '7 days'
    or not coalesce(p_hotel_intake_verified, false)
    or not coalesce(p_inventory_verified, false)
    or not coalesce(p_commercial_review_verified, false)
    or not coalesce(p_supplier_connection_verified, false)
    or not coalesce(p_production_payments_verified, false)
    or not coalesce(p_support_operations_verified, false)
    or not coalesce(p_rollback_plan_verified, false)
  then
    raise exception 'Every marketplace release control must be current and verified' using errcode = 'P0001';
  end if;
  if exists (
    select 1 from public.hotel_marketplace_release_authorizations as approval
    where approval.approved_at <= now()
      and approval.expires_at > now()
      and not exists (
        select 1 from public.hotel_marketplace_release_authorization_revocations as revocation
        where revocation.authorization_id = approval.id
      )
  ) then
    raise exception 'A current marketplace release authorization already exists' using errcode = '23505';
  end if;

  insert into public.hotel_marketplace_release_authorizations (
    approval_reference, approved_at, expires_at, hotel_intake_verified,
    inventory_verified, commercial_review_verified, supplier_connection_verified,
    production_payments_verified, support_operations_verified,
    rollback_plan_verified, review_notes, recorded_by
  ) values (
    trim(p_approval_reference), p_approved_at, p_expires_at,
    p_hotel_intake_verified, p_inventory_verified, p_commercial_review_verified,
    p_supplier_connection_verified, p_production_payments_verified,
    p_support_operations_verified, p_rollback_plan_verified,
    trim(p_review_notes), auth.uid()
  ) returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.record_hotel_marketplace_release_authorization(
  text,timestamptz,timestamptz,boolean,boolean,boolean,boolean,boolean,boolean,boolean,text
) from public, anon, authenticated, service_role;
grant execute on function public.record_hotel_marketplace_release_authorization(
  text,timestamptz,timestamptz,boolean,boolean,boolean,boolean,boolean,boolean,boolean,text
) to authenticated;

create function public.revoke_hotel_marketplace_release_authorization(
  p_authorization_id uuid,
  p_revocation_reference text,
  p_reason_summary text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.profiles
    where profiles.id = auth.uid() and profiles.role = 'admin'
  ) then
    raise exception 'Administrator access is required' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.hotel_marketplace_release_authorizations
    where id = p_authorization_id
  ) then
    raise exception 'Marketplace release authorization was not found' using errcode = 'P0002';
  end if;
  insert into public.hotel_marketplace_release_authorization_revocations (
    authorization_id, revocation_reference, reason_summary, recorded_by
  ) values (
    p_authorization_id, trim(p_revocation_reference), trim(p_reason_summary), auth.uid()
  );
  return p_authorization_id;
end;
$$;
revoke all on function public.revoke_hotel_marketplace_release_authorization(uuid,text,text)
  from public, anon, authenticated, service_role;
grant execute on function public.revoke_hotel_marketplace_release_authorization(uuid,text,text)
  to authenticated;

create function public.has_current_hotel_marketplace_release_authorization()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.hotel_marketplace_release_authorizations as approval
    where approval.approved_at <= now()
      and approval.expires_at > now()
      and approval.hotel_intake_verified
      and approval.inventory_verified
      and approval.commercial_review_verified
      and approval.supplier_connection_verified
      and approval.production_payments_verified
      and approval.support_operations_verified
      and approval.rollback_plan_verified
      and not exists (
        select 1 from public.hotel_marketplace_release_authorization_revocations as revocation
        where revocation.authorization_id = approval.id
      )
  );
$$;
revoke all on function public.has_current_hotel_marketplace_release_authorization()
  from public, anon, authenticated, service_role;
grant execute on function public.has_current_hotel_marketplace_release_authorization()
  to service_role;

commit;
