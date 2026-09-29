begin;
set local lock_timeout = '5s';
set local statement_timeout = '20s';

drop trigger if exists queue_partner_application_admin_alert
  on public.partner_applications;
drop function if exists public.queue_partner_application_admin_alert();

commit;
