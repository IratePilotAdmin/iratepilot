-- Read-only preflight for isolated PMS receiver wjosvslkselpauyftias.
-- Synthetic property and booking only. Run immediately before the supervised replay.
select
  (select count(*) from irp_pms.gateway_connections
   where connection_id='SYNTHPMS001'
     and tenant_id='b0fee4d2-9c8f-427a-b673-1eefe4cb649b'
     and property_id='9fd1e544-d737-4023-ac51-49408166a15f'
     and ota_property_id='33000000-0000-4000-8000-000000000033'
     and enabled=false) as disabled_matching_connection,
  (select count(*) from irp_pms.rate_plans
   where tenant_id='b0fee4d2-9c8f-427a-b673-1eefe4cb649b'
     and property_id='9fd1e544-d737-4023-ac51-49408166a15f'
     and id='66000000-0000-4000-8000-000000000066'
     and room_type_id='d4a26140-83d7-4491-a185-5bd5fff33636'
     and active=true) as active_mapped_plan,
  (select count(*) from irp_pms.nightly_rates
   where tenant_id='b0fee4d2-9c8f-427a-b673-1eefe4cb649b'
     and property_id='9fd1e544-d737-4023-ac51-49408166a15f'
     and plan_id='66000000-0000-4000-8000-000000000066'
     and stay_date='2026-10-25' and amount_minor=10900) as mapped_nightly_rate,
  (select count(*) from irp_pms.nightly_capacity
   where tenant_id='b0fee4d2-9c8f-427a-b673-1eefe4cb649b'
     and property_id='9fd1e544-d737-4023-ac51-49408166a15f'
     and room_type_id='d4a26140-83d7-4491-a185-5bd5fff33636'
     and stay_date='2026-10-25' and units=1) as available_unit,
  (select count(*) from irp_pms.reservations
   where tenant_id='b0fee4d2-9c8f-427a-b673-1eefe4cb649b'
     and property_id='9fd1e544-d737-4023-ac51-49408166a15f'
     and source_booking_id='88000000-0000-4000-8000-000000000089') as replay_booking_receipts,
  (select count(*) from irp_pms.ota_stay_change_commands
   where tenant_id='b0fee4d2-9c8f-427a-b673-1eefe4cb649b'
     and property_id='9fd1e544-d737-4023-ac51-49408166a15f') as stay_change_commands;
