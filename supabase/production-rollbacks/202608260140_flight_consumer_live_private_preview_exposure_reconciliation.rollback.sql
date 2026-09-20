begin;

-- Gate 140 is the reviewed crash-recovery composition for succeeded shopping
-- evidence. Removing it would restore a caller-assembled authorization gap.
-- Supersede it only with a reviewed, non-regressive forward migration.
do $rollback_refusal$
begin
  raise exception
    'Flight Consumer Live private-preview Gate 140 rollback refused; use a reviewed non-regressive forward migration';
end;
$rollback_refusal$;

commit;
