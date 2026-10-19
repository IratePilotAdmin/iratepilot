-- Read-only preflight for isolated OTA source onbdizzwwubfdgkgaphx.
-- Never select signing_secret or encrypted event_payload values here.
select
  (select count(*) from public.irp_pms_outbox_connections
   where connection_id='SYNTHPMS001'
     and property_id='33000000-0000-4000-8000-000000000033'
     and tenant_id='b0fee4d2-9c8f-427a-b673-1eefe4cb649b'
     and pms_property_id='9fd1e544-d737-4023-ac51-49408166a15f'
     and enabled=false and delivery_enabled=false) as disabled_source_scope,
  (select count(*) from public.irp_pms_native_ari_connections
   where connection_id='SYNTHPMS001'
     and property_id='33000000-0000-4000-8000-000000000033'
     and enabled=false) as disabled_credential_scope,
  (select count(*) from public.bookings
   where id='88000000-0000-4000-8000-000000000089'
     and property_id='33000000-0000-4000-8000-000000000033'
     and check_in='2026-10-25' and check_out='2026-10-26'
     and status::text='cancelled') as cancelled_synthetic_booking,
  (select count(*) from public.inventory i
   join public.bookings b on b.room_id=i.room_id
   where b.id='88000000-0000-4000-8000-000000000089'
     and i.stay_date='2026-10-25'
     and i.available_units=1 and i.rate=109
     and i.direct_tax_amount=10) as restored_source_night,
  (select count(*) from public.irp_pms_outbox
   where booking_id='88000000-0000-4000-8000-000000000089'
     and connection_id='SYNTHPMS001'
     and state='pending' and source_version in (1,2)
     and due_at<=now()) as due_pending_events,
  (select count(distinct source_version) from public.irp_pms_outbox
   where booking_id='88000000-0000-4000-8000-000000000089'
     and connection_id='SYNTHPMS001'
     and state='pending' and source_version in (1,2)) as due_distinct_versions,
  (select count(*) from public.irp_pms_outbox
   where booking_id='88000000-0000-4000-8000-000000000089'
     and (state<>'pending' or source_version not in (1,2)))
       as unexpected_event_states;
