begin;

do $rollback$
begin
  if to_regclass(
    'public.flight_consumer_live_public_shopping_admissions'
  ) is not null and exists (
    select 1
      from public.flight_consumer_live_public_shopping_admissions
  ) then
    raise exception
      'Refusing rollback: Flight Consumer Live public-shopping admission evidence exists';
  end if;
end;
$rollback$;

drop function if exists
  public.reserve_flight_consumer_live_public_shopping_admission_v1(
    text, text, text, text, text, text
  );

drop trigger if exists
  flight_consumer_live_public_shopping_admission_immutable
  on public.flight_consumer_live_public_shopping_admissions;
drop function if exists
  public.refuse_flight_consumer_live_public_shopping_admission_mutation_v1();
drop table if exists
  public.flight_consumer_live_public_shopping_admissions;

commit;
