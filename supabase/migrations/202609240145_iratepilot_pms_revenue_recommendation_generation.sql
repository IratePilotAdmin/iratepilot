begin;

do $$
begin
  if exists (
    select 1 from public.revenue_daily_inputs i
    left join public.rooms r on r.id = i.room_id
    where r.id is null or r.property_id <> i.property_id
  ) or exists (
    select 1 from public.revenue_recommendations rec
    left join public.rooms r on r.id = rec.room_id
    where r.id is null or r.property_id <> rec.property_id
  ) then
    raise exception 'Reconcile cross-property revenue room rows before applying this migration';
  end if;
end;
$$;

create or replace function public.validate_revenue_room_property()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if not exists (
    select 1 from public.rooms r
    where r.id = new.room_id and r.property_id = new.property_id
  ) then
    raise exception 'Revenue room must belong to the selected property'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

revoke all on function public.validate_revenue_room_property() from public, anon, authenticated;
drop trigger if exists revenue_daily_inputs_room_property_guard on public.revenue_daily_inputs;
create trigger revenue_daily_inputs_room_property_guard
  before insert or update of property_id, room_id on public.revenue_daily_inputs
  for each row execute function public.validate_revenue_room_property();
drop trigger if exists revenue_recommendations_room_property_guard on public.revenue_recommendations;
create trigger revenue_recommendations_room_property_guard
  before insert or update of property_id, room_id on public.revenue_recommendations
  for each row execute function public.validate_revenue_room_property();

create or replace function public.generate_revenue_recommendations(
  p_property_id uuid,
  p_start_date date,
  p_end_date date
) returns integer
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_actor uuid := auth.uid();
  v_authorized boolean;
  v_count integer;
begin
  if v_actor is null then
    raise exception 'Not authorized';
  end if;

  select exists (
    select 1 from public.profiles where id = v_actor and role = 'admin'
    union all
    select 1
    from public.properties p
    join public.partners pa on pa.id = p.partner_id
    where p.id = p_property_id
      and pa.owner_id = v_actor
      and pa.status = 'approved'
  ) into v_authorized;
  if not v_authorized then
    raise exception 'Not authorized';
  end if;

  perform 1 from public.properties where id = p_property_id for update;
  if not found then
    raise exception 'Property not found';
  end if;

  if p_start_date is null or p_end_date is null or p_end_date <> p_start_date + 89 then
    raise exception 'A complete 90-day date window is required';
  end if;

  select count(*)::integer into v_count
  from public.revenue_daily_inputs
  where property_id = p_property_id
    and stay_date between p_start_date and p_end_date;
  if v_count = 0 then return 0; end if;

  update public.revenue_recommendations
  set status = 'superseded'
  where property_id = p_property_id and status = 'pending';

  insert into public.revenue_recommendations (
    property_id, room_id, stay_date, current_rate, recommended_rate,
    occupancy_forecast, estimated_revenue_impact, reason
  )
  with occupancy as (
    select i.*,
      case when i.rooms_available > 0
        then i.rooms_sold::numeric / i.rooms_available else 0 end as occupancy_ratio
    from public.revenue_daily_inputs i
    where i.property_id = p_property_id
      and i.stay_date between p_start_date and p_end_date
  ), pricing as (
    select o.*,
      o.occupancy_ratio * 100 as occupancy_percent,
      case when o.occupancy_ratio >= 0.85 then 1.15::numeric
           when o.occupancy_ratio >= 0.7 then 1.08::numeric
           when o.occupancy_ratio < 0.35 then 0.92::numeric
           else 1::numeric end
      + case when o.competitor_rate > o.current_rate * 1.08 then 0.04::numeric else 0::numeric end
      + case when nullif(o.event_name, '') is not null then 0.06::numeric else 0::numeric end as rate_multiplier
    from occupancy o
  ), calculated as (
    select p.*,
      greatest(1, round(p.current_rate * p.rate_multiplier)) as recommended_rate
    from pricing p
  )
  select c.property_id, c.room_id, c.stay_date, c.current_rate, c.recommended_rate,
    least(100, round((c.occupancy_percent + coalesce(c.last_year_occupancy, c.occupancy_percent)) / 2)),
    round((c.recommended_rate - c.current_rate) * greatest(0, c.rooms_available - c.rooms_sold) * 100) / 100,
    'Based on ' || round(c.occupancy_percent)::integer || '% booking occupancy'
      || case when c.competitor_rate > c.current_rate * 1.08 then ', competitors are priced higher' else '' end
      || case when nullif(c.event_name, '') is not null then ', demand event: ' || c.event_name else '' end
      || '. Manager approval is required.'
  from calculated c;

  insert into public.revenue_audit_log (property_id, actor_id, action, details)
  values (
    p_property_id,
    v_actor,
    'recommendations_generated',
    jsonb_build_object('count', v_count, 'window_days', 90)
  );

  return v_count;
end;
$$;

revoke all on function public.generate_revenue_recommendations(uuid, date, date) from public, anon;
grant execute on function public.generate_revenue_recommendations(uuid, date, date) to authenticated;

commit;
