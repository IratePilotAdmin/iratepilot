import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  APPLY_CONFIRMATION_FLAG,
  applyFlightPreviewMigrations,
  assertExactFlightDryRun,
  assertExactPreviewTarget,
  assertFlightSchemaDump,
  assertPinnedFlightMigrations,
  assertPreviewLedger,
  buildSupabaseChildEnv,
  listRepositoryMigrations,
  parseInvocationMode,
  CANONICAL_FLIGHT_MIGRATION_VERSIONS,
  PINNED_FLIGHT_MIGRATIONS,
  PREVIEW_PROJECT_REF,
  PRODUCTION_PROJECT_REF,
  REQUIRED_REMOTE_FLIGHT_BASELINE_TIP,
  RETIRED_FLIGHT_MIGRATION_VERSIONS,
  SHARED_HOTEL_MIGRATION,
// @ts-expect-error -- The production gate is an executable .mjs module without a declaration file.
} from "../scripts/apply-flight-preview-migrations.mjs";

const previewPassword = "preview-password-never-log";
const previewUrl =
  `postgresql://postgres.${PREVIEW_PROJECT_REF}:${previewPassword}`
  + "@aws-0-us-east-1.pooler.supabase.com:6543/postgres";
const previewEnv = {
  PREVIEW_SUPABASE_PROJECT_REF: PREVIEW_PROJECT_REF,
  PREVIEW_SUPABASE_DB_URL: previewUrl,
};
const previewTarget = assertExactPreviewTarget(previewEnv);
const cliPreviewUrl = previewTarget.cliDatabaseUrl;
const pinnedPlan = assertPinnedFlightMigrations();
const repositoryVersions: string[] = pinnedPlan.migrations.map(
  ({ version }: { version: string }) => version,
);
const requiredRemotePredecessorVersions = [
  ...pinnedPlan.baselineVersions,
  SHARED_HOTEL_MIGRATION.version,
];

function exactMigrationFunctionBody(path: string, functionName: string) {
  const source = readFileSync(path, "utf8").replace(/\r\n?/g, "\n");
  const escapedFunctionName = functionName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = new RegExp(
    `create(?:\\s+or\\s+replace)?\\s+function\\s+public\\.${escapedFunctionName}`
      + "\\s*\\([\\s\\S]*?\\)\\s+returns\\s+[\\s\\S]*?\\bas\\s+"
      + "(\\$[A-Za-z0-9_]*\\$)([\\s\\S]*?)\\1\\s*;",
    "im",
  ).exec(source);
  if (!match) {
    throw new Error(`Missing migration function body for ${functionName}.`);
  }
  return match[2];
}

const terminalOfferEvidenceLoaderBody = exactMigrationFunctionBody(
  "supabase/migrations/202608260136_flight_consumer_terminal_offer_evidence_recovery.sql",
  "load_flight_offer_evidence_for_terminal_recovery_v1",
);
const terminalOfferLocalIdentityBody = exactMigrationFunctionBody(
  "supabase/migrations/202608260137_flight_consumer_terminal_offer_local_identity.sql",
  "get_flight_offer_local_identity_for_terminal_recovery_v1",
);

function migrationList(remoteVersions: string[]) {
  const remote = new Set(remoteVersions);
  return [
    "  Local          | Remote         | Time (UTC)",
    " ----------------|----------------|---------------------",
    ...repositoryVersions.map((version) => (
      `  ${version} | ${remote.has(version) ? version : ""} |`
    )),
  ].join("\n");
}

