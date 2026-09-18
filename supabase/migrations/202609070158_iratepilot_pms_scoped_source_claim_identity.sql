BEGIN;

-- Parse each configured scope into scalar variables before validating it.  The
-- original inline jsonb extraction was rejected by the hosted PL/pgSQL runtime
-- even for canonical UUID strings, which prevented the retry worker from
-- claiming otherwise valid OTA events.
CREATE OR REPLACE FUNCTION public.irp_pms_claim_configured_event(p_connections jsonb)
RETURNS SETOF public.irp_pms_outbox
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
DECLARE
  item jsonb;
  connection_value text;
  property_value text;
  tenant_value text;
  pms_property_value text;
  t timestamptz := clock_timestamp();
BEGIN
  IF p_connections IS NULL
    OR jsonb_typeof(p_connections) <> 'array'
    OR jsonb_array_length(p_connections) NOT BETWEEN 1 AND 100
    OR octet_length(p_connections::text) > 65536
  THEN
    RAISE EXCEPTION 'Provide 1 to 100 configured connection scopes';
  END IF;

  FOR item IN SELECT value FROM jsonb_array_elements(p_connections) LOOP
    IF jsonb_typeof(item) <> 'object' THEN
      RAISE EXCEPTION 'Invalid configured connection scope';
    END IF;
    IF (SELECT count(*) FROM jsonb_object_keys(item)) <> 4
      OR NOT (item ?& ARRAY['connection_id','property_id','tenant_id','pms_property_id'])
      OR EXISTS (SELECT 1 FROM jsonb_each(item) WHERE jsonb_typeof(value) <> 'string')
    THEN
      RAISE EXCEPTION 'Invalid configured connection scope fields';
    END IF;

    connection_value := item->>'connection_id';
    property_value := item->>'property_id';
    tenant_value := item->>'tenant_id';
    pms_property_value := item->>'pms_property_id';

    IF connection_value !~ '^[A-Za-z0-9_-]{1,80}$'
      OR property_value !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      OR tenant_value !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      OR pms_property_value !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    THEN
      RAISE EXCEPTION 'Invalid configured connection identity';
    END IF;
  END LOOP;

  IF (SELECT count(DISTINCT value->>'connection_id') FROM jsonb_array_elements(p_connections)) <> jsonb_array_length(p_connections)
    OR (SELECT count(DISTINCT value->>'property_id') FROM jsonb_array_elements(p_connections)) <> jsonb_array_length(p_connections)
  THEN
    RAISE EXCEPTION 'Duplicate configured connection scope';
  END IF;

  RETURN QUERY
  WITH permitted AS (
    SELECT *
    FROM jsonb_to_recordset(p_connections)
      AS c(connection_id text,property_id uuid,tenant_id text,pms_property_id text)
  ), picked AS (
    SELECT o.event_id
    FROM public.irp_pms_outbox o
    JOIN public.irp_pms_outbox_connections c
      ON c.property_id=o.property_id
      AND c.enabled
      AND c.delivery_enabled
      AND c.environment='sandbox'
      AND c.connection_id=o.connection_id
      AND c.tenant_id=o.tenant_id
      AND c.pms_property_id=o.pms_property_id
    JOIN permitted allowed
      ON allowed.connection_id=c.connection_id
      AND allowed.property_id=c.property_id
      AND allowed.tenant_id=c.tenant_id
      AND allowed.pms_property_id=c.pms_property_id
    WHERE ((o.state IN('pending','retry') AND o.due_at<=t)
      OR (o.state='leased' AND o.lease_until<=t))
      AND NOT EXISTS (
        SELECT 1
        FROM public.irp_pms_outbox earlier
        WHERE earlier.booking_id=o.booking_id
          AND earlier.source_version<o.source_version
          AND earlier.state<>'delivered'
      )
    ORDER BY o.due_at,o.source_version,o.event_id
    FOR UPDATE OF o SKIP LOCKED
    LIMIT 1
  )
  UPDATE public.irp_pms_outbox o
  SET state='leased',attempts=attempts+1,lease_token=gen_random_uuid(),lease_until=t+interval '30 seconds'
  FROM picked
  WHERE o.event_id=picked.event_id
  RETURNING o.*;
END
$$;

REVOKE ALL ON FUNCTION public.irp_pms_claim_configured_event(jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.irp_pms_claim_configured_event(jsonb) TO service_role;

COMMIT;
