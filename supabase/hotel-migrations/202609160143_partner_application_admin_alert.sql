begin;
set local lock_timeout = '5s';
set local statement_timeout = '20s';

-- A hotel application is durable before this best-effort alert runs. Email
-- delivery is operational convenience only and must never become submission
-- authority or expose the applicant's phone, email, address, or notes.
create or replace function public.queue_partner_application_admin_alert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status <> 'pending' then
    return new;
  end if;

  begin
    insert into public.email_outbox (
      recipient_email,
      subject,
      template_name,
      template_data,
      status,
      scheduled_at
    ) values (
      'ceo@iratepilot.com',
      'New hotel partner application: ' || left(new.property_name, 120),
      'partner_application_admin_alert',
      jsonb_build_object(
        'dedupe_key', 'partner-application-admin-alert:' || new.id::text,
        'recipient_name', 'iRatePilot admin',
        'message', format(
          'A new %s-star %s partner application for %s is ready for review.',
          new.star_rating,
          replace(new.property_type::text, '_', ' '),
          new.property_name
        ),
        'action_url', 'https://www.iratepilot.com/admin/partners'
      ),
      'pending',
      clock_timestamp()
    )
    on conflict (logical_dedupe_key)
      where logical_dedupe_key is not null
      do nothing;
  exception when others then
    -- Preserve the application when the notification queue is unavailable.
    -- The protected Admin -> Partners queue remains authoritative.
    raise warning 'Partner application admin alert could not be queued (SQLSTATE=%)', sqlstate;
  end;

  return new;
end;
$$;

revoke all on function public.queue_partner_application_admin_alert()
  from public, anon, authenticated;

drop trigger if exists queue_partner_application_admin_alert
  on public.partner_applications;
create trigger queue_partner_application_admin_alert
after insert on public.partner_applications
for each row execute function public.queue_partner_application_admin_alert();

comment on function public.queue_partner_application_admin_alert() is
  'Queues one privacy-minimized CEO alert for each new pending hotel partner application without blocking application storage when email is unavailable.';

commit;
