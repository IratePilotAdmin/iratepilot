begin;

create table public.property_review_history (
  id uuid primary key default uuid_generate_v4(),
  property_id uuid not null references public.properties(id) on delete cascade,
  reviewer_id uuid not null references public.profiles(id),
  active boolean not null,
  note text not null check (char_length(note) between 5 and 1000),
  created_at timestamptz not null default now()
);

create index property_review_history_property_created_idx
  on public.property_review_history (property_id, created_at desc);

alter table public.property_review_history enable row level security;

create policy "Partners can view own property reviews"
  on public.property_review_history for select using (
    exists (
      select 1
      from public.properties
      join public.partners on partners.id = properties.partner_id
      where properties.id = property_review_history.property_id
        and partners.owner_id = auth.uid()
    )
  );

create policy "Admins can view property reviews"
  on public.property_review_history for select using (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid() and profiles.role = 'admin'
    )
  );

create or replace function public.queue_property_review_notification(
  p_property_id uuid,
  p_active boolean,
  p_note text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_property_name text;
  v_owner_id uuid;
  v_owner_email text;
  v_owner_name text;
  v_title text;
  v_message text;
begin
  select
    property.name,
    partner.owner_id,
    owner_user.email,
    coalesce(nullif(owner_profile.full_name, ''), 'Partner')
  into v_property_name, v_owner_id, v_owner_email, v_owner_name
  from public.properties as property
  join public.partners as partner on partner.id = property.partner_id
  join auth.users as owner_user on owner_user.id = partner.owner_id
  left join public.profiles as owner_profile on owner_profile.id = partner.owner_id
  where property.id = p_property_id;

  -- Partner edits can return a listing to review. The dashboard already explains
  -- that transition, so only administrator or service-role decisions notify them.
  if v_owner_id is null or auth.uid() is not distinct from v_owner_id then
    return;
  end if;

  if p_active then
    v_title := 'Property published';
    v_message := v_property_name || ' is now published in the iRatePilot marketplace.';
  else
    v_title := 'Property changes requested';
    v_message := v_property_name || ' needs changes before marketplace publication.';
  end if;

  if nullif(btrim(coalesce(p_note, '')), '') is not null then
    v_message := v_message || ' Review note: ' || btrim(p_note);
  elsif not p_active then
    v_message := v_message || ' Check your listing details or contact iRatePilot support.';
  end if;

  insert into public.notifications (user_id, title, body)
  values (v_owner_id, v_title, v_message);

  if v_owner_email is not null then
    insert into public.email_outbox (
      recipient_email,
      subject,
      template_name,
      template_data
    )
    values (
      v_owner_email,
      v_title || ': ' || v_property_name,
      case when p_active then 'property_published' else 'property_changes_requested' end,
      jsonb_build_object(
        'recipient_name', v_owner_name,
        'message', v_message,
        'action_url', 'https://www.iratepilot.com/partner/properties'
      )
    );
  end if;
end;
$$;

create or replace function public.review_property(
  p_property_id uuid,
  p_active boolean,
  p_note text
)
returns public.properties
language plpgsql
security definer
set search_path = public
as $$
declare
  v_property public.properties;
  v_note text;
begin
  if not exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  ) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  v_note := btrim(coalesce(p_note, ''));
  if char_length(v_note) < 5 or char_length(v_note) > 1000 then
    raise exception 'Review note must be between 5 and 1000 characters'
      using errcode = '22023';
  end if;

  select * into v_property
  from public.properties
  where id = p_property_id
  for update;

  if not found then
    raise exception 'Property not found' using errcode = 'P0002';
  end if;

  if v_property.active and p_active then
    raise exception 'Property already has that review status'
      using errcode = '22023';
  end if;

  insert into public.property_review_history (
    property_id,
    reviewer_id,
    active,
    note
  )
  values (p_property_id, auth.uid(), p_active, v_note);

  if v_property.active is distinct from p_active then
    update public.properties
    set active = p_active
    where id = p_property_id
    returning * into v_property;
  else
    perform public.queue_property_review_notification(
      p_property_id,
      p_active,
      v_note
    );
  end if;

  return v_property;
end;
$$;

create or replace function public.notify_property_review_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_review_note text;
begin
  if new.active is not distinct from old.active then
    return new;
  end if;

  select review.note
  into v_review_note
  from public.property_review_history as review
  where review.property_id = new.id
    and review.active = new.active
    and review.created_at = transaction_timestamp()
  order by review.id desc
  limit 1;

  perform public.queue_property_review_notification(new.id, new.active, v_review_note);

  return new;
end;
$$;

revoke all on function public.review_property(uuid, boolean, text)
  from public, anon, service_role;
grant execute on function public.review_property(uuid, boolean, text)
  to authenticated;
revoke all on function public.queue_property_review_notification(uuid, boolean, text)
  from public, anon, authenticated;
revoke all on function public.notify_property_review_change()
  from public, anon, authenticated;

commit;
