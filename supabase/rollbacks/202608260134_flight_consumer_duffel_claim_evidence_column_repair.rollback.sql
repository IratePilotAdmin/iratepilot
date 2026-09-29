begin;

do $flight_consumer_preview_095_forward_only$
begin
  raise exception 'Forward-only repair: migration 095 cannot be rolled back safely because the predecessor Duffel claim references a nonexistent offer-evidence tombstone column; restore from a reviewed backup rather than reinstalling the invalid private claim body';
end;
$flight_consumer_preview_095_forward_only$;

rollback;
