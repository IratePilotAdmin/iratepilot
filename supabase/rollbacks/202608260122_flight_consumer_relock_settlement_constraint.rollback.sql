begin;

-- Restoring the predecessor constraint would make the reviewed relock RPC
-- incapable of closing an active, fully bound Preview control row. Preserve
-- the qualified constraint; any later change must be another forward repair.
do $flight_consumer_preview_083_forward_only$
begin
  raise exception using
    message = 'Migration 083 is forward-only and cannot be rolled back safely',
    hint = 'Deploy a reviewed forward repair; do not restore the settlement constraint that rejects the exact relocked posture.';
end;
$flight_consumer_preview_083_forward_only$;

rollback;
