begin;

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
    and attempts < 3
    and (
      status in ('pending', 'failed')
      or (status = 'processing' and updated_at < now() - interval '15 minutes')
    )
  order by scheduled_at, created_at
  for update skip locked
  limit 1;

  if v_job_id is null then
    return;
  end if;

  return query
  update public.email_outbox
  set status = 'processing',
      attempts = attempts + 1,
      last_error = null,
      updated_at = now()
  where id = v_job_id
  returning *;
end;
$$;

revoke all on function public.claim_transactional_email_job() from public;
grant execute on function public.claim_transactional_email_job() to service_role;

commit;
