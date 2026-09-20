begin;

do $flight_consumer_preview_094_forward_only$
begin
  raise exception 'Forward-only repair: migration 094 cannot be rolled back safely because it fixes PostgreSQL-ambiguous completion-lease CAS predicates; restore from a reviewed backup rather than reinstalling the unsafe 091 bodies';
end;
$flight_consumer_preview_094_forward_only$;

rollback;
