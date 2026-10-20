-- Read-only postflight for isolated PMS receiver wjosvslkselpauyftias.
-- Run after the supervised SYNTHPMS001 replay has been disabled again.
-- Only event identity and application state are returned; no guest or secret fields.
select jsonb_build_object(
  'receiverProject', 'wjosvslkselpauyftias',
  'checkedAt', clock_timestamp(),
  'dataChanged', false,
  'result', jsonb_build_object(
    'disabledMatchingConnection', (select count(*) from irp_pms.gateway_connections
      where connection_id='SYNTHPMS001'
        and tenant_id='b0fee4d2-9c8f-427a-b673-1eefe4cb649b'
        and property_id='9fd1e544-d737-4023-ac51-49408166a15f'
        and ota_property_id='33000000-0000-4000-8000-000000000033'
        and enabled=false),
    'receipts', (select coalesce(jsonb_agg(jsonb_build_object(
      'eventId', event_id, 'sourceVersion', source_version,
      'applicationOutcome', application_outcome, 'resolutionOutcome', resolution_outcome
    ) order by source_version, event_id), '[]'::jsonb)
      from irp_pms.inbound_events
      where tenant_id='b0fee4d2-9c8f-427a-b673-1eefe4cb649b'
        and property_id='9fd1e544-d737-4023-ac51-49408166a15f'
        and booking_id='88000000-0000-4000-8000-000000000089'),
    'otherScopeReceipts', (select count(*) from irp_pms.inbound_events
      where booking_id='88000000-0000-4000-8000-000000000089'
        and (tenant_id<>'b0fee4d2-9c8f-427a-b673-1eefe4cb649b'
          or property_id<>'9fd1e544-d737-4023-ac51-49408166a15f')),
    'reservation', (select coalesce(jsonb_agg(jsonb_build_object(
      'sourceVersion', source_version, 'status', status
    )), '[]'::jsonb)
      from irp_pms.reservations
      where tenant_id='b0fee4d2-9c8f-427a-b673-1eefe4cb649b'
        and property_id='9fd1e544-d737-4023-ac51-49408166a15f'
        and source_booking_id='88000000-0000-4000-8000-000000000089'),
    'stayChangeCommands', (select count(*) from irp_pms.ota_stay_change_commands
      where tenant_id='b0fee4d2-9c8f-427a-b673-1eefe4cb649b'
        and property_id='9fd1e544-d737-4023-ac51-49408166a15f')
  )
) as evidence;
