begin;

revoke all on function public.review_partner_application(uuid, text)
  from anon, service_role;

grant execute on function public.review_partner_application(uuid, text)
  to authenticated;

commit;
