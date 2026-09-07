BEGIN;
-- Stop the configured worker and account for an already sent request first.
-- Preserve source capture, immutable payloads, receipts and separate controls.
REVOKE EXECUTE ON FUNCTION public.irp_pms_claim_configured_event(jsonb) FROM PUBLIC,anon,authenticated,service_role;
COMMIT;
