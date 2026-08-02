do $$
begin
  if exists (
    select 1
    from public.partner_applications
    where status = 'pending'
    group by lower(trim(email))
    having count(*) > 1
  ) then
    raise exception 'Resolve duplicate pending partner applications before enabling application deduplication';
  end if;
end;
$$;

create unique index if not exists one_pending_partner_application_per_email
  on public.partner_applications (lower(trim(email)))
  where status = 'pending';
