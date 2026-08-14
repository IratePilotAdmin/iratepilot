begin;

revoke all on function public.claim_transactional_email_job()
  from public, anon, authenticated;
grant execute on function public.claim_transactional_email_job() to service_role;

commit;
