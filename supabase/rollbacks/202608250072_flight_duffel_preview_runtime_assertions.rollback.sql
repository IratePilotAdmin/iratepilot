begin;

-- Data-preserving rollback is intentionally refused once any provider attempt
-- exists because removing these assertions would make retained receipts unsafe.
do $$
begin
  if exists (select 1 from public.flight_provider_request_attempts) then
    raise exception 'Cannot roll back flight Preview runtime assertions while provider attempts exist';
  end if;
  raise exception 'Rollback 072 requires a separately reviewed clean-database 071 restore';
end;
$$;

commit;
