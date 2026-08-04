begin;

drop policy if exists "Partners can create own partner record" on public.partners;
drop policy if exists "Partners can create own properties" on public.properties;

commit;
