begin;

do $$
begin
  if exists (select 1 from public.priority_pms_launch_evidence limit 1) then
    raise exception 'Refusing rollback: priority_pms_launch_evidence contains data';
  end if;
end $$;

drop table if exists public.priority_pms_launch_evidence;

commit;
