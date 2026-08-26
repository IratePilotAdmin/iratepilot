begin;

revoke all on function
  public.create_flight_consumer_preview_service_request_v1(uuid,text,text,text),
  public.list_flight_consumer_preview_service_requests_v1(uuid),
  public.list_flight_consumer_admin_service_requests_v1(integer,text)
from public, anon, authenticated, service_role;

drop function public.list_flight_consumer_admin_service_requests_v1(integer,text);
drop function public.list_flight_consumer_preview_service_requests_v1(uuid);
drop function public.create_flight_consumer_preview_service_request_v1(uuid,text,text,text);

drop trigger flight_service_requests_runtime_guard
  on public.flight_service_requests;
create trigger flight_service_requests_runtime_guard
before insert or update on public.flight_service_requests
for each row execute function
  public.enforce_flight_runtime_capability('servicing');

drop function public.enforce_flight_consumer_preview_service_intake_v1();

commit;