function physicalSchemaDump() {
  return `
CREATE TABLE public.flight_runtime_controls (
  control_key text NOT NULL,
  execution_kill_switch_engaged boolean DEFAULT true NOT NULL,
  synthetic_execution_enabled boolean DEFAULT false NOT NULL,
  provider_sandbox_traffic_enabled boolean DEFAULT false NOT NULL,
  provider_live_traffic_enabled boolean DEFAULT false NOT NULL,
  shopping_enabled boolean DEFAULT false NOT NULL,
  order_enabled boolean DEFAULT false NOT NULL,
  payment_enabled boolean DEFAULT false NOT NULL,
  ticketing_enabled boolean DEFAULT false NOT NULL,
  servicing_enabled boolean DEFAULT false NOT NULL,
  provider_events_enabled boolean DEFAULT false NOT NULL,
  production_release_enabled boolean DEFAULT false NOT NULL,
  bound_project_ref text,
  activation_evidence_sha256 text,
  bound_provider_settlement_processor_code text,
  bound_provider_settlement_account_sha256 text,
  bound_provider_settlement_environment text,
  bound_provider_settlement_source_sha256 text,
  bound_provider_settlement_adapter_version_sha256 text
);
ALTER TABLE ONLY public.flight_runtime_controls
  ADD CONSTRAINT flight_runtime_controls_provider_settlement_dependency_check CHECK (
    (
      bound_provider_settlement_processor_code IS NULL
      AND bound_provider_settlement_account_sha256 IS NULL
      AND bound_provider_settlement_environment IS NULL
      AND bound_provider_settlement_source_sha256 IS NULL
      AND bound_provider_settlement_adapter_version_sha256 IS NULL
      AND NOT order_enabled
    ) OR (
      bound_provider_settlement_processor_code IS NOT NULL
      AND bound_provider_settlement_account_sha256 IS NOT NULL
      AND bound_provider_settlement_environment IS NOT NULL
      AND bound_provider_settlement_source_sha256 IS NOT NULL
      AND bound_provider_settlement_adapter_version_sha256 IS NOT NULL
      AND (
        (provider_sandbox_traffic_enabled
          AND bound_provider_settlement_environment = 'test')
        OR (provider_live_traffic_enabled
          AND bound_provider_settlement_environment = 'live')
        OR (
          execution_kill_switch_engaged
          AND NOT synthetic_execution_enabled
          AND NOT provider_sandbox_traffic_enabled
          AND NOT provider_live_traffic_enabled
          AND NOT shopping_enabled
          AND NOT order_enabled
          AND NOT payment_enabled
          AND NOT ticketing_enabled
          AND NOT servicing_enabled
          AND NOT provider_events_enabled
          AND NOT production_release_enabled
        )
      )
    )
  );
CREATE TABLE public.flight_provider_request_attempts (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  tenant_id text NOT NULL,
  commerce_id text NOT NULL,
  operation text NOT NULL,
  execution_mode text NOT NULL,
  request_sha256 text NOT NULL,
  dispatch_not_after timestamp with time zone NOT NULL,
  state text DEFAULT 'prepared'::text NOT NULL,
  revision integer DEFAULT 0 NOT NULL,
  retry_authorized boolean DEFAULT false NOT NULL,
  terminal_receipt_sha256 text
);
CREATE TABLE public.flight_offers (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  execution_mode text NOT NULL,
  provider_offer_ref_ciphertext text,
  provider_offer_ref_sha256 text
);
CREATE TABLE public.flight_orders (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  execution_mode text NOT NULL,
  provider_order_ref_ciphertext text,
  provider_order_ref_sha256 text
);
CREATE TABLE public.flight_passenger_refs (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  provider_passenger_ref_ciphertext text,
  provider_passenger_ref_sha256 text
);
CREATE TABLE public.flight_ticket_documents (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  order_id uuid NOT NULL,
  status text NOT NULL,
  document_ref_ciphertext text,
  document_ref_sha256 text
);
CREATE TABLE public.flight_payments (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  processor_reference_ciphertext text NOT NULL,
  processor_reference_sha256 text NOT NULL
);
CREATE TABLE public.flight_offer_evidence_vault (
  id uuid DEFAULT gen_random_uuid() NOT NULL
);
CREATE TABLE public.flight_secure_pii_records (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  secure_pii_record_ref text NOT NULL
);
CREATE TABLE public.flight_payment_operation_attempts (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  order_id uuid NOT NULL,
  operation text NOT NULL,
  execution_mode text NOT NULL,
  dispatch_not_after timestamp with time zone NOT NULL,
  state text DEFAULT 'prepared'::text NOT NULL,
  revision integer DEFAULT 0 NOT NULL,
  processor_object_ref_ciphertext text,
  processor_object_ref_sha256 text
);
CREATE TABLE public.flight_order_response_evidence_vault (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  ciphertext_base64url text NOT NULL,
  evidence_receipt_sha256 text NOT NULL
);
CREATE TABLE public.flight_consumer_webhook_ledger (
  id uuid DEFAULT gen_random_uuid() NOT NULL
);
CREATE TABLE public.flight_payment_state_observations (
  id uuid DEFAULT gen_random_uuid() NOT NULL
);
CREATE TABLE public.flight_payment_refund_evidence (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  refund_reference_ciphertext text NOT NULL
);
CREATE TABLE public.flight_order_recovery_evidence_vault (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  ledger_id uuid NOT NULL,
  recovery_evidence_receipt_sha256 text NOT NULL,
  ciphertext_base64url text NOT NULL
);
CREATE TABLE public.flight_consumer_notification_outbox_receipts (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  email_outbox_id uuid NOT NULL,
  trusted_evidence_receipt_sha256 text NOT NULL
);
CREATE TABLE public.flight_reconciliation_cases (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  resolution_actor_type text DEFAULT 'administrator'::text NOT NULL,
  system_resolution_receipt_sha256 text
);
CREATE TABLE public.flight_service_requests (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  order_id uuid NOT NULL,
  requested_by uuid NOT NULL,
  request_type text NOT NULL,
  reason_code text NOT NULL,
  request_sha256 text NOT NULL,
  status text DEFAULT 'requested'::text NOT NULL,
  provider_case_ref_ciphertext text,
  provider_case_ref_sha256 text
);
CREATE TABLE public.flight_consumer_duffel_webhook_pending_links (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  ledger_id uuid NOT NULL,
  order_id uuid NOT NULL,
  customer_id uuid NOT NULL,
  payment_id uuid NOT NULL,
  provider_attempt_id uuid NOT NULL,
  execution_mode text DEFAULT 'test'::text NOT NULL,
  execution_scope_sha256 text NOT NULL,
  provider_offer_ref_sha256 text NOT NULL,
  provider_order_ref_sha256 text NOT NULL,
  association_receipt_sha256 text NOT NULL,
  created_at timestamp with time zone DEFAULT clock_timestamp() NOT NULL
);
CREATE TABLE public.flight_consumer_duffel_webhook_pending_link_resolutions (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  pending_link_id uuid NOT NULL,
  ledger_id uuid NOT NULL,
  outcome text NOT NULL,
  attempt_terminal_state text NOT NULL,
  attempt_terminal_revision integer NOT NULL,
  attempt_terminal_receipt_sha256 text NOT NULL,
  resolution_receipt_sha256 text NOT NULL,
  created_at timestamp with time zone DEFAULT clock_timestamp() NOT NULL
);
CREATE TABLE public.flight_consumer_completion_leases (
  order_id uuid NOT NULL,
  customer_id uuid NOT NULL,
  execution_mode text DEFAULT 'test'::text NOT NULL,
  execution_scope_sha256 text NOT NULL,
  idempotency_key_sha256 text NOT NULL,
  request_sha256 text NOT NULL,
  lease_state text NOT NULL,
  lease_revision integer DEFAULT 0 NOT NULL,
  lease_token_sha256 text,
  completed_owner_token_sha256 text,
  lease_acquired_at timestamp with time zone,
  lease_expires_at timestamp with time zone,
  heartbeat_at timestamp with time zone,
  processing_attempt_count integer DEFAULT 1 NOT NULL,
  outcome_sha256 text,
  result_order_status text,
  result_issued_ticket_count integer,
  last_failure_sha256 text,
  completed_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
  updated_at timestamp with time zone DEFAULT clock_timestamp() NOT NULL
);
ALTER TABLE ONLY public.flight_offers
  ADD CONSTRAINT flight_offers_provider_offer_ref_ciphertext_check CHECK (
    provider_offer_ref_ciphertext ~ '^enc:v[1-9][0-9]*:[A-Za-z0-9_-]+$'
    AND char_length(split_part(provider_offer_ref_ciphertext, ':', 3))
      BETWEEN 16 AND 8176
  );
ALTER TABLE ONLY public.flight_orders
  ADD CONSTRAINT flight_orders_provider_order_ref_ciphertext_check CHECK (
    provider_order_ref_ciphertext ~ '^enc:v[1-9][0-9]*:[A-Za-z0-9_-]+$'
    AND char_length(split_part(provider_order_ref_ciphertext, ':', 3))
      BETWEEN 16 AND 8176
  );
ALTER TABLE ONLY public.flight_passenger_refs
  ADD CONSTRAINT flight_passenger_refs_provider_ref_ciphertext_check CHECK (
    provider_passenger_ref_ciphertext ~ '^enc:v[1-9][0-9]*:[A-Za-z0-9_-]+$'
    AND char_length(split_part(provider_passenger_ref_ciphertext, ':', 3))
      BETWEEN 16 AND 4080
  );
ALTER TABLE ONLY public.flight_ticket_documents
  ADD CONSTRAINT flight_ticket_documents_document_ref_ciphertext_check CHECK (
    document_ref_ciphertext ~ '^enc:v[1-9][0-9]*:[A-Za-z0-9_-]+$'
    AND char_length(split_part(document_ref_ciphertext, ':', 3))
      BETWEEN 16 AND 4080
  );
ALTER TABLE ONLY public.flight_ticket_documents
  ADD CONSTRAINT flight_ticket_documents_order_id_document_ref_sha256_key
  UNIQUE (order_id, document_ref_sha256);
ALTER TABLE ONLY public.flight_payments
  ADD CONSTRAINT flight_payments_processor_reference_ciphertext_check CHECK (
    processor_reference_ciphertext ~ '^enc:v[1-9][0-9]*:[A-Za-z0-9_-]+$'
    AND char_length(split_part(processor_reference_ciphertext, ':', 3))
      BETWEEN 16 AND 4080
  );
ALTER TABLE ONLY public.flight_service_requests
  ADD CONSTRAINT flight_service_requests_provider_case_ref_ciphertext_check CHECK (
    provider_case_ref_ciphertext ~ '^enc:v[1-9][0-9]*:[A-Za-z0-9_-]+$'
    AND char_length(split_part(provider_case_ref_ciphertext, ':', 3))
      BETWEEN 16 AND 4080
  );
ALTER TABLE ONLY public.flight_payment_operation_attempts
  ADD CONSTRAINT flight_payment_operation_attempts_processor_ref_check CHECK (
    processor_object_ref_ciphertext ~ '^enc:v[1-9][0-9]*:[A-Za-z0-9_-]+$'
    AND char_length(split_part(processor_object_ref_ciphertext, ':', 3))
      BETWEEN 16 AND 4080
  );
ALTER TABLE ONLY public.flight_payment_refund_evidence
  ADD CONSTRAINT flight_payment_refund_evidence_reference_check CHECK (
    refund_reference_ciphertext ~ '^enc:v[1-9][0-9]*:[A-Za-z0-9_-]+$'
    AND char_length(split_part(refund_reference_ciphertext, ':', 3))
      BETWEEN 16 AND 4080
  );
CREATE FUNCTION public.flight_runtime_capability_enabled(
  p_execution_mode text,
  p_capability text,
  p_provider_code text DEFAULT NULL::text,
  p_processor_code text DEFAULT NULL::text,
  p_execution_scope_sha256 text DEFAULT NULL::text
) RETURNS boolean
  LANGUAGE plpgsql AS $$ BEGIN RETURN false; END $$;
CREATE FUNCTION public.prepare_flight_provider_request_attempt(
  p_tenant_id text, p_commerce_id text, p_operation text, p_provider_code text,
  p_execution_mode text, p_execution_scope_sha256 text, p_activation_evidence_sha256 text,
  p_adapter_version_sha256 text, p_adapter_source_sha256 text, p_provider_account_sha256 text,
  p_point_of_sale_sha256 text, p_content_scope_sha256 text,
  p_provider_binding_receipt_sha256 text, p_request_plan_sha256 text,
  p_request_sha256 text, p_request_body_sha256 text,
  p_operation_authority_receipt_sha256 text, p_dispatch_not_after timestamp with time zone
) RETURNS TABLE(attempt_id uuid, attempt_revision integer, attempt_state text)
  LANGUAGE plpgsql AS $$ BEGIN RETURN NULL; END $$;
CREATE FUNCTION public.claim_flight_provider_request_attempt_for_dispatch(
  p_attempt_id uuid, p_expected_revision integer
) RETURNS TABLE(attempt_id uuid, attempt_revision integer, attempt_state text)
  LANGUAGE plpgsql AS $$ BEGIN END $$;
CREATE FUNCTION public.complete_flight_provider_request_attempt(
  p_attempt_id uuid, p_expected_revision integer, p_terminal_state text,
  p_terminal_http_status smallint, p_terminal_response_sha256 text,
  p_terminal_response_bytes bigint, p_terminal_receipt_sha256 text
) RETURNS TABLE(attempt_id uuid, attempt_revision integer, attempt_state text)
  LANGUAGE plpgsql AS $$ BEGIN END $$;
CREATE FUNCTION public.prepare_flight_provider_order_attempt(
  p_tenant_id text, p_commerce_id text, p_provider_code text,
  p_execution_scope_sha256 text, p_activation_evidence_sha256 text,
  p_adapter_version_sha256 text, p_adapter_source_sha256 text,
  p_provider_account_sha256 text, p_point_of_sale_sha256 text,
  p_content_scope_sha256 text, p_provider_binding_receipt_sha256 text,
  p_request_plan_sha256 text, p_request_sha256 text, p_request_body_sha256 text,
  p_operation_authority_receipt_sha256 text, p_dispatch_not_after timestamp with time zone
) RETURNS TABLE(attempt_id uuid, attempt_revision integer, attempt_state text)
  LANGUAGE plpgsql AS $$ BEGIN END $$;
CREATE FUNCTION public.claim_flight_provider_order_attempt_for_dispatch(
  p_attempt_id uuid, p_expected_revision integer
) RETURNS TABLE(attempt_id uuid, attempt_revision integer, attempt_state text)
  LANGUAGE plpgsql AS $$ BEGIN END $$;
CREATE FUNCTION public.prepare_flight_provider_attempt_rpc(
  p_tenant_id text, p_commerce_id text, p_operation text, p_provider_code text,
  p_execution_mode text, p_execution_scope_sha256 text, p_activation_evidence_sha256 text,
  p_adapter_version_sha256 text, p_adapter_source_sha256 text, p_provider_account_sha256 text,
  p_point_of_sale_sha256 text, p_content_scope_sha256 text,
  p_provider_binding_receipt_sha256 text, p_request_plan_sha256 text,
  p_request_sha256 text, p_request_body_sha256 text,
  p_operation_authority_receipt_sha256 text, p_dispatch_not_after timestamp with time zone
) RETURNS TABLE(attempt_id uuid, attempt_revision integer, attempt_state text)
  LANGUAGE plpgsql AS $$ BEGIN END $$;
CREATE FUNCTION public.claim_flight_provider_attempt_rpc(
  p_attempt_id uuid, p_expected_revision integer, p_operation text,
  p_adapter_source_sha256 text, p_provider_binding_receipt_sha256 text,
  p_operation_authority_receipt_sha256 text
) RETURNS TABLE(attempt_id uuid, attempt_revision integer, attempt_state text)
  LANGUAGE plpgsql AS $$
  BEGIN
    IF p_operation = 'create_order' THEN
      RETURN QUERY SELECT * FROM public.claim_flight_provider_order_attempt_for_dispatch(
        p_attempt_id, p_expected_revision
      );
    ELSE
      RETURN QUERY SELECT * FROM public.claim_flight_provider_request_attempt_for_dispatch(
        p_attempt_id, p_expected_revision
      );
    END IF;
  END $$;
CREATE FUNCTION public.complete_flight_consumer_payment_intent_v1(
  p_attempt_id uuid, p_expected_revision integer, p_terminal_state text,
  p_terminal_http_status smallint, p_terminal_response_sha256 text,
  p_terminal_response_bytes bigint, p_terminal_receipt_sha256 text,
  p_provider_payment_intent_id text, p_payment_status text
) RETURNS TABLE(
  decision text, attempt_id uuid, attempt_revision integer,
  attempt_state text, payment_id uuid, payment_status text
)
  LANGUAGE plpgsql AS $$ BEGIN END $$;
CREATE FUNCTION public.ensure_flight_consumer_capture_review_case_092(
  p_attempt_id uuid
) RETURNS uuid
  LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO public.flight_reconciliation_cases (id) VALUES (gen_random_uuid());
  RETURN gen_random_uuid();
END $$;
CREATE FUNCTION public.complete_flight_consumer_payment_operation_v1(
  p_attempt_id uuid, p_expected_revision integer, p_terminal_state text,
  p_terminal_http_status smallint, p_terminal_response_sha256 text,
  p_terminal_response_bytes bigint, p_terminal_receipt_sha256 text
) RETURNS TABLE(attempt_id uuid, attempt_revision integer, attempt_state text)
  LANGUAGE plpgsql AS $$
BEGIN
  PERFORM public.ensure_flight_consumer_capture_review_case_092(p_attempt_id);
END $$;
CREATE FUNCTION public.claim_flight_consumer_duffel_order_attempt_pre092_v1(
  p_attempt_id uuid, p_expected_revision integer,
  p_adapter_source_sha256 text, p_provider_binding_receipt_sha256 text,
  p_payment_binding_receipt_sha256 text,
  p_provider_settlement_binding_receipt_sha256 text,
  p_operation_authority_receipt_sha256 text
) RETURNS TABLE(attempt_id uuid, attempt_revision integer, attempt_state text)
  LANGUAGE plpgsql AS $private_duffel_claim$
#variable_conflict error
DECLARE
  v_now timestamptz := clock_timestamp();
  v_order record;
BEGIN
  PERFORM 1
    FROM public.flight_offer_evidence_vault AS evidence
   WHERE evidence.retention_expires_at > v_now
     AND evidence.reprice_receipt_id = v_order.reprice_receipt_id
     AND evidence.stage = 'refreshed'
   FOR SHARE;
END
$private_duffel_claim$;
CREATE FUNCTION public.claim_flight_consumer_duffel_order_attempt_v1(
  p_attempt_id uuid, p_expected_revision integer,
  p_adapter_source_sha256 text, p_provider_binding_receipt_sha256 text,
  p_payment_binding_receipt_sha256 text,
  p_provider_settlement_binding_receipt_sha256 text,
  p_operation_authority_receipt_sha256 text
) RETURNS TABLE(attempt_id uuid, attempt_revision integer, attempt_state text)
  LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.flight_reconciliation_cases AS reconciliation
     WHERE reconciliation.status <> 'resolved'
  ) THEN
    RAISE EXCEPTION 'Active Flight reconciliation blocks Duffel dispatch';
  END IF;
  RETURN QUERY
  SELECT * FROM public.claim_flight_consumer_duffel_order_attempt_pre092_v1(
    p_attempt_id, p_expected_revision, p_adapter_source_sha256,
    p_provider_binding_receipt_sha256, p_payment_binding_receipt_sha256,
    p_provider_settlement_binding_receipt_sha256,
    p_operation_authority_receipt_sha256
  );
END $$;
CREATE FUNCTION public.get_flight_consumer_duffel_order_recovery_v1(
  p_customer_id uuid, p_order_id uuid
) RETURNS TABLE(
  attempt_id uuid, customer_id uuid, order_id uuid, attempt_revision integer,
  attempt_state text, request_sha256 text, operation_authority_receipt_sha256 text,
  terminal_http_status smallint, terminal_response_sha256 text,
  terminal_response_bytes bigint, terminal_receipt_sha256 text,
  dispatch_not_after timestamp with time zone, evidence_available boolean,
  response_evidence_receipt_sha256 text,
  response_evidence_retention_expires_at timestamp with time zone
)
  LANGUAGE plpgsql AS $$
DECLARE
  v_attempt record;
  v_evidence_available boolean;
BEGIN
  IF v_attempt.state IN ('prepared', 'dispatching') THEN
    PERFORM 1;
  END IF;
  PERFORM v_evidence_available;
END $$;
CREATE FUNCTION public.load_flight_offer_evidence_v1(
  p_receipt_sha256 text, p_customer_id uuid, p_execution_scope_sha256 text
) RETURNS TABLE(
  evidence_id uuid, customer_id uuid, search_id uuid, offer_id uuid,
  stage text, predecessor_receipt_sha256 text,
  observed_at timestamp with time zone,
  retention_expires_at timestamp with time zone,
  raw_body_sha256 text, evidence_sha256 text, snapshot_sha256 text,
  record_sha256 text, receipt_sha256 text, key_version text,
  iv_base64url text, auth_tag_base64url text, ciphertext_base64url text,
  aad_sha256 text, record_hmac_sha256 text
)
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = pg_catalog, public
  AS $offer_evidence_loader$ BEGIN
    PERFORM evidence.ciphertext_base64url
      FROM public.flight_offer_evidence_vault AS evidence;
  END $offer_evidence_loader$;
ALTER FUNCTION public.load_flight_offer_evidence_v1(text, uuid, text)
  OWNER TO postgres;
CREATE FUNCTION public.load_flight_secure_pii_record_v1(
  p_secure_pii_record_ref text, p_customer_id uuid,
  p_execution_scope_sha256 text
) RETURNS TABLE(
  secure_pii_record_ref text, customer_id uuid, order_id uuid,
  execution_scope_sha256 text, traveler_type text, pii_record_sha256 text,
  pii_authority_receipt_sha256 text,
  retention_expires_at timestamp with time zone,
  key_version text, iv_base64url text, auth_tag_base64url text,
  ciphertext_base64url text, aad_sha256 text, pii_hmac_sha256 text
)
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = pg_catalog, public
  AS $secure_pii_loader$ BEGIN
    PERFORM pii.ciphertext_base64url
      FROM public.flight_secure_pii_records AS pii;
  END $secure_pii_loader$;
ALTER FUNCTION public.load_flight_secure_pii_record_v1(text, uuid, text)
  OWNER TO postgres;
CREATE FUNCTION public.load_flight_consumer_order_response_evidence_v1(
  p_customer_id uuid, p_order_id uuid, p_attempt_id uuid,
  p_evidence_receipt_sha256 text
) RETURNS TABLE(
  evidence_id uuid, attempt_id uuid, order_id uuid, customer_id uuid,
  execution_scope_sha256 text, provider_response_sha256 text,
  evidence_receipt_sha256 text, key_version text, iv_base64url text,
  auth_tag_base64url text, ciphertext_base64url text, aad_sha256 text,
  ciphertext_sha256 text, retention_expires_at timestamp with time zone
)
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = pg_catalog, public
  AS $order_response_loader$ BEGIN
    PERFORM evidence.ciphertext_base64url
      FROM public.flight_order_response_evidence_vault AS evidence;
  END $order_response_loader$;
ALTER FUNCTION public.load_flight_consumer_order_response_evidence_v1(
  uuid, uuid, uuid, text
) OWNER TO postgres;
CREATE FUNCTION public.load_flight_consumer_duffel_order_recovery_evidence_v1(
  p_customer_id uuid, p_order_id uuid, p_ledger_id uuid,
  p_recovery_evidence_receipt_sha256 text
) RETURNS TABLE(
  evidence_id uuid, ledger_id uuid, attempt_id uuid, order_id uuid,
  customer_id uuid, execution_scope_sha256 text,
  provider_offer_ref_sha256 text, provider_order_ref_sha256 text,
  recovery_request_sha256 text, provider_response_sha256 text,
  webhook_verification_receipt_sha256 text,
  recovery_authority_receipt_sha256 text,
  recovery_evidence_receipt_sha256 text, key_version text,
  iv_base64url text, auth_tag_base64url text, ciphertext_base64url text,
  aad_sha256 text, ciphertext_sha256 text,
  retention_expires_at timestamp with time zone
)
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = pg_catalog, public
  AS $order_recovery_loader$ BEGIN
    PERFORM evidence.ciphertext_base64url
      FROM public.flight_order_recovery_evidence_vault AS evidence;
  END $order_recovery_loader$;
ALTER FUNCTION public.load_flight_consumer_duffel_order_recovery_evidence_v1(
  uuid, uuid, uuid, text
) OWNER TO postgres;
CREATE FUNCTION public.load_flight_offer_evidence_for_terminal_recovery_v1(
  p_attempt_id uuid, p_order_id uuid, p_customer_id uuid,
  p_execution_scope_sha256 text, p_receipt_sha256 text
) RETURNS TABLE(
  evidence_id uuid, customer_id uuid, search_id uuid, offer_id uuid,
  stage text, predecessor_receipt_sha256 text,
  observed_at timestamp with time zone,
  retention_expires_at timestamp with time zone,
  raw_body_sha256 text, evidence_sha256 text, snapshot_sha256 text,
  record_sha256 text, receipt_sha256 text, key_version text,
  iv_base64url text, auth_tag_base64url text, ciphertext_base64url text,
  aad_sha256 text, record_hmac_sha256 text
)
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = pg_catalog, public, extensions
  AS $terminal_offer_evidence$${terminalOfferEvidenceLoaderBody}$terminal_offer_evidence$;
ALTER FUNCTION public.load_flight_offer_evidence_for_terminal_recovery_v1(
  uuid, uuid, uuid, text, text
) OWNER TO postgres;
CREATE FUNCTION public.get_flight_offer_local_identity_for_terminal_recovery_v1(
  p_attempt_id uuid, p_order_id uuid, p_customer_id uuid,
  p_execution_scope_sha256 text, p_receipt_sha256 text
) RETURNS TABLE(local_offer_id text)
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = pg_catalog, public, extensions
  AS $terminal_offer_local_identity$${terminalOfferLocalIdentityBody}$terminal_offer_local_identity$;
ALTER FUNCTION public.get_flight_offer_local_identity_for_terminal_recovery_v1(
  uuid, uuid, uuid, text, text
) OWNER TO postgres;
CREATE FUNCTION public.get_flight_consumer_duffel_recovery_evidence_observation_v1(
  p_customer_id uuid, p_order_id uuid, p_ledger_id uuid,
  p_recovery_evidence_receipt_sha256 text
) RETURNS TABLE(created_at timestamp with time zone)
  LANGUAGE plpgsql AS $recovery_evidence_observation$
#variable_conflict error
DECLARE
  v_now timestamptz := clock_timestamp();
  v_ledger record;
  v_attempt record;
  v_evidence record;
BEGIN
  IF coalesce(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'service role required';
  END IF;
  IF v_ledger.state <> 'processed' OR v_ledger.revision <> 2
    OR v_attempt.state <> 'succeeded' OR v_attempt.revision <> 2
    OR v_evidence.deleted_at IS NOT NULL
    OR v_evidence.retention_expires_at <= v_now THEN
    RAISE EXCEPTION 'unavailable';
  END IF;
  RETURN QUERY SELECT v_evidence.created_at;
END
$recovery_evidence_observation$;
CREATE FUNCTION public.finalize_flight_consumer_duffel_order_v1(
  p_attempt_id uuid, p_expected_revision integer, p_provider_order_id text,
  p_booking_reference text, p_terminal_receipt_sha256 text,
  p_ticketing_deadline timestamp with time zone,
  p_retention_expires_at timestamp with time zone,
  p_slices jsonb, p_passengers jsonb
) RETURNS TABLE(order_id uuid, order_status text, issued_ticket_count integer)
  LANGUAGE plpgsql AS $$ BEGIN END $$;
CREATE FUNCTION public.complete_flight_consumer_duffel_recovery_evidence_v1(
  p_customer_id uuid, p_order_id uuid, p_ledger_id uuid, p_attempt_id uuid,
  p_expected_revision integer, p_lease_token_sha256 text, p_outcome_sha256 text,
  p_recovery_request_sha256 text, p_recovery_authority_receipt_sha256 text,
  p_provider_order_ref_sha256 text, p_provider_response_sha256 text,
  p_key_version text, p_iv_base64url text, p_auth_tag_base64url text,
  p_ciphertext_base64url text, p_aad_sha256 text, p_ciphertext_sha256 text,
  p_recovery_evidence_receipt_sha256 text,
  p_retention_expires_at timestamp with time zone
) RETURNS TABLE(
  ledger_id uuid, ledger_revision integer, ledger_state text, evidence_id uuid,
  recovery_evidence_receipt_sha256 text,
  retention_expires_at timestamp with time zone
)
  LANGUAGE plpgsql AS $$ BEGIN END $$;
CREATE FUNCTION public.get_flight_consumer_async_duffel_convergence_v1(
  p_customer_id uuid, p_order_id uuid, p_ledger_id uuid
) RETURNS TABLE(
  order_id uuid, customer_id uuid, order_status text,
  execution_scope_sha256 text, provider_attempt_id uuid,
  provider_attempt_state text, provider_attempt_revision integer,
  ledger_id uuid, ledger_state text, ledger_revision integer,
  provider_offer_ref_sha256 text, provider_order_ref_sha256 text,
  recovery_evidence_receipt_sha256 text,
  recovery_retention_expires_at timestamp with time zone,
  reconciliation_case_id uuid, reconciliation_case_status text,
  reconciliation_resolution_code text,
  reconciliation_resolution_actor_type text,
  reconciliation_system_receipt_sha256 text,
  reconciliation_updated_at timestamp with time zone,
  issued_ticket_count integer
)
  LANGUAGE plpgsql AS $$ BEGIN END $$;
CREATE FUNCTION public.validate_flight_consumer_async_order_finalization_v1()
RETURNS trigger
  LANGUAGE plpgsql AS $$
DECLARE
  v_attempt record;
  v_ledger record;
BEGIN
  PERFORM 1 FROM public.flight_offer_evidence_vault AS evidence
   WHERE evidence.observed_at <= v_attempt.dispatch_started_at
     AND v_attempt.dispatch_started_at < evidence.retention_expires_at
     AND clock_timestamp() <= v_attempt.dispatch_started_at + interval '7 days';
  PERFORM 1 FROM public.flight_order_recovery_evidence_vault AS evidence
   WHERE evidence.provider_offer_ref_sha256 = v_ledger.provider_offer_ref_sha256
     AND evidence.deleted_at IS NULL
     AND evidence.retention_expires_at > clock_timestamp();
  IF new.provider_order_ref_ciphertext IS NULL OR (
    new.provider_order_ref_ciphertext
      !~ '^enc:v[1-9][0-9]*:[A-Za-z0-9_-]+$'
    OR char_length(split_part(new.provider_order_ref_ciphertext, ':', 3))
      NOT BETWEEN 16 AND 8176
  ) THEN
    RAISE EXCEPTION 'Flight async provider-order binding is invalid';
  END IF;
  RETURN new;
END $$;
CREATE FUNCTION public.finalize_flight_consumer_async_duffel_order_v1(
  p_customer_id uuid, p_order_id uuid, p_ledger_id uuid,
  p_recovery_evidence_receipt_sha256 text,
  p_provider_order_ref_ciphertext text, p_provider_order_ref_sha256 text,
  p_provider_created_at timestamp with time zone,
  p_ticketing_deadline_at timestamp with time zone,
  p_passenger_bindings jsonb, p_ticket_documents jsonb
) RETURNS TABLE(
  order_id uuid, order_status text, issued_ticket_count integer,
  reconciliation_case_id uuid
)
  LANGUAGE plpgsql AS $$
DECLARE
  v_binding jsonb;
  v_document jsonb;
  v_attempt record;
  v_offer_evidence record;
  v_recovery record;
BEGIN
  IF v_attempt.dispatch_started_at < v_offer_evidence.observed_at
    OR v_attempt.dispatch_started_at >= v_offer_evidence.retention_expires_at
    OR clock_timestamp() > v_attempt.dispatch_started_at + interval '7 days'
    OR v_recovery.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'Flight async evidence is unavailable';
  END IF;
  IF p_provider_order_ref_ciphertext IS NULL OR (
    p_provider_order_ref_ciphertext
      !~ '^enc:v[1-9][0-9]*:[A-Za-z0-9_-]+$'
    OR char_length(split_part(p_provider_order_ref_ciphertext, ':', 3))
      NOT BETWEEN 16 AND 8176
  ) THEN
    RAISE EXCEPTION 'Flight async Duffel finalization envelope is invalid';
  END IF;
  FOR v_binding IN SELECT value FROM jsonb_array_elements(p_passenger_bindings)
  LOOP
    IF (
      coalesce(v_binding ->> 'provider_passenger_ref_ciphertext', '')
        !~ '^enc:v[1-9][0-9]*:[A-Za-z0-9_-]+$'
      OR char_length(split_part(coalesce(
        v_binding ->> 'provider_passenger_ref_ciphertext', ''
      ), ':', 3)) NOT BETWEEN 16 AND 4080
    ) THEN
      RAISE EXCEPTION 'Flight async passenger binding is invalid';
    END IF;
  END LOOP;
  FOR v_document IN SELECT value FROM jsonb_array_elements(p_ticket_documents)
  LOOP
    IF (
      coalesce(v_document ->> 'document_ref_ciphertext', '')
        !~ '^enc:v[1-9][0-9]*:[A-Za-z0-9_-]+$'
      OR char_length(split_part(coalesce(
        v_document ->> 'document_ref_ciphertext', ''
      ), ':', 3)) NOT BETWEEN 16 AND 4080
    ) THEN
      RAISE EXCEPTION 'Flight async ticket document is invalid';
    END IF;
  END LOOP;
END $$;
CREATE FUNCTION public.queue_flight_consumer_notification_v1(
  p_customer_id uuid, p_order_id uuid, p_event_type text,
  p_event_receipt_id uuid, p_lifecycle_evidence_sha256 text,
  p_trusted_evidence_receipt_sha256 text, p_template_name text,
  p_dedupe_key text, p_subject text, p_message text, p_action_url text
) RETURNS TABLE(decision text, email_outbox_id uuid)
  LANGUAGE plpgsql AS $$ BEGIN END $$;
CREATE FUNCTION public.create_flight_consumer_preview_service_request_v1(
  p_order_id uuid, p_request_type text, p_reason_code text,
  p_idempotency_key_sha256 text
) RETURNS TABLE(
  decision text, service_request_id uuid, order_id uuid, request_type text,
  reason_code text, request_status text, created_at timestamp with time zone,
  updated_at timestamp with time zone
)
  LANGUAGE plpgsql AS $$ BEGIN END $$;
CREATE FUNCTION public.get_flight_consumer_preview_activation_preflight_v1(
  p_stripe_account_id text
) RETURNS TABLE(
  version text, ready boolean, control_key text,
  expected_updated_at timestamp with time zone,
  expected_execution_scope_sha256 text,
  expected_activation_evidence_sha256 text,
  expected_runtime_control_receipt_sha256 text,
  target_execution_scope_sha256 text,
  activation_manifest_sha256 text
)
  LANGUAGE plpgsql AS $$ BEGIN END $$;
CREATE FUNCTION public.complete_flight_consumer_search_v1(
  p_attempt_id uuid, p_expected_terminal_revision integer,
  p_normalized_offers jsonb
) RETURNS TABLE(
  decision text, search_id uuid, search_status text,
  offer_count integer, offer_ids uuid[]
)
  LANGUAGE plpgsql AS $$
#variable_conflict error
DECLARE
  v_offer_json jsonb;
  v_offer_id uuid;
BEGIN
  v_offer_id := (v_offer_json ->> 'offer_id')::uuid;
  IF coalesce(v_offer_json ->> 'local_offer_id', '')
    !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$' THEN
    RAISE EXCEPTION 'Flight local offer identity is malformed';
  END IF;
END $$;
CREATE FUNCTION public.fail_flight_consumer_search_v1(
  p_attempt_id uuid, p_expected_terminal_revision integer
) RETURNS TABLE(search_id uuid, search_status text)
  LANGUAGE plpgsql AS $$
#variable_conflict error
DECLARE
  v_search record;
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.flight_offers AS offer
     WHERE offer.search_id = v_search.id
  ) THEN
    RAISE EXCEPTION 'offer materialized';
  END IF;
END $$;
CREATE FUNCTION public.complete_flight_consumer_reprice_v1(
  p_attempt_id uuid, p_expected_terminal_revision integer,
  p_reprice_request_sha256 text, p_reprice_response_sha256 text,
  p_status text, p_currency text, p_original_total_cents bigint,
  p_repriced_total_cents bigint, p_expires_at timestamp with time zone,
  p_refreshed_evidence jsonb
) RETURNS TABLE(
  decision text, reprice_receipt_id uuid, reprice_status text,
  acceptance_required boolean, evidence_receipt_sha256 text
)
  LANGUAGE plpgsql AS $$
DECLARE
  v_predecessor record;
BEGIN
  IF NOT public.flight_jsonb_has_exact_keys_v1(p_refreshed_evidence, ARRAY[
    'stage', 'predecessor_receipt_sha256', 'observed_at', 'retention_expires_at',
    'raw_body_sha256', 'evidence_sha256', 'snapshot_sha256', 'record_sha256',
    'receipt_sha256', 'key_version', 'iv_base64url', 'auth_tag_base64url',
    'ciphertext_base64url', 'aad_sha256', 'record_hmac_sha256'
  ]) THEN
    RAISE EXCEPTION 'Refreshed encrypted offer evidence is malformed';
  END IF;
  PERFORM v_predecessor.local_offer_id;
END $$;
CREATE FUNCTION public.fail_flight_consumer_reprice_v1(
  p_attempt_id uuid, p_expected_terminal_revision integer
) RETURNS TABLE(offer_id uuid, terminal_state text, idempotency_status text)
  LANGUAGE plpgsql AS $$
#variable_conflict error
DECLARE
  v_attempt record;
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.flight_reprice_receipts AS reprice
     WHERE reprice.offer_id = v_attempt.offer_id
  ) THEN
    RAISE EXCEPTION 'Flight reprice terminal failure evidence does not match';
  END IF;
  UPDATE public.flight_offers AS offer
     SET status = 'expired'
   WHERE offer.id = v_attempt.offer_id AND offer.status = 'offered';
  RETURN QUERY SELECT v_attempt.offer_id, v_attempt.state, 'failed'::text;
END $$;
CREATE FUNCTION public.activate_flight_consumer_preview_v1(
  p_expected_updated_at timestamp with time zone,
  p_expected_execution_scope_sha256 text,
  p_expected_activation_evidence_sha256 text,
  p_expected_runtime_control_receipt_sha256 text,
  p_stripe_account_id text,
  p_activation_packet_sha256 text,
  p_activation_nonce text
) RETURNS TABLE(
  decision text, control_key text, updated_at timestamp with time zone,
  bound_execution_scope_sha256 text, activation_evidence_sha256 text,
  runtime_control_receipt_sha256 text
)
  LANGUAGE plpgsql AS $$
#variable_conflict error
DECLARE
  v_actor uuid;
  v_080 record;
  v_control public.flight_runtime_controls;
  v_manifest_sha256 text;
  v_activation_evidence_sha256 text;
  v_runtime_control_receipt_sha256 text;
BEGIN
  UPDATE public.flight_runtime_controls AS runtime_control
     SET activation_evidence_sha256 = v_activation_evidence_sha256,
         updated_by = v_actor
   WHERE runtime_control.control_key = v_080.control_key
     AND runtime_control.updated_at = v_080.updated_at
     AND runtime_control.bound_execution_scope_sha256 = v_080.bound_execution_scope_sha256
     AND runtime_control.activation_evidence_sha256 = v_080.activation_evidence_sha256
     AND runtime_control.execution_kill_switch_engaged = false
     AND runtime_control.provider_sandbox_traffic_enabled = true
     AND runtime_control.provider_live_traffic_enabled = false
     AND runtime_control.production_release_enabled = false
  RETURNING runtime_control.* INTO v_control;
END $$;
CREATE FUNCTION public.enqueue_flight_consumer_duffel_pending_webhook_link_v1(
  p_ledger_id uuid, p_expected_ledger_revision integer,
  p_provider_order_ref_sha256 text, p_provider_offer_ref_sha256 text
) RETURNS TABLE(
  pending_link_id uuid, pending_revision integer, pending_state text
)
  LANGUAGE plpgsql AS $$ BEGIN END $$;
CREATE FUNCTION public.resolve_flight_consumer_duffel_pending_webhook_link_v1(
  p_pending_link_id uuid, p_expected_pending_revision integer
) RETURNS TABLE(
  pending_link_id uuid, pending_revision integer, pending_state text,
  order_id uuid, customer_id uuid, provider_attempt_id uuid,
  order_status text, execution_scope_sha256 text
)
  LANGUAGE plpgsql AS $$ BEGIN END $$;
CREATE FUNCTION public.resolve_flight_consumer_duffel_pending_links_for_attempt_v1(
  p_attempt_id uuid, p_expected_terminal_revision integer,
  p_max_links integer DEFAULT 8
) RETURNS TABLE(
  pending_link_id uuid, pending_revision integer, pending_state text,
  order_id uuid, customer_id uuid, provider_attempt_id uuid,
  order_status text, execution_scope_sha256 text
)
  LANGUAGE plpgsql AS $$ BEGIN END $$;
CREATE FUNCTION public.acquire_flight_consumer_completion_lease_v1(
  p_customer_id uuid, p_order_id uuid, p_idempotency_key_sha256 text,
  p_request_sha256 text, p_execution_scope_sha256 text,
  p_lease_token_sha256 text, p_lease_duration_seconds integer
) RETURNS TABLE(
  decision text, lease_revision integer, lease_state text,
  lease_token_sha256 text, lease_expires_at timestamp with time zone,
  order_status text, issued_ticket_count integer, provider_attempt_state text,
  provider_attempt_revision integer, payment_attempt_state text,
  payment_attempt_revision integer, provider_redispatch_authorized boolean
)
  LANGUAGE plpgsql AS $acquire_completion_lease$
#variable_conflict error
BEGIN
  UPDATE public.flight_consumer_completion_leases AS completion_lease
     SET lease_state = 'completed'
   WHERE completion_lease.order_id = p_order_id
     AND completion_lease.lease_revision = 0;
  UPDATE public.flight_consumer_completion_leases AS completion_lease
     SET lease_state = 'processing'
   WHERE completion_lease.order_id = p_order_id
     AND completion_lease.lease_revision = 0
     AND completion_lease.lease_state = 'released';
END
$acquire_completion_lease$;
CREATE FUNCTION public.heartbeat_flight_consumer_completion_lease_v1(
  p_order_id uuid, p_expected_revision integer,
  p_lease_token_sha256 text, p_lease_duration_seconds integer
) RETURNS TABLE(
  decision text, lease_revision integer, lease_state text,
  lease_expires_at timestamp with time zone, order_status text,
  issued_ticket_count integer
)
  LANGUAGE plpgsql AS $heartbeat_completion_lease$
#variable_conflict error
BEGIN
  UPDATE public.flight_consumer_completion_leases AS completion_lease
     SET heartbeat_at = clock_timestamp()
   WHERE completion_lease.order_id = p_order_id
     AND completion_lease.lease_revision = p_expected_revision
     AND completion_lease.lease_state = 'processing'
     AND completion_lease.lease_token_sha256 = p_lease_token_sha256;
END
$heartbeat_completion_lease$;
CREATE FUNCTION public.complete_flight_consumer_completion_lease_v1(
  p_order_id uuid, p_expected_revision integer, p_lease_token_sha256 text,
  p_outcome_sha256 text, p_issued_ticket_count integer
) RETURNS TABLE(
  decision text, lease_revision integer, lease_state text,
  lease_expires_at timestamp with time zone, order_status text,
  issued_ticket_count integer
)
  LANGUAGE plpgsql AS $complete_completion_lease$
#variable_conflict error
BEGIN
  UPDATE public.flight_consumer_completion_leases AS completion_lease
     SET lease_state = 'completed'
   WHERE completion_lease.order_id = p_order_id
     AND completion_lease.lease_revision = p_expected_revision
     AND completion_lease.lease_state = 'processing'
     AND completion_lease.lease_token_sha256 = p_lease_token_sha256;
END
$complete_completion_lease$;
CREATE FUNCTION public.release_flight_consumer_completion_lease_v1(
  p_order_id uuid, p_expected_revision integer, p_lease_token_sha256 text,
  p_failure_sha256 text
) RETURNS TABLE(
  decision text, lease_revision integer, lease_state text,
  lease_expires_at timestamp with time zone, order_status text,
  issued_ticket_count integer
)
  LANGUAGE plpgsql AS $release_completion_lease$
#variable_conflict error
BEGIN
  UPDATE public.flight_consumer_completion_leases AS completion_lease
     SET lease_state = 'completed'
   WHERE completion_lease.order_id = p_order_id
     AND completion_lease.lease_revision = p_expected_revision;
  UPDATE public.flight_consumer_completion_leases AS completion_lease
     SET lease_state = 'released'
   WHERE completion_lease.order_id = p_order_id
     AND completion_lease.lease_revision = p_expected_revision
     AND completion_lease.lease_state = 'processing'
     AND completion_lease.lease_token_sha256 = p_lease_token_sha256;
END
$release_completion_lease$;
CREATE FUNCTION public.recover_flight_consumer_completion_lease_v1(
  p_customer_id uuid, p_order_id uuid, p_execution_scope_sha256 text,
  p_lease_token_sha256 text, p_lease_duration_seconds integer
) RETURNS TABLE(
  decision text, lease_revision integer, lease_state text,
  lease_token_sha256 text, lease_expires_at timestamp with time zone,
  request_sha256 text, order_status text, issued_ticket_count integer,
  provider_attempt_state text, provider_attempt_revision integer,
  payment_attempt_state text, payment_attempt_revision integer,
  provider_redispatch_authorized boolean
)
  LANGUAGE plpgsql AS $recover_completion_lease$
#variable_conflict error
DECLARE
  v_lease record;
  v_provider record;
  v_capture record;
BEGIN
  IF coalesce(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'service role required';
  END IF;
  IF v_provider.state = 'dispatching' THEN
    PERFORM 1;
  END IF;
  IF v_capture.state = 'dispatching' THEN
    PERFORM 1;
  END IF;
  IF v_lease.lease_state = 'released' THEN
    UPDATE public.flight_consumer_completion_leases AS completion_lease
       SET lease_state = 'processing'
     WHERE completion_lease.order_id = p_order_id;
  END IF;
  IF false THEN
    RETURN QUERY SELECT
      'processing'::text, 1, 'processing'::text, p_lease_token_sha256,
      clock_timestamp(), v_lease.request_sha256, 'processing'::text, NULL::integer,
      v_provider.state, v_provider.revision, v_capture.state, v_capture.revision, false;
    RETURN QUERY SELECT
      'processing'::text, 1, 'processing'::text, p_lease_token_sha256,
      clock_timestamp(), v_lease.request_sha256, 'processing'::text, NULL::integer,
      v_provider.state, v_provider.revision, v_capture.state, v_capture.revision, false;
    RETURN QUERY SELECT
      'processing'::text, 1, 'processing'::text, p_lease_token_sha256,
      clock_timestamp(), v_lease.request_sha256, 'processing'::text, NULL::integer,
      v_provider.state, v_provider.revision, v_capture.state, v_capture.revision, false;
    RETURN QUERY SELECT
      'processing'::text, 1, 'processing'::text, p_lease_token_sha256,
      clock_timestamp(), v_lease.request_sha256, 'processing'::text, NULL::integer,
      v_provider.state, v_provider.revision, v_capture.state, v_capture.revision, false;
  END IF;
  RETURN QUERY SELECT
    'reclaimed'::text, 1, 'processing'::text, p_lease_token_sha256,
    clock_timestamp(), v_lease.request_sha256, 'processing'::text, NULL::integer,
    v_provider.state, v_provider.revision, v_capture.state, v_capture.revision, false;
END
$recover_completion_lease$;
CREATE FUNCTION public.record_flight_consumer_capture_attestation_mismatch_v1(
  p_order_id uuid, p_payment_id uuid, p_capture_attempt_id uuid,
  p_expected_capture_revision integer, p_processor_reference_sha256 text,
  p_mismatch_reason text, p_observation_sha256 text
) RETURNS TABLE(
  order_id uuid, order_status text, payment_id uuid, payment_status text,
  reconciliation_case_id uuid
)
  LANGUAGE plpgsql AS $$
DECLARE
  v_order_id uuid;
  v_payment_id uuid;
  v_order record;
  v_attempt record;
  v_payment record;
BEGIN
  IF coalesce(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'service role required';
  END IF;
  IF p_expected_capture_revision <> 2
    OR p_mismatch_reason NOT IN (
      'payment_intent_mismatch', 'latest_charge_mismatch',
      'refund_observed', 'dispute_observed', 'capture_state_mismatch',
      'historical_binding_mismatch'
    ) THEN
    RAISE EXCEPTION 'invalid mismatch evidence';
  END IF;
  SELECT * INTO v_order
    FROM public.flight_orders AS flight_order
   WHERE flight_order.id = v_order_id
   FOR UPDATE;
  SELECT * INTO v_attempt
    FROM public.flight_payment_operation_attempts AS attempt
   WHERE attempt.id = p_capture_attempt_id
   FOR UPDATE;
  SELECT * INTO v_payment
    FROM public.flight_payments AS payment
   WHERE payment.id = v_payment_id
     AND payment.order_id = v_order_id
   FOR UPDATE;
  IF v_order.provider_order_ref_ciphertext IS NOT NULL
    OR v_attempt.state <> 'succeeded'
    OR v_attempt.revision <> p_expected_capture_revision
    OR v_attempt.terminal_receipt_sha256 IS NULL
    OR v_payment.processor_reference_sha256
      IS DISTINCT FROM p_processor_reference_sha256 THEN
    RAISE EXCEPTION 'capture mismatch';
  END IF;
  PERFORM public.assert_flight_consumer_preview_runtime_v1(
    v_order.execution_scope_sha256, 'order'
  );
  PERFORM public.assert_flight_consumer_preview_runtime_v1(
    v_order.execution_scope_sha256, 'payment'
  );
  IF false THEN
    RAISE EXCEPTION 'Immutable Flight provider success controls terminal replay';
  END IF;
  PERFORM 1 FROM public.flight_reconciliation_cases AS reconciliation
   WHERE reconciliation.case_type = 'payment_order_mismatch';
  UPDATE public.flight_orders SET status = 'requires_review';
  UPDATE public.flight_payments SET status = 'ambiguous';
  INSERT INTO public.flight_reconciliation_cases (id) VALUES (gen_random_uuid());
END $$;
ALTER TABLE public.flight_offer_evidence_vault OWNER TO postgres;
ALTER TABLE public.flight_order_response_evidence_vault OWNER TO postgres;
ALTER TABLE public.flight_order_recovery_evidence_vault OWNER TO postgres;
ALTER TABLE public.flight_secure_pii_records OWNER TO postgres;
GRANT SELECT (execution_scope_sha256) ON TABLE public.flight_offers TO authenticated;
GRANT SELECT (execution_scope_sha256) ON TABLE public.flight_orders TO authenticated;
GRANT SELECT (execution_scope_sha256) ON TABLE public.flight_payments TO authenticated;
GRANT SELECT (execution_scope_sha256) ON TABLE public.flight_ticket_documents TO authenticated;
REVOKE ALL ON FUNCTION public.ensure_flight_consumer_capture_review_case_092(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.claim_flight_consumer_duffel_order_attempt_pre092_v1(uuid, integer, text, text, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.enqueue_flight_consumer_duffel_pending_webhook_link_v1(uuid, integer, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.enqueue_flight_consumer_duffel_pending_webhook_link_v1(uuid, integer, text, text) TO service_role;
REVOKE ALL ON FUNCTION public.resolve_flight_consumer_duffel_pending_webhook_link_v1(uuid, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resolve_flight_consumer_duffel_pending_webhook_link_v1(uuid, integer) TO service_role;
REVOKE ALL ON FUNCTION public.resolve_flight_consumer_duffel_pending_links_for_attempt_v1(uuid, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resolve_flight_consumer_duffel_pending_links_for_attempt_v1(uuid, integer, integer) TO service_role;
REVOKE ALL ON FUNCTION public.acquire_flight_consumer_completion_lease_v1(uuid, uuid, text, text, text, text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.acquire_flight_consumer_completion_lease_v1(uuid, uuid, text, text, text, text, integer) TO service_role;
REVOKE ALL ON FUNCTION public.heartbeat_flight_consumer_completion_lease_v1(uuid, integer, text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.heartbeat_flight_consumer_completion_lease_v1(uuid, integer, text, integer) TO service_role;
REVOKE ALL ON FUNCTION public.complete_flight_consumer_completion_lease_v1(uuid, integer, text, text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.complete_flight_consumer_completion_lease_v1(uuid, integer, text, text, integer) TO service_role;
REVOKE ALL ON FUNCTION public.release_flight_consumer_completion_lease_v1(uuid, integer, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.release_flight_consumer_completion_lease_v1(uuid, integer, text, text) TO service_role;
REVOKE ALL ON FUNCTION public.recover_flight_consumer_completion_lease_v1(uuid, uuid, text, text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.recover_flight_consumer_completion_lease_v1(uuid, uuid, text, text, integer) TO service_role;
REVOKE ALL ON FUNCTION public.load_flight_offer_evidence_v1(text, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.load_flight_offer_evidence_v1(text, uuid, text) TO service_role;
REVOKE ALL ON FUNCTION public.load_flight_secure_pii_record_v1(text, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.load_flight_secure_pii_record_v1(text, uuid, text) TO service_role;
REVOKE ALL ON FUNCTION public.load_flight_consumer_order_response_evidence_v1(uuid, uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.load_flight_consumer_order_response_evidence_v1(uuid, uuid, uuid, text) TO service_role;
REVOKE ALL ON FUNCTION public.load_flight_consumer_duffel_order_recovery_evidence_v1(uuid, uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.load_flight_consumer_duffel_order_recovery_evidence_v1(uuid, uuid, uuid, text) TO service_role;
REVOKE ALL ON FUNCTION public.load_flight_offer_evidence_for_terminal_recovery_v1(uuid, uuid, uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.load_flight_offer_evidence_for_terminal_recovery_v1(uuid, uuid, uuid, text, text) TO service_role;
REVOKE ALL ON FUNCTION public.get_flight_offer_local_identity_for_terminal_recovery_v1(uuid, uuid, uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_flight_offer_local_identity_for_terminal_recovery_v1(uuid, uuid, uuid, text, text) TO service_role;
REVOKE ALL ON FUNCTION public.get_flight_consumer_duffel_recovery_evidence_observation_v1(uuid, uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_flight_consumer_duffel_recovery_evidence_observation_v1(uuid, uuid, uuid, text) TO service_role;
REVOKE ALL ON FUNCTION public.complete_flight_consumer_payment_operation_v1(uuid, integer, text, smallint, text, bigint, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.complete_flight_consumer_payment_operation_v1(uuid, integer, text, smallint, text, bigint, text) TO service_role;
REVOKE ALL ON FUNCTION public.claim_flight_consumer_duffel_order_attempt_v1(uuid, integer, text, text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_flight_consumer_duffel_order_attempt_v1(uuid, integer, text, text, text, text, text) TO service_role;
REVOKE ALL ON FUNCTION public.get_flight_consumer_duffel_order_recovery_v1(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_flight_consumer_duffel_order_recovery_v1(uuid, uuid) TO service_role;
REVOKE ALL ON FUNCTION public.record_flight_consumer_capture_attestation_mismatch_v1(uuid, uuid, uuid, integer, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_flight_consumer_capture_attestation_mismatch_v1(uuid, uuid, uuid, integer, text, text, text) TO service_role;
ALTER TABLE ONLY public.flight_runtime_controls ENABLE ROW LEVEL SECURITY;
ALTER TABLE ONLY public.flight_runtime_controls FORCE ROW LEVEL SECURITY;
ALTER TABLE ONLY public.flight_provider_request_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE ONLY public.flight_provider_request_attempts FORCE ROW LEVEL SECURITY;
ALTER TABLE ONLY public.flight_ticket_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE ONLY public.flight_ticket_documents FORCE ROW LEVEL SECURITY;
ALTER TABLE ONLY public.flight_offer_evidence_vault ENABLE ROW LEVEL SECURITY;
ALTER TABLE ONLY public.flight_offer_evidence_vault FORCE ROW LEVEL SECURITY;
ALTER TABLE ONLY public.flight_secure_pii_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE ONLY public.flight_secure_pii_records FORCE ROW LEVEL SECURITY;
ALTER TABLE ONLY public.flight_payment_operation_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE ONLY public.flight_payment_operation_attempts FORCE ROW LEVEL SECURITY;
ALTER TABLE ONLY public.flight_order_response_evidence_vault ENABLE ROW LEVEL SECURITY;
ALTER TABLE ONLY public.flight_order_response_evidence_vault FORCE ROW LEVEL SECURITY;
ALTER TABLE ONLY public.flight_consumer_webhook_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE ONLY public.flight_consumer_webhook_ledger FORCE ROW LEVEL SECURITY;
ALTER TABLE ONLY public.flight_payment_state_observations ENABLE ROW LEVEL SECURITY;
ALTER TABLE ONLY public.flight_payment_state_observations FORCE ROW LEVEL SECURITY;
ALTER TABLE ONLY public.flight_payment_refund_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE ONLY public.flight_payment_refund_evidence FORCE ROW LEVEL SECURITY;
ALTER TABLE ONLY public.flight_order_recovery_evidence_vault ENABLE ROW LEVEL SECURITY;
ALTER TABLE ONLY public.flight_order_recovery_evidence_vault FORCE ROW LEVEL SECURITY;
ALTER TABLE ONLY public.flight_consumer_notification_outbox_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE ONLY public.flight_consumer_notification_outbox_receipts FORCE ROW LEVEL SECURITY;
ALTER TABLE ONLY public.flight_reconciliation_cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE ONLY public.flight_reconciliation_cases FORCE ROW LEVEL SECURITY;
ALTER TABLE ONLY public.flight_service_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE ONLY public.flight_service_requests FORCE ROW LEVEL SECURITY;
ALTER TABLE ONLY public.flight_consumer_duffel_webhook_pending_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE ONLY public.flight_consumer_duffel_webhook_pending_links FORCE ROW LEVEL SECURITY;
ALTER TABLE ONLY public.flight_consumer_duffel_webhook_pending_link_resolutions ENABLE ROW LEVEL SECURITY;
ALTER TABLE ONLY public.flight_consumer_duffel_webhook_pending_link_resolutions FORCE ROW LEVEL SECURITY;
ALTER TABLE ONLY public.flight_consumer_completion_leases ENABLE ROW LEVEL SECURITY;
ALTER TABLE ONLY public.flight_consumer_completion_leases FORCE ROW LEVEL SECURITY;
`;
}

