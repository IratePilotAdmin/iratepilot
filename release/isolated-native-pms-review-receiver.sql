-- Read-only incident evidence in isolated PMS receiver wjosvslkselpauyftias.
-- Replace the one placeholder UUID with the SAME event ID used in the source query.
-- No guest fields or signing credentials are selected.
with target as (select '00000000-0000-4000-8000-000000000000'::uuid as event_id)
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
      'tenantId', tenant_id, 'propertyId', property_id,
      'applicationOutcome', application_outcome, 'resolutionOutcome', resolution_outcome
    ) order by source_version, event_id), '[]'::jsonb)
      from irp_pms.inbound_events
      where event_id=(select event_id from target)
        and tenant_id='b0fee4d2-9c8f-427a-b673-1eefe4cb649b'
        and property_id='9fd1e544-d737-4023-ac51-49408166a15f'),
    'otherScopeReceipts', (select count(*) from irp_pms.inbound_events
      where event_id=(select event_id from target)
        and (tenant_id<>'b0fee4d2-9c8f-427a-b673-1eefe4cb649b'
          or property_id<>'9fd1e544-d737-4023-ac51-49408166a15f'))
  )
) as evidence;
