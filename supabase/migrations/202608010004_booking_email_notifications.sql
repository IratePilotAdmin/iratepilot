begin;

create or replace function public.queue_booking_event_notifications()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_partner_user_id uuid;
  v_partner_email text;
  v_partner_name text;
  v_customer_email text;
  v_customer_name text;
  v_partner_title text;
  v_partner_message text;
  v_customer_subject text;
  v_customer_message text;
begin
  if tg_op = 'UPDATE' and new.status is not distinct from old.status then
    return new;
  end if;

  select
    partner.owner_id,
    partner_user.email,
    coalesce(partner_profile.full_name, 'Partner')
  into v_partner_user_id, v_partner_email, v_partner_name
  from public.properties as property
  join public.partners as partner on partner.id = property.partner_id
  join auth.users as partner_user on partner_user.id = partner.owner_id
  left join public.profiles as partner_profile on partner_profile.id = partner.owner_id
  where property.id = new.property_id;

  select
    customer.email,
    coalesce(customer_profile.full_name, 'Traveler')
  into v_customer_email, v_customer_name
  from auth.users as customer
  left join public.profiles as customer_profile on customer_profile.id = customer.id
  where customer.id = new.customer_id;

  case new.status
    when 'pending' then
      v_partner_title := 'New booking request';
      v_partner_message := 'A traveler submitted request ' || new.confirmation_code ||
        ' for ' || new.check_in::text || ' through ' || new.check_out::text || '.';
      v_customer_subject := 'We received booking request ' || new.confirmation_code;
      v_customer_message := 'Your booking request was sent to the property for review. No payment has been collected.';
    when 'confirmed' then
      v_partner_title := 'Booking confirmed';
      v_partner_message := 'Booking ' || new.confirmation_code ||
        ' is confirmed for ' || new.check_in::text || ' through ' || new.check_out::text || '.';
      v_customer_subject := 'Booking ' || new.confirmation_code || ' is confirmed';
      v_customer_message := 'Your iRatePilot booking is confirmed for ' ||
        new.check_in::text || ' through ' || new.check_out::text || '.';
    when 'cancelled' then
      v_partner_title := 'Booking cancelled';
      v_partner_message := 'Booking ' || new.confirmation_code || ' was cancelled.';
      v_customer_subject := 'Booking ' || new.confirmation_code || ' was cancelled';
      v_customer_message := 'Your iRatePilot booking was cancelled. ' ||
        coalesce(new.cancellation_reason, 'View your trips for details.');
    when 'refunded' then
      v_partner_title := 'Booking refunded';
      v_partner_message := 'Booking ' || new.confirmation_code || ' was refunded.';
      v_customer_subject := 'Refund completed for ' || new.confirmation_code;
      v_customer_message := 'The refund for your iRatePilot booking has been completed.';
  end case;

  if v_customer_email is not null and v_customer_subject is not null then
    insert into public.email_outbox (
      recipient_email,
      subject,
      template_name,
      template_data
    ) values (
      v_customer_email,
      v_customer_subject,
      'booking_customer_' || new.status::text,
      jsonb_build_object(
        'recipient_name', v_customer_name,
        'message', v_customer_message,
        'action_url', 'https://www.iratepilot.com/account/trips'
      )
    );
  end if;

  if v_partner_user_id is not null
    and (tg_op = 'INSERT' or auth.uid() is distinct from v_partner_user_id)
  then
    insert into public.notifications (user_id, title, body)
    values (v_partner_user_id, v_partner_title, v_partner_message);

    if v_partner_email is not null then
      insert into public.email_outbox (
        recipient_email,
        subject,
        template_name,
        template_data
      ) values (
        v_partner_email,
        v_partner_title || ': ' || new.confirmation_code,
        'booking_partner_' || new.status::text,
        jsonb_build_object(
          'recipient_name', v_partner_name,
          'message', v_partner_message,
          'action_url', 'https://www.iratepilot.com/partner/reservations'
        )
      );
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists on_booking_notification_event on public.bookings;
create trigger on_booking_notification_event
  after insert or update of status on public.bookings
  for each row execute procedure public.queue_booking_event_notifications();

revoke all on function public.queue_booking_event_notifications()
  from public, anon, authenticated;

commit;
