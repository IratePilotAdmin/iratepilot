begin;

create or replace function public.claim_email_outbox_job()
returns setof public.email_outbox
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with next_job as (
    select candidate.id
    from public.email_outbox as candidate
    where candidate.scheduled_at <= now()
      and candidate.attempts < 3
      and (
        candidate.status in ('pending', 'failed')
        or (
          candidate.status = 'processing'
          and candidate.updated_at < now() - interval '15 minutes'
        )
      )
    order by candidate.scheduled_at, candidate.created_at
    for update skip locked
    limit 1
  )
  update public.email_outbox as outbox
  set status = 'processing',
      attempts = outbox.attempts + 1,
      last_error = null,
      processed_at = null,
      updated_at = now()
  from next_job
  where outbox.id = next_job.id
  returning outbox.*;
end;
$$;

revoke all on function public.claim_email_outbox_job()
  from public, anon, authenticated;
grant execute on function public.claim_email_outbox_job() to service_role;

create or replace function public.notify_approved_partner_application()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
begin
  if new.status = 'approved' and old.status is distinct from new.status then
    select id
    into v_user_id
    from auth.users
    where lower(email) = lower(new.email)
    order by created_at
    limit 1;

    if v_user_id is not null then
      insert into public.notifications (user_id, title, body)
      values (
        v_user_id,
        'Partner access approved',
        'Your iRatePilot partner account is ready. Finish your property setup to start accepting bookings.'
      );

      insert into public.email_outbox (
        recipient_email,
        subject,
        template_name,
        template_data
      )
      values (
        new.email,
        'Your iRatePilot partner account is approved',
        'partner_application_approved',
        jsonb_build_object(
          'recipient_name', new.contact_name,
          'message', 'Your partner account is approved. Finish your property setup to start accepting bookings.',
          'action_url', 'https://www.iratepilot.com/partner/dashboard'
        )
      );
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists on_partner_application_approved
  on public.partner_applications;
create trigger on_partner_application_approved
  after update of status on public.partner_applications
  for each row execute procedure public.notify_approved_partner_application();

revoke all on function public.notify_approved_partner_application()
  from public, anon, authenticated;

commit;
