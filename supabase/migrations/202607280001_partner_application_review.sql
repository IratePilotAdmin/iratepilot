drop policy if exists "Admins can manage partner applications" on public.partner_applications;
create policy "Admins can manage partner applications"
on public.partner_applications
for all
using (
  exists (
    select 1
    from public.profiles
    where profiles.id = auth.uid()
      and profiles.role = 'admin'
  )
)
with check (
  exists (
    select 1
    from public.profiles
    where profiles.id = auth.uid()
      and profiles.role = 'admin'
  )
);
