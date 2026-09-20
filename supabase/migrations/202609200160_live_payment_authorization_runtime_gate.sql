begin;

-- Live PaymentIntent creation checks this immutable approval ledger at runtime.
-- Missing migrations, database errors, expired approvals, and revocations all fail closed.
create function public.has_current_hotel_payment_launch_authorization()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.hotel_payment_launch_authorizations as approval
    where approval.approved_at <= now()
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

revoke all on function public.has_current_hotel_payment_launch_authorization()
  from public, anon, authenticated, service_role;
grant execute on function public.has_current_hotel_payment_launch_authorization()
  to service_role;

commit;