describe("flight Preview migration gate", () => {
  it("pins the exact historical 068 through 080 and canonical 120 through 138 bytes", () => {
    expect(PINNED_FLIGHT_MIGRATIONS).toEqual([
      {
        version: "202608230068",
        filename: "202608230068_flight_commerce_foundation.sql",
        sha256: "29f8cb9a45f69e7da23bffdf185ff6eaab2a514a35a22da4aa4b8c91cf08ef7d",
      },
      {
        version: "202608240069",
        filename: "202608240069_flight_provider_request_attempts.sql",
        sha256: "7e966c4fa6f08a92692787dd82fadd4c0205af02826342a3902037438b1bd611",
      },
      {
        version: "202608250070",
        filename: "202608250070_flight_duffel_test_order_attempts.sql",
        sha256: "882c20f4643ca5ed02cb5e5423e7dc140b54b7524a46f53e9c66e9af574e37fe",
      },
      {
        version: "202608250071",
        filename: "202608250071_flight_duffel_preview_rpc_bridge.sql",
        sha256: "bb4f8d4287060d5301e1704073e2d2c15b6dcfa1309cb1a190da9efddefa375d",
      },
      {
        version: "202608250072",
        filename: "202608250072_flight_duffel_preview_runtime_assertions.sql",
        sha256: "b8e073508ebe45be717f6d07fe463eae33eaf7d5d168076a903ffc552f08ca0b",
      },
      {
        version: "202608250073",
        filename: "202608250073_flight_duffel_claim_terminal_return.sql",
        sha256: "b9f6a6a25cf9cd5f1ad46e27a93b572d8e555a37ae08294391f2f575bcd7e045",
      },
      {
        version: "202608250074",
        filename: "202608250074_flight_consumer_preview_foundation.sql",
        sha256: "c5cf8ace2562332255758736970a022bced59c76867b1b71ce7703f12bb7bb98",
        rollbackFilename: "202608250074_flight_consumer_preview_foundation.rollback.sql",
        rollbackSha256: "128132c9bd3f0e78b5447b1ac37311d46c0882bae450aa92b9aa50d5f158d4f0",
      },
      {
        version: "202608250075",
        filename: "202608250075_flight_consumer_preview_orchestration.sql",
        sha256: "3edaffb8bb93588932ad4d3c5cd0727b360c9f669709bab2da9c4e25130f5e49",
        rollbackFilename: "202608250075_flight_consumer_preview_orchestration.rollback.sql",
        rollbackSha256: "d213a7b2a5ec793b2778564c989b694a7a260a8ea37a687e999e54041a572c67",
      },
      {
        version: "202608250076",
        filename: "202608250076_flight_consumer_preview_control_plane.sql",
        sha256: "3023e8190fa10b7b5f5de57fa588eaba39fe082a4eb06218d60d12adf839f8b1",
        rollbackFilename: "202608250076_flight_consumer_preview_control_plane.rollback.sql",
        rollbackSha256: "6204b1fcf01c56844f2d61bd588b8046830036c095b1e7e36bae663bdca06293",
      },
      {
        version: "202608250077",
        filename: "202608250077_flight_consumer_preview_async_finalization.sql",
        sha256: "f7aba46a72d6acfb9bf016faf8c666c37e3e3a73715114ebeadd12f2cd1f5ff7",
        rollbackFilename: "202608250077_flight_consumer_preview_async_finalization.rollback.sql",
        rollbackSha256: "1d70dad494830705b0f3628a58930f30d9cab3f958abb6b502ce15da460326ce",
      },
      {
        version: "202608250078",
        filename: "202608250078_flight_consumer_notification_delivery.sql",
        sha256: "187c46f7bc08d7f8165341858ecfac918048aac8dce2f70cb594406647aed8fb",
        rollbackFilename: "202608250078_flight_consumer_notification_delivery.rollback.sql",
        rollbackSha256: "ba64f007fa9be33b7f3c83fe3ab7ce5c0534e83f992559505b4d6b6579d53f19",
      },
      {
        version: "202608250079",
        filename: "202608250079_flight_consumer_preview_support_intake.sql",
        sha256: "02f5ed7064cfb2623e60c88bae8b042bdea08682473963e794711caf38d242ca",
        rollbackFilename: "202608250079_flight_consumer_preview_support_intake.rollback.sql",
        rollbackSha256: "4d51f43824e047a3c1969777ff01d815ea44965b8324c6b12ef8ae8dbcfba0fb",
      },
      {
        version: "202608250080",
        filename: "202608250080_flight_consumer_preview_activation_control.sql",
        sha256: "b84e6afc90e196cb1ab630512c145021af42a0f1b8d67d10bbaea2b8f63a420a",
        rollbackFilename: "202608250080_flight_consumer_preview_activation_control.rollback.sql",
        rollbackSha256: "19b12c59e1da57613990e20bfff115023d25026b4adb250273b3ffd2f373c726",
      },
      {
        version: "202608260120",
        filename: "202608260120_flight_consumer_webhook_operational_escalation.sql",
        sha256: "161cb8c088793c810a2133f2014886ef79768f3162fe5fc923f6bde79226ce99",
        rollbackFilename: "202608260120_flight_consumer_webhook_operational_escalation.rollback.sql",
        rollbackSha256: "b35d802921ee7878e4279e94c57230aad28ca49c5cc83437eff9fdb556602986",
      },
      {
        version: "202608260121",
        filename: "202608260121_flight_consumer_activation_cas_qualification.sql",
        sha256: "0be59a48d010fad7537f285456ab14a12733150d51fe5c2d1d7437af3bd253ca",
        rollbackFilename: "202608260121_flight_consumer_activation_cas_qualification.rollback.sql",
        rollbackSha256: "acbf756da48c09ce0b417ae0742892601b733cabeba7f29f47af07a88c9c1458",
      },
      {
        version: "202608260122",
        filename: "202608260122_flight_consumer_relock_settlement_constraint.sql",
        sha256: "05d15d04f2b80c33417a7b91b8641bf671bc8a15deee8dc0886eba9dc6521b09",
        rollbackFilename: "202608260122_flight_consumer_relock_settlement_constraint.rollback.sql",
        rollbackSha256: "ffcb057921fa3a085cbfdf64ccc4481f2b7ad7c9d35b2c0e339f9dd52621b23c",
      },
      {
        version: "202608260123",
        filename: "202608260123_flight_consumer_search_repair.sql",
        sha256: "903230c9c179567444932aeb190d6f24d6711e3b764425cbcd21a1d3b121057e",
        rollbackFilename: "202608260123_flight_consumer_search_repair.rollback.sql",
        rollbackSha256: "dbfaf2d116f3beedcb075220518d39eed02e5523626b60b6a65feda3a50d15fe",
      },
      {
        version: "202608260124",
        filename: "202608260124_flight_consumer_ciphertext_validation_repair.sql",
        sha256: "6f869b730b0946ca1facd07758871928cddfe5229b6dea5080dbde311b2b23ba",
        rollbackFilename: "202608260124_flight_consumer_ciphertext_validation_repair.rollback.sql",
        rollbackSha256: "2b11dcab3cc5a41f7cf92dcb7e1e993cd3c6b40145aabbaf8d7eabad1060ef79",
      },
      {
        version: "202608260125",
        filename: "202608260125_flight_consumer_reprice_projection_repair.sql",
        sha256: "d2f03669e49b6d42557e7a8e73e195a7aff87f4d38210d0610a186b656db8773",
        rollbackFilename: "202608260125_flight_consumer_reprice_projection_repair.rollback.sql",
        rollbackSha256: "c1dd412d4518148a633750b249467203285c82fe375e3dd6b2120470729ebbe3",
      },
      {
        version: "202608260126",
        filename: "202608260126_flight_consumer_capture_projection_repair.sql",
        sha256: "6c3c9c3629d86402576e5ef360059c5a569ff7ab6c50776aebef06b32af31637",
        rollbackFilename: "202608260126_flight_consumer_capture_projection_repair.rollback.sql",
        rollbackSha256: "f65e48cd6014357d27ae212951dce10fb880a14cc9b0e62208bec5fe4986354d",
      },
      {
        version: "202608260127",
        filename: "202608260127_flight_consumer_order_ambiguity_semantics_repair.sql",
        sha256: "be0e47e14679925edfc935af542439510d90fcc5975c725bd673332c859157b9",
        rollbackFilename: "202608260127_flight_consumer_order_ambiguity_semantics_repair.rollback.sql",
        rollbackSha256: "8cf6a87ef4c9cebaf16093afe5789c89b34822cb3a2e4e7a9d5147c4812b7eb7",
      },
      {
        version: "202608260128",
        filename: "202608260128_flight_consumer_order_recovery_hardening.sql",
        sha256: "7a2ecd0ea11f008096978ee092059f7cea33ede46285f40370e8bd8799c48244",
        rollbackFilename: "202608260128_flight_consumer_order_recovery_hardening.rollback.sql",
        rollbackSha256: "8ea7642d415cb6ea36bc5bc8b6db7c48be31944e10951ed3c782af44f272d5be",
      },
      {
        version: "202608260129",
        filename: "202608260129_flight_consumer_duffel_pending_webhook_link.sql",
        sha256: "85d82ca534455a375b2a6073abb27825ef1b77d745189cca4f5f5e82454e4906",
        rollbackFilename: "202608260129_flight_consumer_duffel_pending_webhook_link.rollback.sql",
        rollbackSha256: "e2b1f3077a0b8575af90e9fd20b922f8157ab7cde2917cd8405b9fa7e6bb9692",
      },
      {
        version: "202608260130",
        filename: "202608260130_flight_consumer_completion_lease.sql",
        sha256: "96994117e09984981ef10392b3c640b395baa843f4141bc622e4c3bcb3c8155c",
        rollbackFilename: "202608260130_flight_consumer_completion_lease.rollback.sql",
        rollbackSha256: "338c1fad9ec26823d45c08b08d594f130fdf766b16f22080d844f0145cac79ab",
      },
      {
        version: "202608260131",
        filename: "202608260131_flight_consumer_terminal_recovery_safety.sql",
        sha256: "95d4ffe8e1ac53ab237f16ece68c2ccfea63b06378cea9800b625b59e9d9993d",
        rollbackFilename: "202608260131_flight_consumer_terminal_recovery_safety.rollback.sql",
        rollbackSha256: "b8f5c8c8ecb809ff9b1e2e3738ec9874a6fc9bd38076fc1a07b22366e3b65dd7",
      },
      {
        version: "202608260132",
        filename: "202608260132_flight_consumer_capture_attestation_gate.sql",
        sha256: "47262234052bd8370765d1b195d7f6e565c00b543fdebabf9818fe8ac669ca28",
        rollbackFilename: "202608260132_flight_consumer_capture_attestation_gate.rollback.sql",
        rollbackSha256: "05932c2361eec67ebfd3374102ccf14a93a72c8cd844b7b5bdf54eb85b75359d",
      },
      {
        version: "202608260133",
        filename: "202608260133_flight_consumer_completion_lease_qualification_repair.sql",
        sha256: "27b5b35ee8239f091c61a75dd7fcd7c3beb0c1eb5aa652ecf8ae96c73ddcf65e",
        rollbackFilename: "202608260133_flight_consumer_completion_lease_qualification_repair.rollback.sql",
        rollbackSha256: "8ece424d11710e37f7b998c4c308d5848d979462161f5faf44c89080b99345ec",
      },
      {
        version: "202608260134",
        filename: "202608260134_flight_consumer_duffel_claim_evidence_column_repair.sql",
        sha256: "bc568c1129737290f7ecb46f783e573ebcfbc8a0d9f64e2a3d9e2bd9445ab9b7",
        rollbackFilename: "202608260134_flight_consumer_duffel_claim_evidence_column_repair.rollback.sql",
        rollbackSha256: "b113c99aec505319866840467262c7bee23efc0b56f662ba831bdfdbd7137eb5",
      },
      {
        version: "202608260135",
        filename: "202608260135_flight_consumer_completion_lease_recovery.sql",
        sha256: "7a57a21709b3d979226987b10419694389fa2aef2428216ccc8ac915283e8fb4",
        rollbackFilename: "202608260135_flight_consumer_completion_lease_recovery.rollback.sql",
        rollbackSha256: "f8ef205df51c9f5d0b671042fc51a341cf46ebfb9e5466c1d95149f2c1863930",
      },
      {
        version: "202608260136",
        filename: "202608260136_flight_consumer_terminal_offer_evidence_recovery.sql",
        sha256: "89880fa51d3c997b8364b6663ef617a735c3eaf712348ee55a5eb295a11e91da",
        rollbackFilename: "202608260136_flight_consumer_terminal_offer_evidence_recovery.rollback.sql",
        rollbackSha256: "1d890c2ed74a3a2a8b37ee07f16f8f3d5781e0c63e8812ccae8811b878d94bd5",
      },
      {
        version: "202608260137",
        filename: "202608260137_flight_consumer_terminal_offer_local_identity.sql",
        sha256: "09a89471334e6c25df324e54e242fef8a86416a278b3c37a19cb4d1f7986aeb8",
        rollbackFilename: "202608260137_flight_consumer_terminal_offer_local_identity.rollback.sql",
        rollbackSha256: "438367c921f972db2c8736e06c39663f025931879e3655423025c984fd50a2db",
      },
      {
        version: "202608260138",
        filename: "202608260138_flight_ticket_document_identity_scope_repair.sql",
        sha256: "8c9852a6d27c23512bfecfc589321109c0c3b0944bbe0a27aa519e6ef46704e7",
        rollbackFilename:
          "202608260138_flight_ticket_document_identity_scope_repair.rollback.sql",
        rollbackSha256:
          "7265425bea2497961f4ca64199f9cabce4a05a149cc59a4bc4d9cbca237cca37",
      },
    ]);
    expect(pinnedPlan.baselineVersions.at(-1)).toBe(REQUIRED_REMOTE_FLIGHT_BASELINE_TIP);
    expect(pinnedPlan.flightVersions).toEqual([
      "202608260120",
      "202608260121",
      "202608260122",
      "202608260123",
      "202608260124",
      "202608260125",
      "202608260126",
      "202608260127",
      "202608260128",
      "202608260129",
      "202608260130",
      "202608260131",
      "202608260132",
      "202608260133",
      "202608260134",
      "202608260135",
      "202608260136",
      "202608260137",
      "202608260138",
    ]);
    expect(pinnedPlan.flightVersions).toEqual(CANONICAL_FLIGHT_MIGRATION_VERSIONS);
    expect(pinnedPlan.flightVersions).toHaveLength(19);
    expect(repositoryVersions.slice(-19)).toEqual(pinnedPlan.flightVersions);
    expect(RETIRED_FLIGHT_MIGRATION_VERSIONS).toHaveLength(18);
    expect(pinnedPlan.sharedHotelMigrationPresent).toBe(true);
  });

  it("requires the exact pinned local hotel 082 predecessor for apply readiness", () => {
    expect(SHARED_HOTEL_MIGRATION).toMatchObject({
      sha256: "acbbc2ab50a1eada1ae99204a0b85dd7479de0605d636a51393fd7ab759af912",
      rollbackSha256:
        "7150387ee5f5d3e7f741ab04169d03de25a40ea479c7811bf614b170478492de",
    });
    const repositoryMigrations = listRepositoryMigrations();
    const hotelMigration = readFileSync(
      `supabase/migrations/${SHARED_HOTEL_MIGRATION.filename}`,
      "utf8",
    );
    expect(hotelMigration).not.toContain("pg_catalog.greatest");
    expect(hotelMigration).toContain(
      "effective_at >= greatest(hotel_signed_at, iratepilot_signed_at)",
    );
    expect(hotelMigration).toContain(
      "p_effective_at < greatest(p_hotel_signed_at, p_iratepilot_signed_at)",
    );
    const schema = readFileSync("supabase/schema.sql", "utf8");
    const hotelMirrorMarker =
      "-- Mirrored from migrations/202608250082_hotel_commercial_agreement_evidence.sql.";
    const flightMirrorMarker =
      "-- Mirrored from migrations/202608260120_flight_consumer_webhook_operational_escalation.sql.";
    const hotelPrerequisiteMarkers = [
      "-- Canonical bootstrap parity: 202608220062_hotel_partner_fee_schema.sql",
      "-- Canonical bootstrap parity: 202608220063_activate_hotel_partner_fee_schedule.sql",
      "-- Canonical bootstrap parity: 202608220070_hotel_commercial_intake_readiness.sql",
      "-- Canonical bootstrap parity: 202608220071_direct_hotel_request_foundation.sql",
      "-- Canonical bootstrap parity: 202608220072_ai_hotel_planner_user_quota.sql",
      "-- Canonical bootstrap parity: 202608220073_legacy_hotel_transaction_barrier.sql",
      "-- Canonical bootstrap parity: 202608220074_email_delivery_integrity_controls.sql",
    ];
    expect(schema).not.toContain("pg_catalog.greatest");
    expect(schema).toContain(hotelMirrorMarker);
    expect(schema).toContain(
      "effective_at >= greatest(hotel_signed_at, iratepilot_signed_at)",
    );
    expect(schema).toContain(
      "p_effective_at < greatest(p_hotel_signed_at, p_iratepilot_signed_at)",
    );
    let priorHotelMarkerIndex = -1;
    for (const marker of hotelPrerequisiteMarkers) {
      const markerIndex = schema.indexOf(marker);
      expect(markerIndex).toBeGreaterThan(priorHotelMarkerIndex);
      priorHotelMarkerIndex = markerIndex;
    }
    expect(priorHotelMarkerIndex).toBeLessThan(schema.indexOf(hotelMirrorMarker));
    expect(schema.indexOf(hotelMirrorMarker)).toBeLessThan(
      schema.indexOf(flightMirrorMarker),
    );
    const withoutHotel = repositoryMigrations.filter(
      ({ version }: { version: string }) => version !== SHARED_HOTEL_MIGRATION.version,
    );
    expect(assertPinnedFlightMigrations({
      repositoryMigrations: withoutHotel,
    }).sharedHotelMigrationPresent).toBe(false);
    expect(() => assertPinnedFlightMigrations({
      repositoryMigrations: withoutHotel,
      requireSharedHotel: true,
    })).toThrow("requires the exact pinned hotel migration 082");

    const wrongHotelFilename = repositoryMigrations.map(
      (migration: { version: string; filename: string }) => (
        migration.version === SHARED_HOTEL_MIGRATION.version
          ? { ...migration, filename: "202608250082_flight_retired_collision.sql" }
          : migration
      ),
    );
    expect(() => assertPinnedFlightMigrations({
      repositoryMigrations: wrongHotelFilename,
      requireSharedHotel: true,
    })).toThrow("retired flight migration version 081 through 098");

    expect(() => assertPinnedFlightMigrations({
      repositoryMigrations,
      readMigrationBytes: (filename: string) => (
        filename === SHARED_HOTEL_MIGRATION.filename
          ? Buffer.from("wrong hotel bytes", "utf8")
          : readFileSync(`supabase/migrations/${filename}`)
      ),
      requireSharedHotel: true,
    })).toThrow("hotel migration 082 failed its SHA-256 check");
  });

  it("accepts only the exact Preview ref on a matching official direct or pooler URL", () => {
    expect(previewTarget.databasePassword).toBe(previewPassword);
    expect(cliPreviewUrl).not.toContain(previewPassword);
    expect(new URL(cliPreviewUrl).password).toBe("");
    const directUrl =
      `postgresql://postgres:${previewPassword}@db.${PREVIEW_PROJECT_REF}.supabase.co:5432/postgres`;
    const directTarget = assertExactPreviewTarget({
      PREVIEW_SUPABASE_PROJECT_REF: PREVIEW_PROJECT_REF,
      PREVIEW_SUPABASE_DB_URL: directUrl,
    });
    expect(directTarget.databasePassword).toBe(previewPassword);
    expect(directTarget.cliDatabaseUrl).not.toContain(previewPassword);
  });

  it("passes the password through a minimal child environment rather than process arguments", () => {
    const childEnv = buildSupabaseChildEnv({
      Path: "C:\\approved-bin",
      SystemRoot: "C:\\Windows",
      PREVIEW_SUPABASE_DB_URL: previewUrl,
      PREVIEW_SUPABASE_PROJECT_REF: PREVIEW_PROJECT_REF,
      SUPABASE_ACCESS_TOKEN: "must-not-inherit",
      UNRELATED_SECRET: "must-not-inherit",
    }, previewPassword);
    expect(childEnv).toEqual({
      Path: "C:\\approved-bin",
      SystemRoot: "C:\\Windows",
      PGPASSWORD: previewPassword,
      SUPABASE_DB_PASSWORD: previewPassword,
      NO_COLOR: "1",
    });
    expect(JSON.stringify(childEnv)).not.toContain(previewUrl);
    expect(Object.values(childEnv)).not.toContain("must-not-inherit");
  });

  it("fails closed for production refs, mismatches, and unapproved URL shapes", () => {
    const cases = [
      {
        ...previewEnv,
        PREVIEW_SUPABASE_PROJECT_REF: PRODUCTION_PROJECT_REF,
      },
      {
        ...previewEnv,
        PRODUCTION_SUPABASE_PROJECT_REF: PREVIEW_PROJECT_REF,
      },
      {
        ...previewEnv,
        PRODUCTION_SUPABASE_PROJECT_REF: "not-a-valid-ref",
      },
      {
        ...previewEnv,
        PREVIEW_SUPABASE_DB_URL:
          `postgresql://postgres.${PRODUCTION_PROJECT_REF}:${previewPassword}`
          + "@aws-0-us-east-1.pooler.supabase.com:6543/postgres",
      },
      {
        ...previewEnv,
        PREVIEW_SUPABASE_DB_URL:
          `postgresql://postgres.${PREVIEW_PROJECT_REF}:${previewPassword}`
          + "@database.example.com:6543/postgres",
      },
      {
        ...previewEnv,
        PREVIEW_SUPABASE_DB_URL:
          `postgresql://postgres.${PREVIEW_PROJECT_REF}:${previewPassword}`
          + "@aws-0-us-east-1.pooler.supabase.com:6543/other",
      },
      {
        ...previewEnv,
        PREVIEW_SUPABASE_DB_URL: `${previewUrl}?sslmode=require`,
      },
      {
        ...previewEnv,
        PREVIEW_SUPABASE_DB_URL:
          `https://postgres.${PREVIEW_PROJECT_REF}:${previewPassword}`
          + "@aws-0-us-east-1.pooler.supabase.com:6543/postgres",
      },
    ];

    for (const env of cases) {
      let message = "";
      try {
        assertExactPreviewTarget(env);
      } catch (error) {
        message = error instanceof Error ? error.message : String(error);
      }
      expect(message).not.toBe("");
      expect(message).not.toContain(previewPassword);
      expect(message).not.toContain(env.PREVIEW_SUPABASE_DB_URL);
    }
  });

  it("defaults to planning and recognizes only one exact apply confirmation flag", () => {
    expect(APPLY_CONFIRMATION_FLAG).toBe(
      "--apply-confirmation=PREVIEW_eiqmdldjnedqgbtoozqa_FLIGHT_120_138",
    );
    expect(parseInvocationMode()).toBe("plan");
    expect(parseInvocationMode([])).toBe("plan");
    expect(parseInvocationMode(["--plan"])).toBe("plan");
    expect(parseInvocationMode([APPLY_CONFIRMATION_FLAG])).toBe("apply");
    for (const argv of [
      ["--apply"],
      ["--yes"],
      [APPLY_CONFIRMATION_FLAG, "--plan"],
      [`${APPLY_CONFIRMATION_FLAG}-typo`],
    ]) {
      expect(() => parseInvocationMode(argv)).toThrow("Invalid arguments");
    }
  });

  it("plans without running a command or revealing a database URL or password", () => {
    const logged: unknown[] = [];
    const summary = applyFlightPreviewMigrations({
      env: previewEnv,
      argv: [],
      runner: () => {
        throw new Error("runner must not be called in plan mode");
      },
      log: (value: unknown) => logged.push(value),
    });
    const rendered = JSON.stringify({ summary, logged });
    expect(summary.gate).toBe("flight-preview-migrations-120-138");
    expect(summary.mode).toBe("plan");
    expect(summary.networkExecuted).toBe(false);
    expect(summary.allowedPendingSets).toEqual(Array.from(
      { length: pinnedPlan.flightVersions.length + 1 },
      (_, installedPrefixLength) => pinnedPlan.flightVersions.slice(installedPrefixLength),
    ));
    expect(summary.migrationOrder.map(
      ({ version }: { version: string }) => version,
    )).toEqual([
      "202608260120",
      "202608260121",
      "202608260122",
      "202608260123",
      "202608260124",
      "202608260125",
      "202608260126",
      "202608260127",
      "202608260128",
      "202608260129",
      "202608260130",
      "202608260131",
      "202608260132",
      "202608260133",
      "202608260134",
      "202608260135",
      "202608260136",
      "202608260137",
      "202608260138",
    ]);
    expect(rendered).not.toContain(previewUrl);
    expect(rendered).not.toContain(previewPassword);
  });

  it("requires hotel 082 after the through-080 baseline and accepts exact canonical prefixes", () => {
    expect(assertPreviewLedger(
      migrationList(requiredRemotePredecessorVersions),
      pinnedPlan,
    ).pendingVersions).toEqual(pinnedPlan.flightVersions);
    expect(assertPreviewLedger(
      migrationList(repositoryVersions.slice(0, -1)),
      pinnedPlan,
    ).pendingVersions).toEqual(["202608260138"]);
    expect(assertPreviewLedger(
      migrationList(repositoryVersions),
      pinnedPlan,
    ).pendingVersions).toEqual([]);
  });

  it("accepts exact canonical prefixes and rejects retired, missing, unexpected, or drifted history", () => {
    const through120 = [
      ...requiredRemotePredecessorVersions,
      pinnedPlan.flightVersions[0],
    ];
    expect(assertPreviewLedger(migrationList(through120), pinnedPlan).pendingVersions)
      .toEqual(pinnedPlan.flightVersions.slice(1));

    const through125 = [
      ...requiredRemotePredecessorVersions,
      ...pinnedPlan.flightVersions.slice(0, 6),
    ];
    expect(assertPreviewLedger(migrationList(through125), pinnedPlan).pendingVersions)
      .toEqual([
        "202608260126", "202608260127", "202608260128",
        "202608260129", "202608260130", "202608260131", "202608260132",
        "202608260133", "202608260134", "202608260135", "202608260136",
        "202608260137", "202608260138",
      ]);

    const gapAfter125 = repositoryVersions.filter(
      (version: string) => version !== "202608260128",
    );
    expect(() => assertPreviewLedger(migrationList(gapAfter125), pinnedPlan)).toThrow(
      "exact prefix",
    );

    const missingBaseline = requiredRemotePredecessorVersions.filter(
      (version: string) => version !== REQUIRED_REMOTE_FLIGHT_BASELINE_TIP,
    );
    expect(() => assertPreviewLedger(migrationList(missingBaseline), pinnedPlan)).toThrow(
      "complete flight baseline through 080",
    );

    const unexpectedRemote = `${migrationList(repositoryVersions)}\n  | 202608240099 |`;
    expect(() => assertPreviewLedger(unexpectedRemote, pinnedPlan)).toThrow(
      "complete flight baseline through 080",
    );

    expect(() => assertPreviewLedger(
      migrationList(pinnedPlan.baselineVersions),
      pinnedPlan,
    )).toThrow("missing the already-applied external hotel migration 082 predecessor");

    for (const retiredVersion of RETIRED_FLIGHT_MIGRATION_VERSIONS.filter(
      (version: string) => version !== SHARED_HOTEL_MIGRATION.version,
    )) {
      const retiredRemote = `${migrationList(requiredRemotePredecessorVersions)}\n  | ${retiredVersion} |`;
      expect(() => assertPreviewLedger(retiredRemote, pinnedPlan)).toThrow(
        "retired or numerically colliding flight migration",
      );
    }

    const localDrift = migrationList(repositoryVersions).replace(
      "202608170067 | 202608170067",
      "               | 202608170067",
    );
    expect(() => assertPreviewLedger(localDrift, pinnedPlan)).toThrow(
      "local side does not exactly match",
    );

    const malformedLongRemote = `${migrationList(requiredRemotePredecessorVersions)}\n  | 20260824009999 |`;
    expect(() => assertPreviewLedger(malformedLongRemote, pinnedPlan)).toThrow(
      "malformed version cell",
    );
    const malformedTextRemote = `${migrationList(requiredRemotePredecessorVersions)}\n  | unexpected_version |`;
    expect(() => assertPreviewLedger(malformedTextRemote, pinnedPlan)).toThrow(
      "malformed version cell",
    );
  });

  it("requires a dry run to mention exactly the ledger-derived pinned migrations once each", () => {
    const exact = [
      "Would push migration 202608260120_flight_consumer_webhook_operational_escalation.sql",
      "Would push migration 202608260121_flight_consumer_activation_cas_qualification.sql",
      "Would push migration 202608260122_flight_consumer_relock_settlement_constraint.sql",
      "Would push migration 202608260123_flight_consumer_search_repair.sql",
      "Would push migration 202608260124_flight_consumer_ciphertext_validation_repair.sql",
      "Would push migration 202608260125_flight_consumer_reprice_projection_repair.sql",
      "Would push migration 202608260126_flight_consumer_capture_projection_repair.sql",
      "Would push migration 202608260127_flight_consumer_order_ambiguity_semantics_repair.sql",
      "Would push migration 202608260128_flight_consumer_order_recovery_hardening.sql",
      "Would push migration 202608260129_flight_consumer_duffel_pending_webhook_link.sql",
      "Would push migration 202608260130_flight_consumer_completion_lease.sql",
      "Would push migration 202608260131_flight_consumer_terminal_recovery_safety.sql",
      "Would push migration 202608260132_flight_consumer_capture_attestation_gate.sql",
      "Would push migration 202608260133_flight_consumer_completion_lease_qualification_repair.sql",
      "Would push migration 202608260134_flight_consumer_duffel_claim_evidence_column_repair.sql",
      "Would push migration 202608260135_flight_consumer_completion_lease_recovery.sql",
      "Would push migration 202608260136_flight_consumer_terminal_offer_evidence_recovery.sql",
      "Would push migration 202608260137_flight_consumer_terminal_offer_local_identity.sql",
      "Would push migration 202608260138_flight_ticket_document_identity_scope_repair.sql",
    ].join("\n");
    expect(assertExactFlightDryRun(exact)).toEqual([
      "202608260120",
      "202608260121",
      "202608260122",
      "202608260123",
      "202608260124",
      "202608260125",
      "202608260126",
      "202608260127",
      "202608260128",
      "202608260129",
      "202608260130",
      "202608260131",
      "202608260132",
      "202608260133",
      "202608260134",
      "202608260135",
      "202608260136",
      "202608260137",
      "202608260138",
    ]);
    const historicalFlight = "Would push migration 202608250080_flight_consumer_preview_activation_control.sql";
    expect(() => assertExactFlightDryRun(historicalFlight, ["202608250080"])).toThrow();
    const sharedHotel = "Would push migration 202608250082_hotel_commercial_agreement_evidence.sql";
    expect(() => assertExactFlightDryRun(sharedHotel, ["202608250082"])).toThrow();
    expect(() => assertExactFlightDryRun(exact.split("\n").reverse().join("\n"))).toThrow();
    expect(() => assertExactFlightDryRun(`${exact}\n202608240070_extra.sql`)).toThrow();
    expect(() => assertExactFlightDryRun(`${exact}\n${exact}`)).toThrow();
    expect(() => assertExactFlightDryRun(exact.split("\n")[0])).toThrow();
    expect(() => assertExactFlightDryRun(
      exact.replace(
        "202608260120_flight_consumer_webhook_operational_escalation.sql",
        "202608260120_wrong.sql",
      ),
    )).toThrow();
  });

  it("verifies the physical column, function-signature, and forced-RLS boundary", () => {
    const dump = physicalSchemaDump();
    expect(assertFlightSchemaDump(dump)).toBe(true);
    const quotedIfNotExistsDump = dump
      .replace(
        /CREATE TABLE public\.([a-z0-9_]+)/g,
        'CREATE TABLE IF NOT EXISTS "public"."$1"',
      )
      .replace(
        /ALTER TABLE ONLY public\.([a-z0-9_]+)/g,
        'ALTER TABLE ONLY "public"."$1"',
      );
    expect(assertFlightSchemaDump(quotedIfNotExistsDump)).toBe(true);
    const quotedExactAclRolesDump = dump
      .replaceAll(" TO service_role;", " TO \"service_role\";")
      .replaceAll(" OWNER TO postgres;", " OWNER TO \"postgres\";");
    expect(assertFlightSchemaDump(quotedExactAclRolesDump)).toBe(true);
    const pgDumpAclCommentShape = dump.replace(
      "REVOKE ALL ON FUNCTION public.load_flight_offer_evidence_for_terminal_recovery_v1(uuid, uuid, uuid, text, text) FROM PUBLIC;",
      "--\n"
        + "-- Name: FUNCTION load_flight_offer_evidence_for_terminal_recovery_v1(uuid, uuid, uuid, text, text); Type: ACL; Schema: public; Owner: postgres\n"
        + "--\n\n"
        + "REVOKE ALL ON FUNCTION public.load_flight_offer_evidence_for_terminal_recovery_v1(uuid, uuid, uuid, text, text) FROM PUBLIC;",
    );
    expect(assertFlightSchemaDump(pgDumpAclCommentShape)).toBe(true);
    const genericPgDumpAclCommentShape = dump.replace(
      "REVOKE ALL ON FUNCTION public.resolve_flight_consumer_duffel_pending_webhook_link_v1(uuid, integer) FROM PUBLIC;",
      "--\n"
        + "-- Name: FUNCTION resolve_flight_consumer_duffel_pending_webhook_link_v1(uuid, integer); Type: ACL; Schema: public; Owner: postgres\n"
        + "--\n\n"
        + "REVOKE ALL ON FUNCTION public.resolve_flight_consumer_duffel_pending_webhook_link_v1(uuid, integer) FROM PUBLIC;",
    );
    expect(assertFlightSchemaDump(genericPgDumpAclCommentShape)).toBe(true);
    expect(assertFlightSchemaDump(
      `${dump}\nGRANT SELECT ON TABLE public.flight_runtime_controls TO authenticated;`
        + "\nCREATE POLICY safe_read ON public.flight_runtime_controls FOR SELECT USING (true);",
    )).toBe(true);
    expect(() => assertFlightSchemaDump(
      dump.replace(
        "ALTER TABLE ONLY public.flight_provider_request_attempts FORCE ROW LEVEL SECURITY;",
        "",
      ),
    )).toThrow("does not prove forced RLS");
    expect(() => assertFlightSchemaDump(
      dump.replace("CREATE TABLE public.flight_runtime_controls", "CREATE TABLE public.other"),
    )).toThrow("missing a required flight table");
    expect(() => assertFlightSchemaDump(
      dump.replace(
        "p_terminal_response_bytes bigint",
        "p_terminal_response_bytes integer",
      ),
    )).toThrow("unexpected flight function signature");
    expect(() => assertFlightSchemaDump(
      dump.replace("shopping_enabled boolean DEFAULT false NOT NULL,", ""),
    )).toThrow("missing a required flight_runtime_controls column contract");
    expect(() => assertFlightSchemaDump(
      dump.replace(
        "CREATE TABLE public.flight_payment_operation_attempts",
        "CREATE TABLE public.other_payment_operation_attempts",
      ),
    )).toThrow("missing a required flight table");
    expect(() => assertFlightSchemaDump(
      dump.replace(
        "CREATE FUNCTION public.finalize_flight_consumer_duffel_order_v1",
        "CREATE FUNCTION public.other_finalize_flight_consumer_duffel_order_v1",
      ),
    )).toThrow("missing a required flight function");
    expect(() => assertFlightSchemaDump(
      dump.replace(
        "ALTER TABLE ONLY public.flight_payment_refund_evidence FORCE ROW LEVEL SECURITY;",
        "",
      ),
    )).toThrow("does not prove forced RLS");
    expect(() => assertFlightSchemaDump(
      dump.replace("    ELSE\n      RETURN QUERY", "    END IF;\n    IF false THEN\n      RETURN QUERY"),
    )).toThrow("mutually exclusive order and shopping claim routing");
    expect(() => assertFlightSchemaDump(
      dump.replace(
        "WHERE runtime_control.control_key = v_080.control_key",
        "WHERE control_key = v_080.control_key",
      ),
    )).toThrow("migration-121 qualified activation CAS");
    expect(() => assertFlightSchemaDump(
      dump.replace("          AND NOT provider_events_enabled\n", ""),
    )).toThrow(/migration-122.*settlement/i);
    expect(() => assertFlightSchemaDump(
      dump.replace(
        "IF coalesce(v_offer_json ->> 'local_offer_id', '')",
        "IF v_offer_json ->> 'local_offer_id' is distinct from v_offer_id::text",
      ),
    )).toThrow("migration-123 search repair");
    expect(() => assertFlightSchemaDump(
      dump.replace("WHERE offer.search_id = v_search.id", "WHERE search_id = v_search.id"),
    )).toThrow("migration-123 search repair");
    expect(() => assertFlightSchemaDump(
      dump.replace(
        "GRANT SELECT (execution_scope_sha256) ON TABLE public.flight_payments TO authenticated;",
        "",
      ),
    )).toThrow("migration-123 repository scope grants");
    expect(() => assertFlightSchemaDump(
      dump.replace(
        "flight_payments_processor_reference_ciphertext_check",
        "flight_payments_missing_ciphertext_check",
      ),
    )).toThrow("migration-124 ciphertext constraint repair");
    expect(() => assertFlightSchemaDump(
      dump.replace(
        "flight_ticket_documents_order_id_document_ref_sha256_key",
        "flight_ticket_documents_execution_scope_sha256_execution_mo_key",
      ).replace(
        "UNIQUE (order_id, document_ref_sha256)",
        "UNIQUE (execution_scope_sha256, execution_mode, document_ref_sha256)",
      ),
    )).toThrow("migration-138 ticket identity scope repair");
    expect(() => assertFlightSchemaDump(
      dump.replace(
        /ALTER TABLE ONLY public\.flight_ticket_documents\n  ADD CONSTRAINT flight_ticket_documents_order_id_document_ref_sha256_key\n  UNIQUE \(order_id, document_ref_sha256\);\n/,
        "",
      ),
    )).toThrow("migration-138 ticket identity scope repair");
    expect(() => assertFlightSchemaDump(
      dump.replace(
        "^enc:v[1-9][0-9]*:[A-Za-z0-9_-]+$",
        "^enc:v[1-9][0-9]*:[A-Za-z0-9_-]{16,4080}$",
      ),
    )).toThrow("migration-124 legacy ciphertext regex bound");
    expect(() => assertFlightSchemaDump(
      dump.replace(
        "AND char_length(split_part(refund_reference_ciphertext, ':', 3))\n"
          + "      BETWEEN 16 AND 4080",
        "AND true",
      ),
    )).toThrow("migration-124 ciphertext constraint repair");
    expect(() => assertFlightSchemaDump(
      dump.replace(
        "OR char_length(split_part(new.provider_order_ref_ciphertext, ':', 3))\n"
          + "      NOT BETWEEN 16 AND 8176",
        "OR false",
      ),
    )).toThrow("migration-124 async ciphertext predicates");
    expect(() => assertFlightSchemaDump(
      dump.replace(
        "OR char_length(split_part(coalesce(\n"
          + "        v_binding ->> 'provider_passenger_ref_ciphertext', ''\n"
          + "      ), ':', 3)) NOT BETWEEN 16 AND 4080",
        "OR false",
      ),
    )).toThrow("migration-124 async ciphertext predicates");
    expect(() => assertFlightSchemaDump(
      dump.replace("#variable_conflict error\nDECLARE\n  v_attempt record;", "DECLARE\n  v_attempt record;"),
    )).toThrow("migration-125 reprice failure repair");
    expect(() => assertFlightSchemaDump(
      dump.replace(
        "FROM public.flight_reprice_receipts AS reprice\n     WHERE reprice.offer_id = v_attempt.offer_id",
        "FROM public.flight_reprice_receipts\n     WHERE offer_id = v_attempt.offer_id",
      ),
    )).toThrow("migration-125 reprice failure repair");
    expect(() => assertFlightSchemaDump(
      dump.replace(
        "  UPDATE public.flight_offers AS offer\n"
          + "     SET status = 'expired'\n"
          + "   WHERE offer.id = v_attempt.offer_id AND offer.status = 'offered';\n",
        "",
      ),
    )).toThrow("migration-125 reprice failure repair");
    expect(() => assertFlightSchemaDump(
      dump.replace(
        "'ciphertext_base64url', 'aad_sha256', 'record_hmac_sha256'",
        "'ciphertext_base64url', 'aad_sha256', 'record_hmac_sha256', 'local_offer_id'",
      ),
    )).toThrow("migration-125 15-key reprice evidence contract");
    expect(() => assertFlightSchemaDump(
      dump.replace(
        "CREATE TABLE public.flight_consumer_duffel_webhook_pending_links",
        "CREATE TABLE public.other_pending_links",
      ),
    )).toThrow("missing a required flight table");
    expect(() => assertFlightSchemaDump(
      dump.replace(
        "ALTER TABLE ONLY public.flight_consumer_completion_leases FORCE ROW LEVEL SECURITY;",
        "",
      ),
    )).toThrow("does not prove forced RLS");
    expect(() => assertFlightSchemaDump(
      dump.replace(
        "GRANT EXECUTE ON FUNCTION public.acquire_flight_consumer_completion_lease_v1(uuid, uuid, text, text, text, text, integer) TO service_role;",
        "",
      ),
    )).toThrow("missing a required service-role function grant");
    expect(() => assertFlightSchemaDump(
      `${dump}\nGRANT EXECUTE ON FUNCTION public.resolve_flight_consumer_duffel_pending_webhook_link_v1(uuid, integer) TO authenticated;`,
    )).toThrow("exposes a service-only flight function");
    expect(() => assertFlightSchemaDump(
      dump.replace(
        "REVOKE ALL ON FUNCTION public.resolve_flight_consumer_duffel_pending_webhook_link_v1(uuid, integer) FROM PUBLIC;",
        "",
      ),
    )).toThrow(
      "resolve_flight_consumer_duffel_pending_webhook_link_v1 service-only PUBLIC revoke",
    );
    const genericServiceOnlyGrant =
      "GRANT EXECUTE ON FUNCTION public.resolve_flight_consumer_duffel_pending_webhook_link_v1(uuid, integer) TO service_role;";
    expect(assertFlightSchemaDump(
      `${dump}\nGRANT ALL ON FUNCTION public.resolve_flight_consumer_duffel_pending_webhook_link_v1(uuid, integer) TO postgres;`,
    )).toBe(true);
    expect(assertFlightSchemaDump(
      `${dump}\nGRANT ALL ON FUNCTION public.resolve_flight_consumer_duffel_pending_webhook_link_v1(uuid, integer) TO "postgres";`,
    )).toBe(true);
    expect(assertFlightSchemaDump(
      dump.replace(genericServiceOnlyGrant, genericServiceOnlyGrant.replace("EXECUTE", "ALL")),
    )).toBe(true);
    expect(assertFlightSchemaDump(
      dump.replace(
        genericServiceOnlyGrant,
        genericServiceOnlyGrant.replace("service_role", "\"service_role\""),
      ),
    )).toBe(true);
    expect(() => assertFlightSchemaDump(
      `${dump}\nGRANT EXECUTE ON FUNCTION public.resolve_flight_consumer_duffel_pending_webhook_link_v1(uuid, integer) TO evil_role;`,
    )).toThrow("exposes a service-only flight function");
    expect(() => assertFlightSchemaDump(
      dump.replace(
        genericServiceOnlyGrant,
        `${genericServiceOnlyGrant.slice(0, -1)} WITH GRANT OPTION;`,
      ),
    )).toThrow("exposes a service-only flight function");
    expect(() => assertFlightSchemaDump(
      dump.replace(
        genericServiceOnlyGrant,
        genericServiceOnlyGrant.replace("service_role", "\"Service_Role\""),
      ),
    )).toThrow("exposes a service-only flight function");
    expect(() => assertFlightSchemaDump(
      dump.replace(
        genericServiceOnlyGrant,
        genericServiceOnlyGrant.replace("public.", "\"Public\"."),
      ),
    )).toThrow("exposes a service-only flight function");
    expect(() => assertFlightSchemaDump(
      dump.replace(
        "REVOKE ALL ON FUNCTION public.resolve_flight_consumer_duffel_pending_webhook_link_v1(uuid, integer) FROM PUBLIC;",
        "REVOKE ALL ON FUNCTION public.resolve_flight_consumer_duffel_pending_webhook_link_v1(uuid, integer) FROM \"PUBLIC\";",
      ),
    )).toThrow(
      "resolve_flight_consumer_duffel_pending_webhook_link_v1 service-only PUBLIC revoke",
    );
    expect(() => assertFlightSchemaDump(
      `${dump}\nGRANT SELECT ON TABLE public.flight_consumer_completion_leases TO service_role;`,
    )).toThrow("exposes a service-owned flight evidence table");
    for (const table of [
      "flight_offer_evidence_vault",
      "flight_order_response_evidence_vault",
      "flight_order_recovery_evidence_vault",
    ]) {
      for (const role of ["authenticated", "anon", "service_role", "evil_role"]) {
        expect(() => assertFlightSchemaDump(
          `${dump}\nGRANT SELECT ON TABLE public.${table} TO ${role};`,
        )).toThrow("exposes a service-owned flight evidence table");
      }
    }
    for (const table of [
      "flight_offer_evidence_vault",
      "flight_order_response_evidence_vault",
      "flight_order_recovery_evidence_vault",
      "flight_secure_pii_records",
    ]) {
      expect(() => assertFlightSchemaDump(
        dump.replace(
          `ALTER TABLE public.${table} OWNER TO postgres;`,
          `ALTER TABLE public.${table} OWNER TO evil_role;`,
        ),
      )).toThrow(`does not prove postgres ownership of ${table}`);
      expect(() => assertFlightSchemaDump(
        dump.replace(
          `ALTER TABLE public.${table} OWNER TO postgres;`,
          `ALTER TABLE public.${table} OWNER TO "Postgres";`,
        ),
      )).toThrow(`does not prove postgres ownership of ${table}`);
    }
    const ciphertextLoaders = [
      ["load_flight_offer_evidence_v1", "text, uuid, text"],
      ["load_flight_secure_pii_record_v1", "text, uuid, text"],
      [
        "load_flight_consumer_order_response_evidence_v1",
        "uuid, uuid, uuid, text",
      ],
      [
        "load_flight_consumer_duffel_order_recovery_evidence_v1",
        "uuid, uuid, uuid, text",
      ],
    ];
    for (const [functionName, signature] of ciphertextLoaders) {
      const serviceGrant =
        `GRANT EXECUTE ON FUNCTION public.${functionName}(${signature}) TO service_role;`;
      for (const role of ["authenticated", "evil_role"]) {
        expect(() => assertFlightSchemaDump(
          `${dump}\nGRANT EXECUTE ON FUNCTION public.${functionName}(${signature}) TO ${role};`,
        )).toThrow(`${functionName} to an unauthorized role or grant option`);
      }
      expect(() => assertFlightSchemaDump(
        dump.replace(serviceGrant, `${serviceGrant.slice(0, -1)} WITH GRANT OPTION;`),
      )).toThrow(`${functionName} to an unauthorized role or grant option`);
      expect(() => assertFlightSchemaDump(
        dump.replace(
          serviceGrant,
          serviceGrant.replace("service_role", "\"Service_Role\""),
        ),
      )).toThrow(`${functionName} to an unauthorized role or grant option`);
    }
    expect(() => assertFlightSchemaDump(
      dump.replace(
        "  LANGUAGE plpgsql SECURITY DEFINER\n"
          + "  SET search_path = pg_catalog, public\n"
          + "  AS $offer_evidence_loader$",
        "  LANGUAGE plpgsql SECURITY INVOKER\n"
          + "  SET search_path = pg_catalog, public\n"
          + "  AS $offer_evidence_loader$",
      ),
    )).toThrow("load_flight_offer_evidence_v1 authority metadata");
    expect(() => assertFlightSchemaDump(
      dump.replace(
        "  SET search_path = pg_catalog, public\n  AS $secure_pii_loader$",
        "  SET search_path = public, pg_catalog\n  AS $secure_pii_loader$",
      ),
    )).toThrow("load_flight_secure_pii_record_v1 authority metadata");
    expect(() => assertFlightSchemaDump(
      dump.replace(
        "ALTER FUNCTION public.load_flight_consumer_order_response_evidence_v1(\n"
          + "  uuid, uuid, uuid, text\n"
          + ") OWNER TO postgres;",
        "ALTER FUNCTION public.load_flight_consumer_order_response_evidence_v1(\n"
          + "  uuid, uuid, uuid, text\n"
          + ") OWNER TO evil_role;",
      ),
    )).toThrow("load_flight_consumer_order_response_evidence_v1 ownership");
    expect(() => assertFlightSchemaDump(
      dump.replace(
        "REVOKE ALL ON FUNCTION public.load_flight_consumer_duffel_order_recovery_evidence_v1(uuid, uuid, uuid, text) FROM PUBLIC;",
        "",
      ),
    )).toThrow(
      "load_flight_consumer_duffel_order_recovery_evidence_v1 PUBLIC revoke",
    );
    expect(() => assertFlightSchemaDump(`${dump}
CREATE FUNCTION public.leak_flight_offer_ciphertext_v1()
RETURNS SETOF text
  LANGUAGE sql SECURITY DEFINER
  SET search_path = pg_catalog, public
  AS $ciphertext_leak$
    SELECT evidence.ciphertext_base64url
      FROM public.flight_offer_evidence_vault AS evidence
  $ciphertext_leak$;
ALTER FUNCTION public.leak_flight_offer_ciphertext_v1() OWNER TO postgres;
GRANT EXECUTE ON FUNCTION public.leak_flight_offer_ciphertext_v1() TO authenticated;`))
      .toThrow("unapproved sensitive flight ciphertext function");
    expect(() => assertFlightSchemaDump(`${dump}
CREATE FUNCTION public.alias_flight_terminal_ciphertext_loader_v1(
  p_attempt_id uuid, p_order_id uuid, p_customer_id uuid,
  p_scope text, p_receipt text
) RETURNS SETOF record
  LANGUAGE sql SECURITY DEFINER
  SET search_path = pg_catalog, public, extensions
  AS $loader_alias$
    SELECT * FROM public.load_flight_offer_evidence_for_terminal_recovery_v1(
      p_attempt_id, p_order_id, p_customer_id, p_scope, p_receipt
    )
  $loader_alias$;`)).toThrow("unapproved sensitive flight ciphertext function");
    expect(() => assertFlightSchemaDump(`${dump}
CREATE VIEW public.flight_offer_ciphertext_leak_v1 AS
SELECT evidence.ciphertext_base64url
  FROM public.flight_offer_evidence_vault AS evidence;`))
      .toThrow("sensitive flight ciphertext view");
    expect(() => assertFlightSchemaDump(
      dump.replace(
        "  PERFORM public.ensure_flight_consumer_capture_review_case_092(p_attempt_id);",
        "  PERFORM 1;",
      ),
    )).toThrow("migration-131 terminal recovery safety boundary");
    expect(() => assertFlightSchemaDump(
      dump.replace(
        "    RAISE EXCEPTION 'Active Flight reconciliation blocks Duffel dispatch';",
        "    RAISE EXCEPTION 'unsafe';",
      ),
    )).toThrow("migration-131 terminal recovery safety boundary");
    expect(() => assertFlightSchemaDump(
      `${dump}\nGRANT EXECUTE ON FUNCTION public.ensure_flight_consumer_capture_review_case_092(uuid) TO service_role;`,
    )).toThrow("exposes an internal flight projector");
    expect(() => assertFlightSchemaDump(
      `${dump}\nGRANT EXECUTE ON FUNCTION public.ensure_flight_consumer_capture_review_case_092(uuid) TO evil_role;`,
    )).toThrow("exposes an internal flight projector");
    expect(() => assertFlightSchemaDump(
      `${dump}\nGRANT EXECUTE ON FUNCTION public.ensure_flight_consumer_capture_review_case_092(uuid) TO service_role WITH GRANT OPTION;`,
    )).toThrow("exposes an internal flight projector");
    for (const [functionName, signature] of [
      ["ensure_flight_consumer_capture_review_case_092", "uuid"],
      [
        "claim_flight_consumer_duffel_order_attempt_pre092_v1",
        "uuid, integer, text, text, text, text, text",
      ],
    ]) {
      expect(() => assertFlightSchemaDump(
        dump.replace(
          `REVOKE ALL ON FUNCTION public.${functionName}(${signature}) FROM PUBLIC;`,
          "",
        ),
      )).toThrow(`${functionName} internal-projector PUBLIC revoke`);
    }
    expect(() => assertFlightSchemaDump(
      dump.replace(
        "  IF coalesce(auth.role(), '') <> 'service_role' THEN\n"
          + "    RAISE EXCEPTION 'service role required';\n"
          + "  END IF;\n"
          + "  IF p_expected_capture_revision <> 2",
        "  IF false THEN\n"
          + "    RAISE EXCEPTION 'service role required';\n"
          + "  END IF;\n"
          + "  IF p_expected_capture_revision <> 2",
      ),
    )).toThrow("migration-132 capture attestation boundary");
    expect(() => assertFlightSchemaDump(
      dump.replace(
        "    OR v_payment.processor_reference_sha256\n"
          + "      IS DISTINCT FROM p_processor_reference_sha256 THEN",
        "    OR false THEN",
      ),
    )).toThrow("migration-132 capture attestation boundary");
    expect(() => assertFlightSchemaDump(
      dump.replace(
        "   WHERE attempt.id = p_capture_attempt_id\n   FOR UPDATE;",
        "   WHERE attempt.id = p_capture_attempt_id;",
      ),
    )).toThrow("migration-132 capture attestation boundary");
    expect(() => assertFlightSchemaDump(
      dump.replace(
        "    RAISE EXCEPTION 'Immutable Flight provider success controls terminal replay';",
        "    RAISE EXCEPTION 'unsafe';",
      ),
    )).toThrow("migration-132 capture attestation boundary");
    expect(() => assertFlightSchemaDump(
      dump.replace(
        "GRANT EXECUTE ON FUNCTION public.record_flight_consumer_capture_attestation_mismatch_v1(uuid, uuid, uuid, integer, text, text, text) TO service_role;",
        "",
      ),
    )).toThrow("missing a required service-role function grant");
    expect(() => assertFlightSchemaDump(
      `${dump}\nGRANT EXECUTE ON FUNCTION public.record_flight_consumer_capture_attestation_mismatch_v1(uuid, uuid, uuid, integer, text, text, text) TO authenticated;`,
    )).toThrow("exposes a service-only flight function");
    expect(() => assertFlightSchemaDump(
      dump.replace(
        "  UPDATE public.flight_consumer_completion_leases AS completion_lease\n"
          + "     SET lease_state = 'completed'",
        "  UPDATE public.flight_consumer_completion_leases\n"
          + "     SET lease_state = 'completed'",
      ),
    )).toThrow("migration-133 completion lease qualification repair");
    expect(() => assertFlightSchemaDump(
      dump.replace(
        "   WHERE completion_lease.order_id = p_order_id\n"
          + "     AND completion_lease.lease_revision = p_expected_revision\n"
          + "     AND completion_lease.lease_state = 'processing'\n"
          + "     AND completion_lease.lease_token_sha256 = p_lease_token_sha256;",
        "   WHERE order_id = p_order_id\n"
          + "     AND completion_lease.lease_revision = p_expected_revision\n"
          + "     AND completion_lease.lease_state = 'processing'\n"
          + "     AND completion_lease.lease_token_sha256 = p_lease_token_sha256;",
      ),
    )).toThrow("migration-133 completion lease qualification repair");
    expect(() => assertFlightSchemaDump(
      dump.replace(
        "$complete_completion_lease$\n#variable_conflict error",
        "$complete_completion_lease$",
      ),
    )).toThrow("migration-133 completion lease qualification repair");
    expect(() => assertFlightSchemaDump(
      dump.replace(
        "   WHERE evidence.retention_expires_at > v_now\n",
        "",
      ),
    )).toThrow("migration-134 Duffel claim evidence-column repair");
    expect(() => assertFlightSchemaDump(
      `${dump}\nGRANT EXECUTE ON FUNCTION public.claim_flight_consumer_duffel_order_attempt_pre092_v1(uuid, integer, text, text, text, text, text) TO service_role;`,
    )).toThrow("exposes an internal flight projector");
    expect(() => assertFlightSchemaDump(
      dump.replaceAll("v_lease.request_sha256", "NULL::text"),
    )).toThrow("migration-135 completion lease recovery boundary");
    expect(() => assertFlightSchemaDump(
      dump.replace("v_capture.revision, false;", "v_capture.revision, true;"),
    )).toThrow("migration-135 completion lease recovery boundary");
    expect(() => assertFlightSchemaDump(
      dump.replace(
        "    or v_attempt.dispatch_started_at >= v_refreshed.retention_expires_at\n",
        "",
      ),
    )).toThrow("migration-136 terminal offer-evidence recovery boundary");
    expect(() => assertFlightSchemaDump(
      dump.replace(
        "  v_selected public.flight_offer_evidence_vault;\nbegin",
        "  v_selected public.flight_offer_evidence_vault;\nbegin\n"
          + "  delete from public.flight_offer_evidence_vault where id = v_selected.id;",
      ),
    )).toThrow("migration-136 terminal offer-evidence recovery boundary");
    expect(() => assertFlightSchemaDump(
      dump.replace(
        "  LANGUAGE plpgsql SECURITY DEFINER\n"
          + "  SET search_path = pg_catalog, public, extensions\n"
          + "  AS $terminal_offer_evidence$",
        "  LANGUAGE plpgsql\n"
          + "  SET search_path = pg_catalog, public, extensions\n"
          + "  AS $terminal_offer_evidence$",
      ),
    )).toThrow("migration-136 terminal recovery function authority metadata");
    expect(() => assertFlightSchemaDump(
      dump.replace(
        "    OR v_evidence.retention_expires_at <= v_now THEN",
        "    OR false THEN",
      ),
    )).toThrow("migration-136 terminal offer-evidence recovery boundary");
    expect(() => assertFlightSchemaDump(
      dump.replace(
        "REVOKE ALL ON FUNCTION public.load_flight_offer_evidence_for_terminal_recovery_v1(uuid, uuid, uuid, text, text) FROM PUBLIC;",
        "",
      ),
    )).toThrow("migration-136 terminal recovery function PUBLIC revoke");
    expect(() => assertFlightSchemaDump(
      dump.replace(
        "GRANT EXECUTE ON FUNCTION public.load_flight_offer_evidence_for_terminal_recovery_v1(uuid, uuid, uuid, text, text) TO service_role;",
        "",
      ),
    )).toThrow("migration-136 terminal recovery function to an unauthorized role");
    expect(() => assertFlightSchemaDump(
      dump.replace("if v_verified_count <> 1", "if false"),
    )).toThrow("migration-137 terminal offer local-identity boundary");
    expect(() => assertFlightSchemaDump(
      dump.replace(
        "  v_local_offer_id text;\nbegin",
        "  v_local_offer_id text;\nbegin\n"
          + "  delete from public.flight_offer_evidence_vault where id = v_evidence_id;",
      ),
    )).toThrow("migration-137 terminal offer local-identity boundary");
    expect(() => assertFlightSchemaDump(
      dump.replace(
        "  LANGUAGE plpgsql SECURITY DEFINER\n"
          + "  SET search_path = pg_catalog, public, extensions\n"
          + "  AS $terminal_offer_local_identity$",
        "  LANGUAGE plpgsql SECURITY DEFINER\n"
          + "  SET search_path = public, pg_catalog, extensions\n"
          + "  AS $terminal_offer_local_identity$",
      ),
    )).toThrow("migration-137 terminal recovery function authority metadata");
    expect(() => assertFlightSchemaDump(
      dump.replace(
        "ALTER FUNCTION public.get_flight_offer_local_identity_for_terminal_recovery_v1(\n"
          + "  uuid, uuid, uuid, text, text\n"
          + ") OWNER TO postgres;",
        "ALTER FUNCTION public.get_flight_offer_local_identity_for_terminal_recovery_v1(\n"
          + "  uuid, uuid, uuid, text, text\n"
          + ") OWNER TO evil_role;",
      ),
    )).toThrow("migration-137 terminal recovery function owner");
    expect(() => assertFlightSchemaDump(
      dump.replace(
        "ALTER FUNCTION public.get_flight_offer_local_identity_for_terminal_recovery_v1(\n"
          + "  uuid, uuid, uuid, text, text\n"
          + ") OWNER TO postgres;",
        "ALTER FUNCTION public.get_flight_offer_local_identity_for_terminal_recovery_v1(\n"
          + "  uuid, uuid, uuid, text, text\n"
          + ") OWNER TO \"Postgres\";",
      ),
    )).toThrow("migration-137 terminal recovery function owner");
    expect(() => assertFlightSchemaDump(
      `${dump}\nGRANT EXECUTE ON FUNCTION public.get_flight_offer_local_identity_for_terminal_recovery_v1(uuid, uuid, uuid, text, text) TO evil_role;`,
    )).toThrow("migration-137 terminal recovery function to an unauthorized role");
    expect(() => assertFlightSchemaDump(
      dump.replace(
        "GRANT EXECUTE ON FUNCTION public.get_flight_offer_local_identity_for_terminal_recovery_v1(uuid, uuid, uuid, text, text) TO service_role;",
        "GRANT EXECUTE ON FUNCTION public.get_flight_offer_local_identity_for_terminal_recovery_v1(uuid, uuid, uuid, text, text) TO \"Service_Role\";",
      ),
    )).toThrow("migration-137 terminal recovery function to an unauthorized role");
    expect(() => assertFlightSchemaDump(`${dump}
CREATE FUNCTION public.get_flight_offer_local_identity_for_terminal_recovery_v1(
  p_attempt_id uuid, p_order_id uuid, p_customer_id uuid,
  p_execution_scope_sha256 text, p_receipt_sha256 text,
  p_leak boolean DEFAULT true
) RETURNS TABLE(ciphertext_base64url text)
  LANGUAGE sql SECURITY DEFINER
  SET search_path = pg_catalog, public, extensions
  AS $leak$ SELECT evidence.ciphertext_base64url
    FROM public.flight_offer_evidence_vault AS evidence LIMIT 1 $leak$;
ALTER FUNCTION public.get_flight_offer_local_identity_for_terminal_recovery_v1(
  uuid, uuid, uuid, text, text, boolean
) OWNER TO evil_role;
GRANT EXECUTE ON FUNCTION public.get_flight_offer_local_identity_for_terminal_recovery_v1(
  uuid, uuid, uuid, text, text, boolean
) TO authenticated;`)).toThrow("migration-137 terminal recovery sibling overload");
    expect(() => assertFlightSchemaDump(
      `${dump}\nGRANT EXECUTE ON FUNCTION public.get_flight_offer_local_identity_for_terminal_recovery_v1(uuid, uuid, uuid, text, text, boolean) TO authenticated;`,
    )).toThrow("migration-137 terminal recovery sibling-overload authority");
    expect(() => assertFlightSchemaDump(
      dump.replace(
        "REVOKE ALL ON FUNCTION public.get_flight_offer_local_identity_for_terminal_recovery_v1(uuid, uuid, uuid, text, text) FROM PUBLIC;",
        "",
      ),
    )).toThrow("migration-137 terminal recovery function PUBLIC revoke");
    expect(() => assertFlightSchemaDump(
      dump.replace(
        "GRANT EXECUTE ON FUNCTION public.get_flight_offer_local_identity_for_terminal_recovery_v1(uuid, uuid, uuid, text, text) TO service_role;",
        "",
      ),
    )).toThrow("migration-137 terminal recovery function to an unauthorized role");
    expect(() => assertFlightSchemaDump(
      `${dump}\nGRANT EXECUTE ON FUNCTION public.get_flight_offer_local_identity_for_terminal_recovery_v1(uuid, uuid, uuid, text, text) TO authenticated;`,
    )).toThrow("migration-137 terminal recovery function to an unauthorized role");
    expect(() => assertFlightSchemaDump(
      `${dump}\nGRANT EXECUTE ON FUNCTION public.get_flight_consumer_duffel_recovery_evidence_observation_v1(uuid, uuid, uuid, text) TO authenticated;`,
    )).toThrow("exposes a service-only flight function");
    expect(() => assertFlightSchemaDump(
      dump.replace(
        "GRANT EXECUTE ON FUNCTION public.recover_flight_consumer_completion_lease_v1(uuid, uuid, text, text, integer) TO service_role;",
        "",
      ),
    )).toThrow("missing a required service-role function grant");
    expect(() => assertFlightSchemaDump(
      dump.replace(
        "GRANT EXECUTE ON FUNCTION public.heartbeat_flight_consumer_completion_lease_v1(uuid, integer, text, integer) TO service_role;",
        "",
      ),
    )).toThrow("missing a required service-role function grant");
    expect(() => assertFlightSchemaDump(
      `${dump}\nGRANT SELECT (provider_offer_ref_ciphertext) ON TABLE public.flight_offers TO authenticated;`,
    )).toThrow("sensitive flight repository column");
    expect(() => assertFlightSchemaDump(
      `${dump}\nGRANT UPDATE ON TABLE public.flight_runtime_controls TO authenticated;`,
    )).toThrow("direct runtime-control mutation authority");
    expect(() => assertFlightSchemaDump(
      `${dump}\nGRANT ALL PRIVILEGES ON TABLE public.flight_runtime_controls TO authenticated;`,
    )).toThrow("direct runtime-control mutation authority");
    expect(() => assertFlightSchemaDump(
      `${dump}\nCREATE POLICY unsafe ON public.flight_runtime_controls FOR UPDATE USING (true);`,
    )).toThrow("non-read runtime-control policy");
  }, 15_000);

  it("runs the fixed non-shell CLI sequence and applies only after the exact dry run", () => {
    const calls: string[][] = [];
    const outputs = [
      migrationList(requiredRemotePredecessorVersions),
      [
        "Would push migration 202608260120_flight_consumer_webhook_operational_escalation.sql",
        "Would push migration 202608260121_flight_consumer_activation_cas_qualification.sql",
        "Would push migration 202608260122_flight_consumer_relock_settlement_constraint.sql",
        "Would push migration 202608260123_flight_consumer_search_repair.sql",
        "Would push migration 202608260124_flight_consumer_ciphertext_validation_repair.sql",
        "Would push migration 202608260125_flight_consumer_reprice_projection_repair.sql",
        "Would push migration 202608260126_flight_consumer_capture_projection_repair.sql",
        "Would push migration 202608260127_flight_consumer_order_ambiguity_semantics_repair.sql",
        "Would push migration 202608260128_flight_consumer_order_recovery_hardening.sql",
        "Would push migration 202608260129_flight_consumer_duffel_pending_webhook_link.sql",
        "Would push migration 202608260130_flight_consumer_completion_lease.sql",
        "Would push migration 202608260131_flight_consumer_terminal_recovery_safety.sql",
        "Would push migration 202608260132_flight_consumer_capture_attestation_gate.sql",
        "Would push migration 202608260133_flight_consumer_completion_lease_qualification_repair.sql",
        "Would push migration 202608260134_flight_consumer_duffel_claim_evidence_column_repair.sql",
        "Would push migration 202608260135_flight_consumer_completion_lease_recovery.sql",
        "Would push migration 202608260136_flight_consumer_terminal_offer_evidence_recovery.sql",
        "Would push migration 202608260137_flight_consumer_terminal_offer_local_identity.sql",
        "Would push migration 202608260138_flight_ticket_document_identity_scope_repair.sql",
      ].join("\n"),
      migrationList(requiredRemotePredecessorVersions),
      "applied",
      migrationList(repositoryVersions),
      physicalSchemaDump(),
    ];
    const logged: unknown[] = [];
    const summary = applyFlightPreviewMigrations({
      env: previewEnv,
      argv: [APPLY_CONFIRMATION_FLAG],
      runner: (args: string[]) => {
        calls.push(args);
        return outputs[calls.length - 1];
      },
      log: (value: unknown) => logged.push(value),
    });

    const dbUrlArgs = ["--db-url", cliPreviewUrl];
    expect(calls).toEqual([
      ["migration", "list", ...dbUrlArgs],
      ["db", "push", ...dbUrlArgs, "--dry-run"],
      ["migration", "list", ...dbUrlArgs],
      ["db", "push", ...dbUrlArgs, "--yes"],
      ["migration", "list", ...dbUrlArgs],
      ["db", "dump", ...dbUrlArgs, "--schema", "public"],
    ]);
    expect(summary).toMatchObject({
      mode: "apply",
      applied: true,
      pendingBefore: pinnedPlan.flightVersions,
      pendingAfter: [],
      physicalSchemaBoundaryVerified: true,
    });
    const rendered = JSON.stringify(logged);
    expect(rendered).not.toContain(previewUrl);
    expect(rendered).not.toContain(previewPassword);
    expect(JSON.stringify(calls)).not.toContain(previewPassword);
  });

  it("applies only migrations 126 through 138 when the exact through-125 prefix is installed", () => {
    const calls: string[][] = [];
    const through125 = [
      ...requiredRemotePredecessorVersions,
      ...pinnedPlan.flightVersions.slice(0, 6),
    ];
    const outputs = [
      migrationList(through125),
      [
        "Would push migration 202608260126_flight_consumer_capture_projection_repair.sql",
        "Would push migration 202608260127_flight_consumer_order_ambiguity_semantics_repair.sql",
        "Would push migration 202608260128_flight_consumer_order_recovery_hardening.sql",
        "Would push migration 202608260129_flight_consumer_duffel_pending_webhook_link.sql",
        "Would push migration 202608260130_flight_consumer_completion_lease.sql",
        "Would push migration 202608260131_flight_consumer_terminal_recovery_safety.sql",
        "Would push migration 202608260132_flight_consumer_capture_attestation_gate.sql",
        "Would push migration 202608260133_flight_consumer_completion_lease_qualification_repair.sql",
        "Would push migration 202608260134_flight_consumer_duffel_claim_evidence_column_repair.sql",
        "Would push migration 202608260135_flight_consumer_completion_lease_recovery.sql",
        "Would push migration 202608260136_flight_consumer_terminal_offer_evidence_recovery.sql",
        "Would push migration 202608260137_flight_consumer_terminal_offer_local_identity.sql",
        "Would push migration 202608260138_flight_ticket_document_identity_scope_repair.sql",
      ].join("\n"),
      migrationList(through125),
      "applied",
      migrationList(repositoryVersions),
      physicalSchemaDump(),
    ];
    const summary = applyFlightPreviewMigrations({
      env: previewEnv,
      argv: [APPLY_CONFIRMATION_FLAG],
      runner: (args: string[]) => {
        calls.push(args);
        return outputs[calls.length - 1];
      },
      log: () => undefined,
    });
    expect(calls.some((args) => args.includes("--yes"))).toBe(true);
    expect(summary).toMatchObject({
      applied: true,
      pendingBefore: [
        "202608260126", "202608260127", "202608260128",
        "202608260129", "202608260130",
        "202608260131", "202608260132", "202608260133",
        "202608260134", "202608260135", "202608260136",
        "202608260137", "202608260138",
      ],
      pendingAfter: [],
      physicalSchemaBoundaryVerified: true,
    });
  });

  it("does not push when all pinned migrations are installed, but still verifies the schema", () => {
    const calls: string[][] = [];
    const summary = applyFlightPreviewMigrations({
      env: previewEnv,
      argv: [APPLY_CONFIRMATION_FLAG],
      runner: (args: string[]) => {
        calls.push(args);
        return calls.length === 1 ? migrationList(repositoryVersions) : physicalSchemaDump();
      },
      log: () => undefined,
    });
    expect(calls.map((args) => args.slice(0, 2))).toEqual([
      ["migration", "list"],
      ["db", "dump"],
    ]);
    expect(summary).toMatchObject({ applied: false, pendingBefore: [], pendingAfter: [] });
  });

  it("rechecks the ledger after dry-run and skips a redundant concurrent push", () => {
    const calls: string[][] = [];
    const outputs = [
      migrationList(requiredRemotePredecessorVersions),
      [
        "Would push migration 202608260120_flight_consumer_webhook_operational_escalation.sql",
        "Would push migration 202608260121_flight_consumer_activation_cas_qualification.sql",
        "Would push migration 202608260122_flight_consumer_relock_settlement_constraint.sql",
        "Would push migration 202608260123_flight_consumer_search_repair.sql",
        "Would push migration 202608260124_flight_consumer_ciphertext_validation_repair.sql",
        "Would push migration 202608260125_flight_consumer_reprice_projection_repair.sql",
        "Would push migration 202608260126_flight_consumer_capture_projection_repair.sql",
        "Would push migration 202608260127_flight_consumer_order_ambiguity_semantics_repair.sql",
        "Would push migration 202608260128_flight_consumer_order_recovery_hardening.sql",
        "Would push migration 202608260129_flight_consumer_duffel_pending_webhook_link.sql",
        "Would push migration 202608260130_flight_consumer_completion_lease.sql",
        "Would push migration 202608260131_flight_consumer_terminal_recovery_safety.sql",
        "Would push migration 202608260132_flight_consumer_capture_attestation_gate.sql",
        "Would push migration 202608260133_flight_consumer_completion_lease_qualification_repair.sql",
        "Would push migration 202608260134_flight_consumer_duffel_claim_evidence_column_repair.sql",
        "Would push migration 202608260135_flight_consumer_completion_lease_recovery.sql",
        "Would push migration 202608260136_flight_consumer_terminal_offer_evidence_recovery.sql",
        "Would push migration 202608260137_flight_consumer_terminal_offer_local_identity.sql",
        "Would push migration 202608260138_flight_ticket_document_identity_scope_repair.sql",
      ].join("\n"),
      migrationList(repositoryVersions),
      physicalSchemaDump(),
    ];
    const summary = applyFlightPreviewMigrations({
      env: previewEnv,
      argv: [APPLY_CONFIRMATION_FLAG],
      runner: (args: string[]) => {
        calls.push(args);
        return outputs[calls.length - 1];
      },
      log: () => undefined,
    });
    expect(calls.some((args) => args.includes("--yes"))).toBe(false);
    expect(summary).toMatchObject({
      applied: false,
      pendingBefore: pinnedPlan.flightVersions,
      pendingAfter: [],
      physicalSchemaBoundaryVerified: true,
    });
  });

  it("uses a fixed Supabase executable with shell execution disabled", () => {
    const source = readFileSync("scripts/apply-flight-preview-migrations.mjs", "utf8");
    expect(source).toContain('spawnSync("supabase", args');
    expect(source).toContain("cwd: REPOSITORY_ROOT_PATH");
    expect(source).toContain("shell: false");
    expect(source).not.toContain("SUPABASE_CLI_PATH");
    expect(source).not.toContain("execSync(");
    expect(source).not.toContain("execFileSync(");
    expect(source).not.toContain("execFile(");
  });
});
