begin;

-- Gate 118 cannot be rolled back safely: restoring the prior function would
-- deterministically reintroduce PostgreSQL 42702 and disable the reviewed
-- Gate 105 source-recording path. Preserve all data, ACLs, and repaired code.
do $refuse_non_regressive_rollback$
begin
  raise exception
    'Refusing rollback: Gate 118 is a non-regressive repair and the prior Gate 105 RPC is unusable';
end;
$refuse_non_regressive_rollback$;

commit;
