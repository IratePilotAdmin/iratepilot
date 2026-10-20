begin;

-- Use only with the application rolled back to a revision that does not call
-- this new security-invoker RPC. Dropping it does not change saved inventory,
-- nightly rates, taxes, fees, or hold records.
drop function if exists public.set_partner_inventory_availability(uuid,date,date,integer);

commit;
