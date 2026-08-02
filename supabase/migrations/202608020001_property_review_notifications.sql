begin;

create or replace function public.notify_property_review_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner_id uuid;
  v_owner_email text;
  v_owner_name text;
  v_title text;
  v_message text;
begin
  if new.active is not distinct from old.active then
    return new;
  end if;

  select
    partner.owner_id,
    owner_user.email,
    coalesce(nullif(owner_profile.full_name, ''), 'Partner')
  into v_owner_id, v_owner_email, v_owner_name
  from public.partners as partner
  join auth.users as owner_user on owner_user.id = partner.owner_id
  left join public.profiles as owner_profile on owner_profile.id = partner.owner_id
  where partner.id = new.partner_id;

  -- Partner edits can return a listing to review. The dashboard already explains
  -- that transition, so only administrator or service-role decisions notify them.
  if v_owner_id is null or auth.uid() is not distinct from v_owner_id then
    return new;
  end if;

  if new.active then
    v_title := 'Property published';
    v_message := new.name || ' is now published in the iRatePilot marketplace.';
  else
    v_title := 'Property listing paused';
    v_message := new.name || ' was returned to review. Check your listing details or contact iRatePilot support.';
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
      v_title || ': ' || new.name,
      case when new.active then 'property_published' else 'property_paused' end,
      jsonb_build_object(
        'recipient_name', v_owner_name,
        'message', v_message,
        'action_url', 'https://www.iratepilot.com/partner/properties'
      )
    );
  end if;

  return new;
end;
$$;

drop trigger if exists on_property_review_changed on public.properties;
create trigger on_property_review_changed
  after update of active on public.properties
  for each row execute procedure public.notify_property_review_change();

revoke all on function public.notify_property_review_change()
  from public, anon, authenticated;

commit;
