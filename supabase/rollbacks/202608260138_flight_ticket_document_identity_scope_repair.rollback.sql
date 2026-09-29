begin;

-- Forward-only refusal. After migration 138, separate provider orders may
-- legitimately contain the same opaque Duffel ticket identifier. Reinstating
-- the execution-scope-wide constraint could reject or strand valid bookings.
-- Restore from a reviewed backup or apply a separately reviewed forward repair.
do $flight_ticket_document_identity_scope_138_forward_only$
begin
  raise exception 'Flight ticket document identity-scope migration 138 is forward-only; restore from a reviewed backup or apply a reviewed forward repair';
end;
$flight_ticket_document_identity_scope_138_forward_only$;

rollback;
