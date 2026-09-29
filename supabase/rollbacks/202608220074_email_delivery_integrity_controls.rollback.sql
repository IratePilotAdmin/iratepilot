begin;

lock table public.email_outbox, public.email_delivery_events
  in share row exclusive mode;

do $$
declare
  v_new_classification_count bigint;
  v_quarantined_outbox_count bigint;
  v_provider_send_attempt_count bigint;
begin
  select count(*)
  into v_new_classification_count
  from public.email_delivery_events
  where correlation_status <> 'legacy_unclassified'
     or disposition_status <> 'legacy_unclassified';

  select count(*)
  into v_quarantined_outbox_count
  from public.email_outbox
  where safety_disposition is not null;

  select count(*)
  into v_provider_send_attempt_count
  from public.email_outbox
  where provider_send_attempt_id is not null
     or provider_send_started_at is not null;

  if v_new_classification_count > 0
    or v_quarantined_outbox_count > 0
    or v_provider_send_attempt_count > 0
  then
    raise exception
      'Refusing to roll back 202608220074 while % delivery event(s), % quarantined outbox row(s), and % provider-attempt row(s) depend on the new safety controls',
      v_new_classification_count,
      v_quarantined_outbox_count,
      v_provider_send_attempt_count
      using
        errcode = '55000',
        hint = 'Retain the fail-closed controls or archive the classified state under a separately approved data-change gate.';
  end if;
end;
$$;

drop function if exists public.get_email_runtime_safety_version();

drop index if exists public.email_delivery_events_disposition_review_idx;

alter table public.email_delivery_events
  drop constraint if exists email_delivery_events_fail_closed_correlation_check,
  drop constraint if exists email_delivery_events_disposition_code_check,
  drop constraint if exists email_delivery_events_disposition_status_check,
  drop constraint if exists email_delivery_events_correlation_status_check,
  drop column if exists dispositioned_by,
  drop column if exists dispositioned_at,
  drop column if exists disposition_code,
  drop column if exists disposition_status,
  drop column if exists correlation_status,
  drop column if exists correlated_outbox_id;

drop function if exists public.is_email_delivery_event_state_valid(uuid,text,text,text,timestamptz,uuid,text,timestamptz,text);
drop function if exists public.is_email_delivery_disposition_code_valid(text);
drop function if exists public.is_email_delivery_disposition_status_valid(text);
drop function if exists public.is_email_delivery_correlation_status_valid(text);

drop function if exists public.classify_email_recipient_account(text);

create or replace function public.claim_transactional_email_job()
returns setof public.email_outbox
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job_id uuid;
begin
  select id into v_job_id
  from public.email_outbox
  where scheduled_at <= now()
    and attempts < 5
    and (
      status in ('pending', 'failed')
      or (status = 'processing' and updated_at < now() - interval '15 minutes')
    )
  order by scheduled_at, created_at
  for update skip locked
  limit 1;

  if v_job_id is null then return; end if;

  return query
  update public.email_outbox
  set status = 'processing', attempts = attempts + 1,
      last_error = null, updated_at = now()
  where id = v_job_id
  returning *;
end;
$$;

revoke all on function public.claim_transactional_email_job() from public;
grant execute on function public.claim_transactional_email_job() to service_role;

drop index if exists public.email_outbox_logical_dedupe_key_key;
drop index if exists public.email_outbox_safety_quarantine_idx;
alter table public.email_outbox
  drop constraint if exists email_outbox_safety_quarantine_check,
  drop constraint if exists email_outbox_provider_send_attempt_check,
  drop constraint if exists email_outbox_safety_reason_category_check,
  drop constraint if exists email_outbox_safety_disposition_check,
  drop column if exists safety_dispositioned_at,
  drop column if exists safety_reason_category,
  drop column if exists safety_disposition,
  drop column if exists provider_send_started_at,
  drop column if exists provider_send_attempt_id,
  drop column if exists logical_dedupe_key;

drop function if exists public.is_email_outbox_safety_quarantine_valid(text,text,timestamptz,text,timestamptz,text,text,text,timestamptz,text,uuid,timestamptz);
drop function if exists public.is_email_outbox_provider_send_attempt_valid(uuid,timestamptz,integer,text,text);
drop function if exists public.is_email_outbox_safety_reason_valid(text);
drop function if exists public.is_email_outbox_safety_disposition_valid(text);
drop function if exists public.derive_email_logical_dedupe_key(jsonb);

commit;
