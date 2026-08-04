begin;

drop policy if exists "Partners can view own booking financials"
  on public.booking_financials;
create policy "Partners can view own booking financials"
  on public.booking_financials for select
  using (exists (
    select 1
    from public.partners
    where partners.id = booking_financials.partner_id
      and partners.owner_id = auth.uid()
      and partners.status = 'approved'
  ));

drop policy if exists "Partners can view own payouts"
  on public.partner_payouts;
create policy "Partners can view own payouts"
  on public.partner_payouts for select
  using (exists (
    select 1
    from public.partners
    where partners.id = partner_payouts.partner_id
      and partners.owner_id = auth.uid()
      and partners.status = 'approved'
  ));

commit;
