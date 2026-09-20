begin;

do $flight_consumer_preview_096_forward_only$
begin
  raise exception 'Forward-only recovery boundary: migration 096 cannot be rolled back safely while deployed servers may depend on immutable completion-lease recovery; restore from a reviewed backup instead';
end;
$flight_consumer_preview_096_forward_only$;

rollback;
