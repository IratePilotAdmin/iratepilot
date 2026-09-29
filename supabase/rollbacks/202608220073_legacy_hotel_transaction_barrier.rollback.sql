begin;

-- Safety-preserving rollback: re-engage both holds and retain the table and
-- triggers. Removing the barrier requires a separate forward migration after
-- explicit transaction-launch approval.
update public.hotel_legacy_transaction_controls
set booking_approval_enabled = false,
    payment_finalization_enabled = false,
    reward_issuance_enabled = false,
    partner_connect_onboarding_enabled = false,
    partner_payout_enabled = false,
    change_reference = 'rollback_hold_reengaged',
    updated_by = null,
    updated_at = now()
where singleton = true;

commit;
