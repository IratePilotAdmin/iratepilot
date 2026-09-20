begin;

lock table
  public.flight_consumer_live_public_offer_reference_purge_receipts,
  public.flight_consumer_live_public_offer_reference_vaults
in access exclusive mode;

do $rollback$
begin
  if exists (
    select 1
      from public.flight_consumer_live_public_offer_reference_purge_receipts
  ) then
    raise exception
      'Refusing rollback: Flight Consumer Live reference purge evidence exists';
  end if;
end;
$rollback$;

revoke execute on function
  public.purge_flight_consumer_live_expired_offer_references_v1(integer)
  from service_role;
drop function
  public.purge_flight_consumer_live_expired_offer_references_v1(integer);

drop trigger flight_consumer_live_public_offer_reference_vaults_immutable
  on public.flight_consumer_live_public_offer_reference_vaults;
create trigger flight_consumer_live_public_offer_reference_vaults_immutable
before update or delete on
  public.flight_consumer_live_public_offer_reference_vaults
for each row execute function
  public.refuse_flight_consumer_live_public_offer_projection_mutation_v1();

drop table
  public.flight_consumer_live_public_offer_reference_purge_receipts;

commit;
