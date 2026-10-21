-- Read-only incident evidence in isolated OTA project onbdizzwwubfdgkgaphx.
-- Replace the one placeholder UUID with the event ID from Admin -> Integrations -> OTA.
-- Export only the single evidence JSON value; no payload, booking ID, or credential is selected.
with target as (
  select event_id, booking_id, property_id, connection_id, tenant_id,
    pms_property_id, source_version, state, attempts, result_code
  from public.irp_pms_outbox
  where event_id = '00000000-0000-4000-8000-000000000000'::uuid
)
select jsonb_build_object(
  'sourceProject', 'onbdizzwwubfdgkgaphx',
  'checkedAt', clock_timestamp(),
  'dataChanged', false,
  'result', jsonb_build_object(
    'event', (select jsonb_build_object(
      'eventId', event_id, 'sourceVersion', source_version,
      'state', state, 'attempts', attempts, 'resultCode', result_code,
      'connectionId', connection_id, 'propertyId', property_id,
      'tenantId', tenant_id, 'pmsPropertyId', pms_property_id
    ) from target),
    'disabledSourceScope', (select count(*) from public.irp_pms_outbox_connections c
      join target t on c.property_id=t.property_id and c.connection_id=t.connection_id
        and c.tenant_id=t.tenant_id and c.pms_property_id=t.pms_property_id
      where c.enabled=false and c.delivery_enabled=false),
    'disabledCredentialScope', (select count(*) from public.irp_pms_native_ari_connections c
      join target t on c.property_id=t.property_id and c.connection_id=t.connection_id
      where c.enabled=false),
    'earlierUndelivered', (select count(*) from public.irp_pms_outbox prior
      join target t on prior.booking_id=t.booking_id
      where prior.source_version<t.source_version and prior.state<>'delivered')
  )
) as evidence;
