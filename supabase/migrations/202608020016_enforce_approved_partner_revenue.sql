begin;

drop policy if exists "Partners can manage own revenue inputs" on public.revenue_daily_inputs;
create policy "Partners can manage own revenue inputs"
  on public.revenue_daily_inputs for all
  using (exists (
    select 1 from public.properties
    join public.partners on partners.id = properties.partner_id
    where properties.id = revenue_daily_inputs.property_id
      and partners.owner_id = auth.uid()
      and partners.status = 'approved'
  ))
  with check (exists (
    select 1 from public.properties
    join public.partners on partners.id = properties.partner_id
    where properties.id = revenue_daily_inputs.property_id
      and partners.owner_id = auth.uid()
      and partners.status = 'approved'
  ));

drop policy if exists "Partners can manage own revenue recommendations" on public.revenue_recommendations;
create policy "Partners can manage own revenue recommendations"
  on public.revenue_recommendations for all
  using (exists (
    select 1 from public.properties
    join public.partners on partners.id = properties.partner_id
    where properties.id = revenue_recommendations.property_id
      and partners.owner_id = auth.uid()
      and partners.status = 'approved'
  ))
  with check (exists (
    select 1 from public.properties
    join public.partners on partners.id = properties.partner_id
    where properties.id = revenue_recommendations.property_id
      and partners.owner_id = auth.uid()
      and partners.status = 'approved'
  ));

drop policy if exists "Partners can view own revenue audit" on public.revenue_audit_log;
create policy "Partners can view own revenue audit"
  on public.revenue_audit_log for select
  using (exists (
    select 1 from public.properties
    join public.partners on partners.id = properties.partner_id
    where properties.id = revenue_audit_log.property_id
      and partners.owner_id = auth.uid()
      and partners.status = 'approved'
  ));

drop policy if exists "Partners can create own revenue audit" on public.revenue_audit_log;
create policy "Partners can create own revenue audit"
  on public.revenue_audit_log for insert
  with check (exists (
    select 1 from public.properties
    join public.partners on partners.id = properties.partner_id
    where properties.id = revenue_audit_log.property_id
      and partners.owner_id = auth.uid()
      and partners.status = 'approved'
  ));

drop policy if exists "Partners can manage own revenue reports" on public.revenue_daily_reports;
create policy "Partners can manage own revenue reports"
  on public.revenue_daily_reports for all
  using (exists (
    select 1 from public.properties
    join public.partners on partners.id = properties.partner_id
    where properties.id = revenue_daily_reports.property_id
      and partners.owner_id = auth.uid()
      and partners.status = 'approved'
  ))
  with check (exists (
    select 1 from public.properties
    join public.partners on partners.id = properties.partner_id
    where properties.id = revenue_daily_reports.property_id
      and partners.owner_id = auth.uid()
      and partners.status = 'approved'
  ));

create or replace function public.review_revenue_recommendation(
  p_recommendation_id uuid,
  p_decision text
) returns public.revenue_recommendations
language plpgsql
security definer set search_path = public
as $$
declare
  v_recommendation public.revenue_recommendations;
  v_authorized boolean;
  v_status text;
begin
  select * into v_recommendation
  from public.revenue_recommendations
  where id = p_recommendation_id
  for update;
  if not found then raise exception 'Recommendation not found'; end if;
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
    union all
    select 1
    from public.properties p
    join public.partners pa on pa.id = p.partner_id
    where p.id = v_recommendation.property_id
      and pa.owner_id = auth.uid()
      and pa.status = 'approved'
  ) into v_authorized;
  if not v_authorized then raise exception 'Not authorized'; end if;
  if v_recommendation.status <> 'pending' then
    raise exception 'Recommendation already reviewed';
  end if;
  if p_decision not in ('approve','reject') then
    raise exception 'Invalid decision';
  end if;
  v_status := case when p_decision = 'approve' then 'approved' else 'rejected' end;
  if v_status = 'approved' then
    update public.inventory
    set rate = v_recommendation.recommended_rate
    where room_id = v_recommendation.room_id
      and stay_date = v_recommendation.stay_date;
  end if;
  update public.revenue_recommendations
  set status = v_status, reviewed_by = auth.uid(), reviewed_at = now()
  where id = p_recommendation_id
  returning * into v_recommendation;
  insert into public.revenue_audit_log (
    property_id, recommendation_id, actor_id, action, details
  ) values (
    v_recommendation.property_id,
    v_recommendation.id,
    auth.uid(),
    'recommendation_' || v_status,
    jsonb_build_object(
      'stay_date', v_recommendation.stay_date,
      'old_rate', v_recommendation.current_rate,
      'recommended_rate', v_recommendation.recommended_rate,
      'inventory_updated', v_status = 'approved'
    )
  );
  return v_recommendation;
end;
$$;

revoke all on function public.review_revenue_recommendation(uuid, text) from public;
grant execute on function public.review_revenue_recommendation(uuid, text) to authenticated;

commit;
