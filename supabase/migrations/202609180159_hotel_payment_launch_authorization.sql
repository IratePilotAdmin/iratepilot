begin;

-- An approval receipt is evidence only. Runtime payment, webhook, payout, public
-- booking, and hotel publication switches remain independent fail-closed gates.
create table public.hotel_payment_launch_authorizations (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  approval_reference text not null unique,
  stripe_account_reference text not null,
  approved_at timestamptz not null,
  expires_at timestamptz not null,
  stripe_account_verified boolean not null,
  live_charges_capability_verified boolean not null,
  live_payouts_capability_verified boolean not null,
  webhook_endpoint_verified boolean not null,
  refund_dispute_process_verified boolean not null,
  support_escalation_verified boolean not null,
  finance_settlement_verified boolean not null,
  review_notes text not null,
  recorded_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint hotel_payment_launch_approval_reference_check check (
    approval_reference ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,159}$'
  ),
  constraint hotel_payment_launch_stripe_account_check check (
    stripe_account_reference ~ '^acct_[A-Za-z0-9]{6,64}$'
  ),
  constraint hotel_payment_launch_window_check check (
    approved_at <= created_at
    and expires_at > created_at
    and expires_at <= approved_at + interval '90 days'
  ),
  constraint hotel_payment_launch_verifications_check check (
    stripe_account_verified
    and live_charges_capability_verified
    and live_payouts_capability_verified
    and webhook_endpoint_verified
    and refund_dispute_process_verified
    and support_escalation_verified
    and finance_settlement_verified
  ),
  constraint hotel_payment_launch_notes_check check (
    length(trim(review_notes)) between 20 and 2000
    and review_notes !~ '[[:cntrl:]]'
  )
);

create table public.hotel_payment_launch_authorization_revocations (
  authorization_id uuid primary key
    references public.hotel_payment_launch_authorizations(id) on delete restrict,
  revoked_at timestamptz not null,
  revocation_reference text not null unique,
  reason_summary text not null,
  recorded_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint hotel_payment_launch_revocation_reference_check check (
    revocation_reference ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,159}$'
  ),
  constraint hotel_payment_launch_revocation_reason_check check (
    length(trim(reason_summary)) between 20 and 2000
    and reason_summary !~ '[[:cntrl:]]'
  )
);

alter table public.hotel_payment_launch_authorizations enable row level security;
alter table public.hotel_payment_launch_authorization_revocations enable row level security;
revoke all on public.hotel_payment_launch_authorizations from public, anon, authenticated, service_role;
revoke all on public.hotel_payment_launch_authorization_revocations from public, anon, authenticated, service_role;
grant select on public.hotel_payment_launch_authorizations to authenticated;
grant select on public.hotel_payment_launch_authorization_revocations to authenticated;

create policy "Admins view hotel payment launch authorizations"
  on public.hotel_payment_launch_authorizations for select to authenticated
  using (exists (
    select 1 from public.profiles
    where profiles.id = auth.uid() and profiles.role = 'admin'
  ));
create policy "Admins view hotel payment launch authorization revocations"
  on public.hotel_payment_launch_authorization_revocations for select to authenticated
  using (exists (
    select 1 from public.profiles
    where profiles.id = auth.uid() and profiles.role = 'admin'
  ));

create function public.prevent_hotel_payment_launch_evidence_mutation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  raise exception 'Hotel payment launch evidence is append-only' using errcode = '55000';
end;
$$;
revoke all on function public.prevent_hotel_payment_launch_evidence_mutation()
  from public, anon, authenticated, service_role;

create trigger hotel_payment_launch_authorizations_append_only
before update or delete on public.hotel_payment_launch_authorizations
for each row execute function public.prevent_hotel_payment_launch_evidence_mutation();
create trigger hotel_payment_launch_authorization_revocations_append_only
before update or delete on public.hotel_payment_launch_authorization_revocations
for each row execute function public.prevent_hotel_payment_launch_evidence_mutation();

create function public.record_hotel_payment_launch_authorization(
  p_approval_reference text,
  p_stripe_account_reference text,
  p_approved_at timestamptz,
  p_expires_at timestamptz,
  p_stripe_account_verified boolean,
  p_live_charges_capability_verified boolean,
  p_live_payouts_capability_verified boolean,
  p_webhook_endpoint_verified boolean,
  p_refund_dispute_process_verified boolean,
  p_support_escalation_verified boolean,
  p_finance_settlement_verified boolean,
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
    or p_expires_at > p_approved_at + interval '90 days'
    or not coalesce(p_stripe_account_verified, false)
    or not coalesce(p_live_charges_capability_verified, false)
    or not coalesce(p_live_payouts_capability_verified, false)
    or not coalesce(p_webhook_endpoint_verified, false)
    or not coalesce(p_refund_dispute_process_verified, false)
    or not coalesce(p_support_escalation_verified, false)
    or not coalesce(p_finance_settlement_verified, false)
  then
    raise exception 'Every payment approval control must be current and verified' using errcode = 'P0001';
  end if;

  if exists (
    select 1
    from public.hotel_payment_launch_authorizations as authorization
    where authorization.approved_at <= now()
      and authorization.expires_at > now()
      and not exists (
        select 1
        from public.hotel_payment_launch_authorization_revocations as revocation
        where revocation.authorization_id = authorization.id
      )
  ) then
    raise exception 'A current production payment approval already exists' using errcode = '23505';
  end if;

  insert into public.hotel_payment_launch_authorizations (
    approval_reference, stripe_account_reference, approved_at, expires_at,
    stripe_account_verified, live_charges_capability_verified,
    live_payouts_capability_verified, webhook_endpoint_verified,
    refund_dispute_process_verified, support_escalation_verified,
    finance_settlement_verified, review_notes, recorded_by
  ) values (
    trim(p_approval_reference), trim(p_stripe_account_reference), p_approved_at, p_expires_at,
    p_stripe_account_verified, p_live_charges_capability_verified,
    p_live_payouts_capability_verified, p_webhook_endpoint_verified,
    p_refund_dispute_process_verified, p_support_escalation_verified,
    p_finance_settlement_verified, trim(p_review_notes), auth.uid()
  ) returning id into v_id;

  return v_id;
end;
$$;
revoke all on function public.record_hotel_payment_launch_authorization(
  text,text,timestamptz,timestamptz,boolean,boolean,boolean,boolean,boolean,boolean,boolean,text
) from public, anon, authenticated, service_role;
grant execute on function public.record_hotel_payment_launch_authorization(
  text,text,timestamptz,timestamptz,boolean,boolean,boolean,boolean,boolean,boolean,boolean,text
) to authenticated;

create function public.revoke_hotel_payment_launch_authorization(
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
    select 1 from public.hotel_payment_launch_authorizations
    where id = p_authorization_id
  ) then
    raise exception 'Production payment approval was not found' using errcode = 'P0002';
  end if;

  insert into public.hotel_payment_launch_authorization_revocations (
    authorization_id, revoked_at, revocation_reference, reason_summary, recorded_by
  ) values (
    p_authorization_id, now(), trim(p_revocation_reference), trim(p_reason_summary), auth.uid()
  );
  return p_authorization_id;
end;
$$;
revoke all on function public.revoke_hotel_payment_launch_authorization(uuid,text,text)
  from public, anon, authenticated, service_role;
grant execute on function public.revoke_hotel_payment_launch_authorization(uuid,text,text)
  to authenticated;

commit;
