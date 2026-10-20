-- Read-only postflight for isolated OTA source onbdizzwwubfdgkgaphx.
-- Run after the supervised SYNTHPMS001 replay has been disabled again.
-- Copy only the evidence JSON; never select event_payload or credentials.
select jsonb_build_object(
  'sourceProject', 'onbdizzwwubfdgkgaphx',
  'checkedAt', clock_timestamp(),
  'dataChanged', false,
  'result', jsonb_build_object(
    'disabledSourceScope', (select count(*) from public.irp_pms_outbox_connections
      where connection_id='SYNTHPMS001'
        and property_id='33000000-0000-4000-8000-000000000033'
        and tenant_id='b0fee4d2-9c8f-427a-b673-1eefe4cb649b'
        and pms_property_id='9fd1e544-d737-4023-ac51-49408166a15f'
        and enabled=false and delivery_enabled=false),
    'disabledCredentialScope', (select count(*) from public.irp_pms_native_ari_connections
      where connection_id='SYNTHPMS001'
        and property_id='33000000-0000-4000-8000-000000000033'
        and enabled=false),
    'cancelledSyntheticBooking', (select count(*) from public.bookings
      where id='88000000-0000-4000-8000-000000000089'
        and property_id='33000000-0000-4000-8000-000000000033'
        and status::text='cancelled'),
    'events', (select coalesce(jsonb_agg(jsonb_build_object(
      'eventId', event_id, 'sourceVersion', source_version,
      'state', state, 'attempts', attempts, 'resultCode', result_code
    ) order by source_version, event_id), '[]'::jsonb)
      from public.irp_pms_outbox
      where booking_id='88000000-0000-4000-8000-000000000089'
        and property_id='33000000-0000-4000-8000-000000000033'),
    'otherScopeEvents', (select count(*) from public.irp_pms_outbox
      where booking_id='88000000-0000-4000-8000-000000000089'
        and (connection_id<>'SYNTHPMS001'
          or property_id<>'33000000-0000-4000-8000-000000000033'
          or tenant_id<>'b0fee4d2-9c8f-427a-b673-1eefe4cb649b'
          or pms_property_id<>'9fd1e544-d737-4023-ac51-49408166a15f'))
  )
) as evidence;
