begin;

-- Restoring the fallthrough defect would make retained prepared order
-- evidence unsafe. A rollback requires a separately reviewed replacement.
do $$
begin
  if exists (select 1 from public.flight_provider_request_attempts) then
    raise exception 'Cannot roll back the Duffel claim terminal return while provider attempts exist';
  end if;
  raise exception 'Rollback 073 requires a separately reviewed claim-router replacement';
end;
$$;

commit;
