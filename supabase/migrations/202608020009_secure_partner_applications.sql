begin;

drop policy if exists "Public can submit partner applications"
  on public.partner_applications;

alter table public.partner_applications
  add constraint partner_applications_status_check
  check (status in ('pending','approved','declined')) not valid;

commit;
