begin;

revoke all on function public.queue_flight_consumer_notification_v1(
  uuid, uuid, text, uuid, text, text, text, text, text, text, text
) from public, anon, authenticated, service_role;
revoke all on function public.get_flight_consumer_notification_projection_v1(
  uuid, uuid, text
) from public, anon, authenticated, service_role;

drop function public.queue_flight_consumer_notification_v1(
  uuid, uuid, text, uuid, text, text, text, text, text, text, text
);
drop function public.get_flight_consumer_notification_projection_v1(
  uuid, uuid, text
);
drop table public.flight_consumer_notification_outbox_receipts;

-- Existing email_outbox rows are deliberately preserved. A rollback must not
-- erase or mutate an already-queued customer communication.
commit;
