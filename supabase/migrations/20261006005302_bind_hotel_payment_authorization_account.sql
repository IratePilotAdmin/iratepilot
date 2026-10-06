begin;

-- Bind the runtime authorization check to the Stripe account that owns the
-- active or staged live credentials. An approval for a different account must
-- never authorize charges on the configured account.
revoke all on function public.has_current_hotel_payment_launch_authorization()
  from public, anon, authenticated, service_role;

alter table public.hotel_payment_launch_authorizations
  drop constraint hotel_payment_launch_stripe_account_check,
  add constraint hotel_payment_launch_stripe_account_check check (
    stripe_account_reference ~ '^acct_[A-Za-z0-9]{8,127}$'
  );

create function public.has_current_hotel_payment_launch_authorization(
  p_stripe_account_reference text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.hotel_payment_launch_authorizations as approval
    where p_stripe_account_reference ~ '^acct_[A-Za-z0-9]{8,127}$'
      and approval.stripe_account_reference = p_stripe_account_reference
      and approval.approved_at <= now()
      and approval.expires_at > now()
      and approval.stripe_account_verified
      and approval.live_charges_capability_verified
      and approval.live_payouts_capability_verified
      and approval.webhook_endpoint_verified
      and approval.refund_dispute_process_verified
      and approval.support_escalation_verified
      and approval.finance_settlement_verified
      and not exists (
        select 1
        from public.hotel_payment_launch_authorization_revocations as revocation
        where revocation.authorization_id = approval.id
      )
  );
$$;

revoke all on function public.has_current_hotel_payment_launch_authorization(text)
  from public, anon, authenticated, service_role;
grant execute on function public.has_current_hotel_payment_launch_authorization(text)
  to service_role;

commit;
