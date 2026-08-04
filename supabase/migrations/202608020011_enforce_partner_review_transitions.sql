begin;

drop policy if exists "Admins can manage partner applications"
  on public.partner_applications;
drop policy if exists "Admins can view partner applications"
  on public.partner_applications;

create policy "Admins can view partner applications"
  on public.partner_applications
  for select
  using (
    exists (
      select 1
      from public.profiles
      where profiles.id = auth.uid()
        and profiles.role = 'admin'
    )
  );

commit;
