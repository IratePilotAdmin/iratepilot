begin;

drop function if exists public.resolve_partner_hotel_access();
create function public.resolve_partner_hotel_access()
returns table (
  resolved_partner_id uuid,
  partner_name text,
  access_role text
)
language sql
stable
security definer
set search_path = ''
as $$
  with candidate as (
    select
      partners.id as partner_id,
      partners.business_name as partner_name,
      'owner'::text as access_role,
      0 as priority
    from public.partners
    where partners.owner_id = auth.uid()
      and partners.status = 'approved'
    union all
    select
      partner_team_members.partner_id,
      partners.business_name,
      partner_team_members.member_role,
      1 as priority
    from public.partner_team_members
    join public.partners on partners.id = partner_team_members.partner_id
    join public.profiles on profiles.id = partner_team_members.user_id
    where partner_team_members.user_id = auth.uid()
      and partner_team_members.status = 'active'
      and partner_team_members.can_manage_hotels
      and partner_team_members.member_role in (
        'general_manager', 'revenue_manager', 'sales_manager'
      )
      and partners.status = 'approved'
      and profiles.role = 'partner'
  ), ranked as (
    select candidate.*,
      row_number() over (
        partition by candidate.partner_id
        order by candidate.priority
      ) as partner_rank
    from candidate
  )
  select ranked.partner_id, ranked.partner_name, ranked.access_role
  from ranked
  where ranked.partner_rank = 1
  order by lower(ranked.partner_name), ranked.partner_id;
$$;

revoke all on function public.resolve_partner_hotel_access()
  from public, anon, service_role;
grant execute on function public.resolve_partner_hotel_access() to authenticated;

drop policy if exists "Partner integration managers view properties"
  on public.properties;
create policy "Partner integration managers view properties"
  on public.properties for select to authenticated
  using (public.can_manage_partner_integrations(partner_id));

commit;
