do $flight_consumer_preview_093_forward_only$
begin
  raise exception using
    message = 'ROLLBACK BLOCKED: migration 202608260132 is forward-only capture-attestation safety evidence.',
    hint = 'Relock Preview and append a new corrective migration; do not remove mismatch reconciliation or restore pre-attestation dispatch behavior.';
end;
$flight_consumer_preview_093_forward_only$;
