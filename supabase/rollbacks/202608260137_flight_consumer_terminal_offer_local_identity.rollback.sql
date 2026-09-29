begin;

-- Forward-only refusal. Migration 098 installs the sole reviewed projection
-- from migration 097's immutable dispatch-time evidence proof to the durable
-- local offer identity used by terminal recovery. Removing it independently
-- would strand already-captured recovery work and cannot be rolled back safely.
-- Restore the database from a reviewed backup or apply a separately reviewed
-- forward migration while Consumer Preview remains relocked.
do $flight_consumer_preview_098_forward_only$
begin
  raise exception 'Flight Consumer Preview migration 098 is forward-only; restore from a reviewed backup or apply a reviewed forward repair';
end;
$flight_consumer_preview_098_forward_only$;

rollback;
