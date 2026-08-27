begin;

-- Gate 139 cannot be safely removed after membership, limiter, stale, or
-- exposure evidence exists, and removing it would reopen an unbounded route
-- composition gap. A later reviewed forward migration must supersede it.
do $rollback_refusal$
begin
  raise exception
    'Flight Consumer Live private-preview Gate 139 rollback refused; use a reviewed non-regressive forward migration';
end;
$rollback_refusal$;

commit;
