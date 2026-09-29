begin;

do $flight_consumer_preview_097_forward_only$
begin
  raise exception 'Forward-only terminal recovery boundary: migration 097 cannot be rolled back safely because deployed recovery workers may depend on immutable dispatch-time offer evidence and recovery-observation RPCs; restore from a reviewed backup instead';
end;
$flight_consumer_preview_097_forward_only$;

rollback;
