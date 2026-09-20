begin;

-- Forward-only Consumer Preview control plane and recovery contracts. This
-- migration is incapable of authorizing Production or live provider traffic.
do $flight_consumer_preview_076_dependencies$
begin
  if to_regclass('public.flight_consumer_webhook_ledger') is null
    or to_regclass('public.flight_payment_operation_attempts') is null
    or to_regclass('public.flight_payment_refund_evidence') is null
    or to_regprocedure(
      'public.get_flight_consumer_preview_runtime_authority_v1()'
    ) is null
    or to_regprocedure(
      'public.get_flight_consumer_duffel_order_recovery_v1(uuid,uuid)'
    ) is null then
    raise exception 'Flight Consumer Preview control plane requires migrations 068 through 075';
  end if;
  if to_regprocedure('extensions.digest(bytea,text)') is null then
    raise exception 'Flight Consumer Preview control plane requires reviewed SHA-256 support';
  end if;
end;
$flight_consumer_preview_076_dependencies$;

-- Return the SHA-256 receipt of the exact current runtime-control row. The
-- helper refuses a control row without a field-for-field append-only receipt.
create function public.flight_current_runtime_control_receipt_sha256_v1()
returns text
language plpgsql
volatile
security definer
set search_path = pg_catalog, public, extensions
as $flight_current_runtime_control_receipt_sha256$
declare
  v_control public.flight_runtime_controls;
  v_receipt public.flight_runtime_control_receipts;
begin
  select * into v_control
    from public.flight_runtime_controls as control
   where control.control_key = 'global';
  if not found then
    raise exception 'Flight runtime control is unavailable';
  end if;
  select receipt.* into v_receipt
    from public.flight_runtime_control_receipts as receipt
   where receipt.control_key = v_control.control_key
     and receipt.changed_by = v_control.updated_by
     and receipt.changed_at = v_control.updated_at
     and receipt.activation_evidence_sha256 = v_control.activation_evidence_sha256
     and receipt.execution_kill_switch_engaged = v_control.execution_kill_switch_engaged
     and receipt.synthetic_execution_enabled = v_control.synthetic_execution_enabled
     and receipt.provider_sandbox_traffic_enabled
       = v_control.provider_sandbox_traffic_enabled
     and receipt.provider_live_traffic_enabled = v_control.provider_live_traffic_enabled
     and receipt.shopping_enabled = v_control.shopping_enabled
     and receipt.order_enabled = v_control.order_enabled
     and receipt.payment_enabled = v_control.payment_enabled
     and receipt.ticketing_enabled = v_control.ticketing_enabled
     and receipt.servicing_enabled = v_control.servicing_enabled
     and receipt.provider_events_enabled = v_control.provider_events_enabled
     and receipt.production_release_enabled = v_control.production_release_enabled
     and receipt.bound_environment is not distinct from v_control.bound_environment
     and receipt.bound_project_ref is not distinct from v_control.bound_project_ref
     and receipt.bound_database_name is not distinct from v_control.bound_database_name
     and receipt.bound_session_user is not distinct from v_control.bound_session_user
     and receipt.bound_provider_code is not distinct from v_control.bound_provider_code
     and receipt.bound_provider_account_sha256
       is not distinct from v_control.bound_provider_account_sha256
     and receipt.bound_point_of_sale is not distinct from v_control.bound_point_of_sale
     and receipt.bound_content_scope_sha256
       is not distinct from v_control.bound_content_scope_sha256
     and receipt.bound_adapter_version_sha256
       is not distinct from v_control.bound_adapter_version_sha256
     and receipt.bound_payment_processor_code
       is not distinct from v_control.bound_payment_processor_code
     and receipt.bound_payment_account_sha256
       is not distinct from v_control.bound_payment_account_sha256
     and receipt.bound_payment_environment
       is not distinct from v_control.bound_payment_environment
     and receipt.bound_payment_source_sha256
       is not distinct from v_control.bound_payment_source_sha256
     and receipt.bound_payment_adapter_version_sha256
       is not distinct from v_control.bound_payment_adapter_version_sha256
     and receipt.bound_provider_settlement_processor_code
       is not distinct from v_control.bound_provider_settlement_processor_code
     and receipt.bound_provider_settlement_account_sha256
       is not distinct from v_control.bound_provider_settlement_account_sha256
     and receipt.bound_provider_settlement_environment
       is not distinct from v_control.bound_provider_settlement_environment
     and receipt.bound_provider_settlement_source_sha256
       is not distinct from v_control.bound_provider_settlement_source_sha256
     and receipt.bound_provider_settlement_adapter_version_sha256
       is not distinct from v_control.bound_provider_settlement_adapter_version_sha256
     and receipt.bound_execution_scope_sha256
       is not distinct from v_control.bound_execution_scope_sha256
   order by receipt.changed_at desc, receipt.id desc
   limit 1;
  if not found then
    raise exception 'Flight runtime control lacks an exact append-only receipt';
  end if;
  return encode(extensions.digest(convert_to(
    'iratepilot.flight.runtime-control-receipt.v1' || chr(10)
      || to_jsonb(v_receipt)::text,
    'UTF8'
  ), 'sha256'), 'hex');
end;
$flight_current_runtime_control_receipt_sha256$;

-- Derive the only Consumer Preview execution scope accepted by 076. The
-- caller supplies a canonical Stripe account digest only to this private
-- helper; public activation accepts the canonical acct_* value and hashes it.
create function public.flight_consumer_preview_target_scope_sha256_v1(
  p_payment_account_sha256 text
)
returns text
language plpgsql
stable
security definer
set search_path = pg_catalog, public, extensions
as $flight_consumer_preview_target_scope_sha256$
declare
  v_provider_account_sha256 text;
  v_content_scope_sha256 text;
  v_provider_adapter_sha256 text;
  v_payment_source_sha256 text;
  v_payment_adapter_sha256 text;
  v_settlement_account_sha256 text;
  v_settlement_source_sha256 text;
  v_settlement_adapter_sha256 text;
begin
  if p_payment_account_sha256 is null
    or p_payment_account_sha256 !~ '^[0-9a-f]{64}$' then
    raise exception 'Flight Consumer Preview payment account digest is invalid';
  end if;
  v_provider_account_sha256 := encode(extensions.digest(convert_to(
    'duffel-test-account:acc_0000B9iZ8kto4H8uYhKSzO', 'UTF8'
  ), 'sha256'), 'hex');
  v_content_scope_sha256 := encode(extensions.digest(convert_to(
    'duffel-test-zz-usd-adult-v1', 'UTF8'
  ), 'sha256'), 'hex');
  v_provider_adapter_sha256 := encode(extensions.digest(convert_to(
    'iratepilot-duffel-preview-adapter-v1', 'UTF8'
  ), 'sha256'), 'hex');
  v_payment_source_sha256 := encode(extensions.digest(convert_to(
    'stripe-payment-intents:test:manual-capture:v1', 'UTF8'
  ), 'sha256'), 'hex');
  v_payment_adapter_sha256 := encode(extensions.digest(convert_to(
    'iratepilot-flight-consumer-preview-stripe-adapter-v1', 'UTF8'
  ), 'sha256'), 'hex');
  v_settlement_account_sha256 := encode(extensions.digest(convert_to(
    'duffel-test-balance:acc_0000B9iZ8kto4H8uYhKSzO', 'UTF8'
  ), 'sha256'), 'hex');
  v_settlement_source_sha256 := encode(extensions.digest(convert_to(
    'duffel-provider-balance:test:v1', 'UTF8'
  ), 'sha256'), 'hex');
  v_settlement_adapter_sha256 := encode(extensions.digest(convert_to(
    'iratepilot-duffel-balance-adapter-v1', 'UTF8'
  ), 'sha256'), 'hex');
  return encode(extensions.digest(convert_to(
    'iratepilot.flight.consumer-preview.execution-scope.v1' || chr(10)
      || jsonb_build_object(
        'bound_environment', 'preview',
        'bound_project_ref', 'eiqmdldjnedqgbtoozqa',
        'bound_database_name', 'postgres',
        'bound_session_user', 'authenticator',
        'bound_provider_code', 'duffel',
        'bound_provider_account_sha256', v_provider_account_sha256,
        'bound_point_of_sale', 'US',
        'bound_content_scope_sha256', v_content_scope_sha256,
        'bound_adapter_version_sha256', v_provider_adapter_sha256,
        'bound_payment_processor_code', 'stripe',
        'bound_payment_account_sha256', p_payment_account_sha256,
        'bound_payment_environment', 'test',
        'bound_payment_source_sha256', v_payment_source_sha256,
        'bound_payment_adapter_version_sha256', v_payment_adapter_sha256,
        'bound_provider_settlement_processor_code', 'duffel_balance',
        'bound_provider_settlement_account_sha256', v_settlement_account_sha256,
        'bound_provider_settlement_environment', 'test',
        'bound_provider_settlement_source_sha256', v_settlement_source_sha256,
        'bound_provider_settlement_adapter_version_sha256', v_settlement_adapter_sha256
      )::text,
    'UTF8'
  ), 'sha256'), 'hex');
end;
$flight_consumer_preview_target_scope_sha256$;

create function public.flight_consumer_preview_control_is_bound_v1(
  p_execution_scope_sha256 text
)
returns boolean
language plpgsql
stable
security definer
set search_path = pg_catalog, public, extensions
as $flight_consumer_preview_control_is_bound$
declare
  v_control public.flight_runtime_controls;
begin
  select * into v_control from public.flight_runtime_controls
   where control_key = 'global';
  return coalesce(found
    and current_database()::text = 'postgres'
    and session_user::text = 'authenticator'
    and v_control.bound_environment = 'preview'
    and v_control.bound_project_ref = 'eiqmdldjnedqgbtoozqa'
    and v_control.bound_database_name = 'postgres'
    and v_control.bound_session_user = 'authenticator'
    and v_control.bound_provider_code = 'duffel'
    and v_control.bound_provider_account_sha256 = encode(extensions.digest(convert_to(
      'duffel-test-account:acc_0000B9iZ8kto4H8uYhKSzO', 'UTF8'
    ), 'sha256'), 'hex')
    and v_control.bound_point_of_sale = 'US'
    and v_control.bound_content_scope_sha256 = encode(extensions.digest(convert_to(
      'duffel-test-zz-usd-adult-v1', 'UTF8'
    ), 'sha256'), 'hex')
    and v_control.bound_adapter_version_sha256 = encode(extensions.digest(convert_to(
      'iratepilot-duffel-preview-adapter-v1', 'UTF8'
    ), 'sha256'), 'hex')
    and v_control.bound_payment_processor_code = 'stripe'
    and v_control.bound_payment_environment = 'test'
    and v_control.bound_payment_account_sha256 ~ '^[0-9a-f]{64}$'
    and v_control.bound_payment_source_sha256 = encode(extensions.digest(convert_to(
      'stripe-payment-intents:test:manual-capture:v1', 'UTF8'
    ), 'sha256'), 'hex')
    and v_control.bound_payment_adapter_version_sha256 = encode(extensions.digest(convert_to(
      'iratepilot-flight-consumer-preview-stripe-adapter-v1', 'UTF8'
    ), 'sha256'), 'hex')
    and v_control.bound_provider_settlement_processor_code = 'duffel_balance'
    and v_control.bound_provider_settlement_environment = 'test'
    and v_control.bound_provider_settlement_account_sha256 = encode(extensions.digest(convert_to(
      'duffel-test-balance:acc_0000B9iZ8kto4H8uYhKSzO', 'UTF8'
    ), 'sha256'), 'hex')
    and v_control.bound_provider_settlement_source_sha256 = encode(extensions.digest(convert_to(
      'duffel-provider-balance:test:v1', 'UTF8'
    ), 'sha256'), 'hex')
    and v_control.bound_provider_settlement_adapter_version_sha256 = encode(extensions.digest(convert_to(
      'iratepilot-duffel-balance-adapter-v1', 'UTF8'
    ), 'sha256'), 'hex')
    and not v_control.provider_live_traffic_enabled
    and not v_control.production_release_enabled
    and v_control.bound_execution_scope_sha256 = p_execution_scope_sha256
    and p_execution_scope_sha256 = public.flight_consumer_preview_target_scope_sha256_v1(
      v_control.bound_payment_account_sha256
    ), false);
end;
$flight_consumer_preview_control_is_bound$;

create function public.activate_flight_consumer_preview_v1(
  p_expected_updated_at timestamptz,
  p_expected_execution_scope_sha256 text,
  p_expected_activation_evidence_sha256 text,
  p_expected_runtime_control_receipt_sha256 text,
  p_stripe_account_id text,
  p_activation_packet_sha256 text,
  p_activation_nonce text
)
returns table (
  decision text,
  control_key text,
  updated_at timestamptz,
  bound_execution_scope_sha256 text,
  activation_evidence_sha256 text,
  runtime_control_receipt_sha256 text
)
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $activate_flight_consumer_preview$
declare
  v_actor uuid;
  v_control public.flight_runtime_controls;
  v_payment_account_sha256 text;
  v_scope_sha256 text;
  v_activation_evidence_sha256 text;
  v_current_receipt_sha256 text;
  v_new_receipt_sha256 text;
  v_provider_account_sha256 text;
  v_content_scope_sha256 text;
  v_provider_adapter_sha256 text;
  v_payment_source_sha256 text;
  v_payment_adapter_sha256 text;
  v_settlement_account_sha256 text;
  v_settlement_source_sha256 text;
  v_settlement_adapter_sha256 text;
  v_is_v8_predecessor boolean;
  v_is_target_predecessor boolean;
begin
  if coalesce(auth.role(), '') <> 'authenticated' or auth.uid() is null then
    raise exception 'Flight Consumer Preview activation requires an authenticated administrator';
  end if;
  v_actor := auth.uid();
  if not exists (select 1 from public.profiles where id = v_actor and role = 'admin') then
    raise exception 'Flight Consumer Preview activation requires an authenticated administrator';
  end if;
  if current_database()::text <> 'postgres' or session_user::text <> 'authenticator' then
    raise exception 'Flight Consumer Preview activation target is not the exact Preview API database';
  end if;
  if p_expected_updated_at is null
    or p_expected_execution_scope_sha256 is null
    or p_expected_execution_scope_sha256 !~ '^[0-9a-f]{64}$'
    or p_expected_activation_evidence_sha256 is null
    or p_expected_activation_evidence_sha256 !~ '^[0-9a-f]{64}$'
    or p_expected_runtime_control_receipt_sha256 is null
    or p_expected_runtime_control_receipt_sha256 !~ '^[0-9a-f]{64}$'
    or p_stripe_account_id is null
    or p_stripe_account_id !~ '^acct_[A-Za-z0-9]{8,64}$'
    or p_activation_packet_sha256 is null
    or p_activation_packet_sha256 !~ '^[0-9a-f]{64}$'
    or p_activation_nonce is null
    or p_activation_nonce !~ '^[A-Za-z0-9_-]{16,128}$' then
    raise exception 'Flight Consumer Preview activation packet is invalid';
  end if;
  select * into v_control from public.flight_runtime_controls as control
   where control.control_key = 'global' for update;
  if not found then raise exception 'Flight runtime control is unavailable'; end if;
  v_current_receipt_sha256 := public.flight_current_runtime_control_receipt_sha256_v1();
  if v_control.updated_at is distinct from p_expected_updated_at
    or v_control.bound_execution_scope_sha256
      is distinct from p_expected_execution_scope_sha256
    or v_control.activation_evidence_sha256
      is distinct from p_expected_activation_evidence_sha256
    or v_current_receipt_sha256 is distinct from p_expected_runtime_control_receipt_sha256 then
    raise exception 'Flight Consumer Preview activation predecessor CAS failed';
  end if;
  if not v_control.execution_kill_switch_engaged
    or v_control.synthetic_execution_enabled
    or v_control.provider_sandbox_traffic_enabled
    or v_control.provider_live_traffic_enabled
    or v_control.shopping_enabled or v_control.order_enabled
    or v_control.payment_enabled or v_control.ticketing_enabled
    or v_control.servicing_enabled or v_control.provider_events_enabled
    or v_control.production_release_enabled
    or v_control.bound_environment is distinct from 'preview'
    or v_control.bound_project_ref is distinct from 'eiqmdldjnedqgbtoozqa'
    or v_control.bound_database_name is distinct from 'postgres'
    or v_control.bound_session_user is distinct from 'authenticator'
    or v_control.bound_provider_code is distinct from 'duffel'
    or v_control.bound_point_of_sale is distinct from 'US' then
    raise exception 'Flight Consumer Preview activation requires the exact locked Preview predecessor';
  end if;
  v_provider_account_sha256 := encode(extensions.digest(convert_to(
    'duffel-test-account:acc_0000B9iZ8kto4H8uYhKSzO', 'UTF8'
  ), 'sha256'), 'hex');
  v_content_scope_sha256 := encode(extensions.digest(convert_to(
    'duffel-test-zz-usd-adult-v1', 'UTF8'
  ), 'sha256'), 'hex');
  v_provider_adapter_sha256 := encode(extensions.digest(convert_to(
    'iratepilot-duffel-preview-adapter-v1', 'UTF8'
  ), 'sha256'), 'hex');
  v_payment_account_sha256 := encode(extensions.digest(
    convert_to(p_stripe_account_id, 'UTF8'), 'sha256'
  ), 'hex');
  v_payment_source_sha256 := encode(extensions.digest(convert_to(
    'stripe-payment-intents:test:manual-capture:v1', 'UTF8'
  ), 'sha256'), 'hex');
  v_payment_adapter_sha256 := encode(extensions.digest(convert_to(
    'iratepilot-flight-consumer-preview-stripe-adapter-v1', 'UTF8'
  ), 'sha256'), 'hex');
  v_settlement_account_sha256 := encode(extensions.digest(convert_to(
    'duffel-test-balance:acc_0000B9iZ8kto4H8uYhKSzO', 'UTF8'
  ), 'sha256'), 'hex');
  v_settlement_source_sha256 := encode(extensions.digest(convert_to(
    'duffel-provider-balance:test:v1', 'UTF8'
  ), 'sha256'), 'hex');
  v_settlement_adapter_sha256 := encode(extensions.digest(convert_to(
    'iratepilot-duffel-balance-adapter-v1', 'UTF8'
  ), 'sha256'), 'hex');
  v_scope_sha256 := public.flight_consumer_preview_target_scope_sha256_v1(
    v_payment_account_sha256
  );
  v_is_v8_predecessor :=
    v_control.bound_provider_account_sha256 = v_provider_account_sha256
    and v_control.bound_content_scope_sha256 = v_content_scope_sha256
    and v_control.bound_adapter_version_sha256 = v_provider_adapter_sha256
    and v_control.bound_payment_processor_code = 'duffel_balance'
    and v_control.bound_payment_account_sha256 = v_settlement_account_sha256
    and v_control.bound_payment_environment = 'test'
    and v_control.bound_payment_source_sha256 = v_settlement_source_sha256
    and v_control.bound_payment_adapter_version_sha256 = v_settlement_adapter_sha256
    and v_control.bound_provider_settlement_processor_code is null
    and v_control.bound_provider_settlement_account_sha256 is null
    and v_control.bound_provider_settlement_environment is null
    and v_control.bound_provider_settlement_source_sha256 is null
    and v_control.bound_provider_settlement_adapter_version_sha256 is null
    and v_control.bound_execution_scope_sha256
      = '507b96b7d08058645d2c9717338c9b87cf09f836e5b78bc31ae19dfc977fad4b';
  v_is_target_predecessor :=
    v_control.bound_provider_account_sha256 = v_provider_account_sha256
    and v_control.bound_content_scope_sha256 = v_content_scope_sha256
    and v_control.bound_adapter_version_sha256 = v_provider_adapter_sha256
    and v_control.bound_payment_processor_code = 'stripe'
    and v_control.bound_payment_account_sha256 = v_payment_account_sha256
    and v_control.bound_payment_environment = 'test'
    and v_control.bound_payment_source_sha256 = v_payment_source_sha256
    and v_control.bound_payment_adapter_version_sha256 = v_payment_adapter_sha256
    and v_control.bound_provider_settlement_processor_code = 'duffel_balance'
    and v_control.bound_provider_settlement_account_sha256 = v_settlement_account_sha256
    and v_control.bound_provider_settlement_environment = 'test'
    and v_control.bound_provider_settlement_source_sha256 = v_settlement_source_sha256
    and v_control.bound_provider_settlement_adapter_version_sha256
      = v_settlement_adapter_sha256
    and v_control.bound_execution_scope_sha256 = v_scope_sha256;
  if not coalesce(v_is_v8_predecessor, false)
    and not coalesce(v_is_target_predecessor, false) then
    raise exception 'Flight Consumer Preview locked predecessor binding is not canonical';
  end if;
  v_activation_evidence_sha256 := encode(extensions.digest(convert_to(
    'iratepilot.flight.consumer-preview.activation-evidence.v1' || chr(10)
      || jsonb_build_object(
        'actor_id', v_actor::text,
        'activation_packet_sha256', p_activation_packet_sha256,
        'activation_nonce_sha256', encode(extensions.digest(
          convert_to(p_activation_nonce, 'UTF8'), 'sha256'
        ), 'hex'),
        'previous_activation_evidence_sha256', p_expected_activation_evidence_sha256,
        'previous_runtime_control_receipt_sha256',
          p_expected_runtime_control_receipt_sha256,
        'target_execution_scope_sha256', v_scope_sha256,
        'migration_074_sha256',
          'c5cf8ace2562332255758736970a022bced59c76867b1b71ce7703f12bb7bb98',
        'migration_075_sha256',
          '6d558fb287fb8ef863a031a3bcd0e9a91602405f16bba660814b4a7b12486ccb'
      )::text,
    'UTF8'
  ), 'sha256'), 'hex');
  if v_activation_evidence_sha256 = v_control.activation_evidence_sha256 then
    raise exception 'Flight Consumer Preview activation evidence must be fresh';
  end if;
  update public.flight_runtime_controls
     set execution_kill_switch_engaged = false,
         synthetic_execution_enabled = false,
         provider_sandbox_traffic_enabled = true,
         provider_live_traffic_enabled = false,
         shopping_enabled = true,
         order_enabled = true,
         payment_enabled = true,
         ticketing_enabled = true,
         servicing_enabled = false,
         provider_events_enabled = true,
         production_release_enabled = false,
         bound_environment = 'preview',
         bound_project_ref = 'eiqmdldjnedqgbtoozqa',
         bound_database_name = 'postgres',
         bound_session_user = 'authenticator',
         bound_provider_code = 'duffel',
         bound_provider_account_sha256 = v_provider_account_sha256,
         bound_point_of_sale = 'US',
         bound_content_scope_sha256 = v_content_scope_sha256,
         bound_adapter_version_sha256 = v_provider_adapter_sha256,
         bound_payment_processor_code = 'stripe',
         bound_payment_account_sha256 = v_payment_account_sha256,
         bound_payment_environment = 'test',
         bound_payment_source_sha256 = v_payment_source_sha256,
         bound_payment_adapter_version_sha256 = v_payment_adapter_sha256,
         bound_provider_settlement_processor_code = 'duffel_balance',
         bound_provider_settlement_account_sha256 = v_settlement_account_sha256,
         bound_provider_settlement_environment = 'test',
         bound_provider_settlement_source_sha256 = v_settlement_source_sha256,
         bound_provider_settlement_adapter_version_sha256 = v_settlement_adapter_sha256,
         bound_execution_scope_sha256 = v_scope_sha256,
         activation_evidence_sha256 = v_activation_evidence_sha256,
         updated_by = v_actor
   where flight_runtime_controls.control_key = 'global'
     and flight_runtime_controls.updated_at = p_expected_updated_at
  returning * into v_control;
  if not found then raise exception 'Flight Consumer Preview activation CAS failed'; end if;
  v_new_receipt_sha256 := public.flight_current_runtime_control_receipt_sha256_v1();
  return query select 'activated'::text, v_control.control_key,
    v_control.updated_at, v_control.bound_execution_scope_sha256,
    v_control.activation_evidence_sha256, v_new_receipt_sha256;
end;
$activate_flight_consumer_preview$;

create function public.relock_flight_consumer_preview_v1(
  p_expected_updated_at timestamptz,
  p_expected_execution_scope_sha256 text,
  p_expected_activation_evidence_sha256 text,
  p_expected_runtime_control_receipt_sha256 text,
  p_relock_packet_sha256 text,
  p_relock_nonce text
)
returns table (
  decision text,
  control_key text,
  updated_at timestamptz,
  bound_execution_scope_sha256 text,
  activation_evidence_sha256 text,
  runtime_control_receipt_sha256 text
)
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $relock_flight_consumer_preview$
declare
  v_actor uuid;
  v_control public.flight_runtime_controls;
  v_current_receipt_sha256 text;
  v_relock_evidence_sha256 text;
  v_new_receipt_sha256 text;
begin
  if coalesce(auth.role(), '') <> 'authenticated' or auth.uid() is null then
    raise exception 'Flight Consumer Preview relock requires an authenticated administrator';
  end if;
  v_actor := auth.uid();
  if not exists (select 1 from public.profiles where id = v_actor and role = 'admin') then
    raise exception 'Flight Consumer Preview relock requires an authenticated administrator';
  end if;
  if p_expected_updated_at is null
    or p_expected_execution_scope_sha256 is null
    or p_expected_execution_scope_sha256 !~ '^[0-9a-f]{64}$'
    or p_expected_activation_evidence_sha256 is null
    or p_expected_activation_evidence_sha256 !~ '^[0-9a-f]{64}$'
    or p_expected_runtime_control_receipt_sha256 is null
    or p_expected_runtime_control_receipt_sha256 !~ '^[0-9a-f]{64}$'
    or p_relock_packet_sha256 is null
    or p_relock_packet_sha256 !~ '^[0-9a-f]{64}$'
    or p_relock_nonce is null
    or p_relock_nonce !~ '^[A-Za-z0-9_-]{16,128}$' then
    raise exception 'Flight Consumer Preview relock packet is invalid';
  end if;
  select * into v_control from public.flight_runtime_controls as control
   where control.control_key = 'global' for update;
  if not found then raise exception 'Flight runtime control is unavailable'; end if;
  v_current_receipt_sha256 := public.flight_current_runtime_control_receipt_sha256_v1();
  if v_control.updated_at is distinct from p_expected_updated_at
    or v_control.bound_execution_scope_sha256
      is distinct from p_expected_execution_scope_sha256
    or v_control.activation_evidence_sha256
      is distinct from p_expected_activation_evidence_sha256
    or v_current_receipt_sha256 is distinct from p_expected_runtime_control_receipt_sha256
    or not public.flight_consumer_preview_control_is_bound_v1(
      v_control.bound_execution_scope_sha256
    )
    or v_control.execution_kill_switch_engaged
    or v_control.synthetic_execution_enabled
    or not v_control.provider_sandbox_traffic_enabled
    or v_control.provider_live_traffic_enabled
    or not v_control.shopping_enabled or not v_control.order_enabled
    or not v_control.payment_enabled or not v_control.ticketing_enabled
    or v_control.servicing_enabled or not v_control.provider_events_enabled
    or v_control.production_release_enabled then
    raise exception 'Flight Consumer Preview relock predecessor CAS failed';
  end if;
  v_relock_evidence_sha256 := encode(extensions.digest(convert_to(
    'iratepilot.flight.consumer-preview.relock-evidence.v1' || chr(10)
      || jsonb_build_object(
        'actor_id', v_actor::text,
        'relock_packet_sha256', p_relock_packet_sha256,
        'relock_nonce_sha256', encode(extensions.digest(
          convert_to(p_relock_nonce, 'UTF8'), 'sha256'
        ), 'hex'),
        'previous_activation_evidence_sha256', p_expected_activation_evidence_sha256,
        'previous_runtime_control_receipt_sha256',
          p_expected_runtime_control_receipt_sha256,
        'preserved_execution_scope_sha256', p_expected_execution_scope_sha256
      )::text,
    'UTF8'
  ), 'sha256'), 'hex');
  if v_relock_evidence_sha256 = v_control.activation_evidence_sha256 then
    raise exception 'Flight Consumer Preview relock evidence must be fresh';
  end if;
  update public.flight_runtime_controls
     set execution_kill_switch_engaged = true,
         synthetic_execution_enabled = false,
         provider_sandbox_traffic_enabled = false,
         provider_live_traffic_enabled = false,
         shopping_enabled = false,
         order_enabled = false,
         payment_enabled = false,
         ticketing_enabled = false,
         servicing_enabled = false,
         provider_events_enabled = false,
         production_release_enabled = false,
         activation_evidence_sha256 = v_relock_evidence_sha256,
         updated_by = v_actor
   where flight_runtime_controls.control_key = 'global'
     and flight_runtime_controls.updated_at = p_expected_updated_at
  returning * into v_control;
  if not found then raise exception 'Flight Consumer Preview relock CAS failed'; end if;
  v_new_receipt_sha256 := public.flight_current_runtime_control_receipt_sha256_v1();
  return query select 'relocked'::text, v_control.control_key,
    v_control.updated_at, v_control.bound_execution_scope_sha256,
    v_control.activation_evidence_sha256, v_new_receipt_sha256;
end;
$relock_flight_consumer_preview$;

-- Correct the Duffel v2 event vocabulary before admitting new events. Existing
-- rows using the superseded local names require explicit operator review; they
-- are never silently rewritten as provider evidence.
do $flight_consumer_preview_duffel_event_upgrade$
declare
  v_constraint record;
begin
  if exists (
    select 1 from public.flight_consumer_webhook_ledger
     where source = 'duffel'
       and event_type not in (
         'order.created', 'order.creation_failed', 'air.order.changed',
         'order.airline_initiated_change_detected'
       )
  ) then
    raise exception 'Unrecognized legacy Duffel webhook evidence must be reviewed before 076';
  end if;
  for v_constraint in
    select constraint_name
      from information_schema.check_constraints
     where constraint_schema = 'public'
       and constraint_name in (
         select con.conname
           from pg_catalog.pg_constraint as con
          where con.conrelid = 'public.flight_consumer_webhook_ledger'::regclass
            and con.contype = 'c'
            and pg_catalog.pg_get_constraintdef(con.oid) like '%order.updated%'
       )
  loop
    execute format(
      'alter table public.flight_consumer_webhook_ledger drop constraint %I',
      v_constraint.constraint_name
    );
  end loop;
end;
$flight_consumer_preview_duffel_event_upgrade$;

alter table public.flight_consumer_webhook_ledger
  add constraint flight_consumer_webhook_event_type_v2_check check (
    event_type in (
      'payment_intent.requires_action',
      'payment_intent.amount_capturable_updated',
      'payment_intent.payment_failed',
      'payment_intent.canceled',
      'payment_intent.succeeded',
      'charge.refunded',
      'order.created',
      'order.creation_failed',
      'air.order.changed',
      'order.airline_initiated_change_detected'
    )
  ),
  add constraint flight_consumer_webhook_source_type_v2_check check (
    (source = 'stripe' and event_type in (
      'payment_intent.requires_action',
      'payment_intent.amount_capturable_updated',
      'payment_intent.payment_failed',
      'payment_intent.canceled',
      'payment_intent.succeeded',
      'charge.refunded'
    ))
    or (source = 'duffel' and event_type in (
      'order.created',
      'order.creation_failed',
      'air.order.changed',
      'order.airline_initiated_change_detected'
    ))
  );

alter table public.flight_consumer_webhook_ledger
  add column provider_offer_ref_sha256 text check (
    provider_offer_ref_sha256 is null
    or provider_offer_ref_sha256 ~ '^[0-9a-f]{64}$'
  ),
  add column provider_order_ref_sha256 text check (
    provider_order_ref_sha256 is null
    or provider_order_ref_sha256 ~ '^[0-9a-f]{64}$'
  ),
  add column provider_live_mode boolean,
  add column processing_lease_token_sha256 text check (
    processing_lease_token_sha256 is null
    or processing_lease_token_sha256 ~ '^[0-9a-f]{64}$'
  ),
  add column processing_lease_acquired_at timestamptz,
  add column processing_lease_expires_at timestamptz,
  add column processing_attempt_count integer not null default 0
    check (processing_attempt_count between 0 and 100),
  add column last_recovery_receipt_sha256 text check (
    last_recovery_receipt_sha256 is null
    or last_recovery_receipt_sha256 ~ '^[0-9a-f]{64}$'
  );

alter table public.flight_consumer_webhook_ledger
  add constraint flight_consumer_webhook_provider_identity_v2_check check (
    (source = 'stripe'
      and provider_offer_ref_sha256 is null
      and provider_order_ref_sha256 is null
      and provider_live_mode is null)
    or (source = 'duffel' and provider_live_mode is not true)
  ),
  add constraint flight_consumer_webhook_lease_v2_check check (
    (
      state = 'verified'
      and processing_attempt_count = 0
      and processing_lease_token_sha256 is null
      and processing_lease_acquired_at is null
      and processing_lease_expires_at is null
      and last_recovery_receipt_sha256 is null
    )
    or (
      state = 'processing'
      and (
        (
          processing_attempt_count = 0
          and processing_lease_token_sha256 is null
          and processing_lease_acquired_at is null
          and processing_lease_expires_at is null
          and last_recovery_receipt_sha256 is null
        )
        or (
          processing_attempt_count >= 1
          and processing_lease_token_sha256 is not null
          and processing_lease_acquired_at is not null
          and processing_lease_expires_at > processing_lease_acquired_at
          and processing_lease_acquired_at >= processing_started_at
          and (
            (processing_attempt_count = 1 and last_recovery_receipt_sha256 is null)
            or (processing_attempt_count > 1
              and last_recovery_receipt_sha256 is not null)
          )
        )
      )
    )
    or (
      state in ('processed', 'duplicate', 'blocked', 'failed')
      and (
        (
          processing_attempt_count = 0
          and processing_lease_token_sha256 is null
          and processing_lease_acquired_at is null
          and processing_lease_expires_at is null
          and last_recovery_receipt_sha256 is null
        )
        or (
          processing_attempt_count >= 1
          and processing_lease_token_sha256 is not null
          and processing_lease_acquired_at is not null
          and processing_lease_expires_at > processing_lease_acquired_at
          and (
            (processing_attempt_count = 1 and last_recovery_receipt_sha256 is null)
            or (processing_attempt_count > 1
              and last_recovery_receipt_sha256 is not null)
          )
        )
      )
    )
  );

create unique index flight_consumer_webhook_lease_token_uidx
  on public.flight_consumer_webhook_ledger (processing_lease_token_sha256)
  where processing_lease_token_sha256 is not null;

create index flight_consumer_webhook_lease_expiry_idx
  on public.flight_consumer_webhook_ledger (processing_lease_expires_at)
  where state = 'processing';

create or replace function public.protect_flight_consumer_webhook_ledger_v1()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $protect_flight_consumer_webhook_ledger_076$
begin
  if tg_op = 'DELETE' then
    raise exception 'Flight webhook ledger is append-preserving';
  end if;
  if to_jsonb(new) - array[
    'state', 'revision', 'processing_started_at', 'completed_at', 'outcome_sha256',
    'processing_lease_token_sha256', 'processing_lease_acquired_at',
    'processing_lease_expires_at', 'processing_attempt_count',
    'last_recovery_receipt_sha256'
  ] is distinct from to_jsonb(old) - array[
    'state', 'revision', 'processing_started_at', 'completed_at', 'outcome_sha256',
    'processing_lease_token_sha256', 'processing_lease_acquired_at',
    'processing_lease_expires_at', 'processing_attempt_count',
    'last_recovery_receipt_sha256'
  ] then
    raise exception 'Flight webhook verified identity is immutable';
  end if;
  if old.state = 'verified' and new.state = 'processing'
    and new.revision = old.revision + 1
    and new.processing_started_at is not null
    and new.completed_at is null and new.outcome_sha256 is null
    and (
      (
        new.processing_attempt_count = 0
        and new.processing_lease_token_sha256 is null
        and new.processing_lease_acquired_at is null
        and new.processing_lease_expires_at is null
        and new.last_recovery_receipt_sha256 is null
      )
      or (
        new.processing_attempt_count = 1
        and new.processing_lease_token_sha256 is not null
        and new.processing_lease_acquired_at is not null
        and new.processing_lease_expires_at > new.processing_lease_acquired_at
        and new.last_recovery_receipt_sha256 is null
      )
    ) then
    return new;
  end if;
  if old.state = 'processing' and new.state = 'processing'
    and new.revision = old.revision
    and new.processing_started_at = old.processing_started_at
    and new.completed_at is null and new.outcome_sha256 is null
    and new.processing_lease_token_sha256 is not null
    and new.processing_lease_token_sha256
      is distinct from old.processing_lease_token_sha256
    and new.processing_lease_acquired_at > coalesce(
      old.processing_lease_acquired_at, old.processing_started_at
    )
    and new.processing_lease_expires_at > new.processing_lease_acquired_at
    and new.processing_attempt_count = greatest(old.processing_attempt_count, 1) + 1
    and new.last_recovery_receipt_sha256 is not null
    and new.last_recovery_receipt_sha256
      is distinct from old.last_recovery_receipt_sha256
    and (
      old.processing_lease_expires_at <= clock_timestamp()
      or (
        old.processing_lease_expires_at is null
        and old.processing_started_at <= clock_timestamp() - interval '2 minutes'
      )
    ) then
    return new;
  end if;
  if old.state = 'processing'
    and new.state in ('processed', 'duplicate', 'blocked', 'failed')
    and new.revision = old.revision + 1
    and new.processing_started_at = old.processing_started_at
    and new.completed_at is not null and new.outcome_sha256 is not null
    and new.processing_lease_token_sha256
      is not distinct from old.processing_lease_token_sha256
    and new.processing_lease_acquired_at
      is not distinct from old.processing_lease_acquired_at
    and new.processing_lease_expires_at
      is not distinct from old.processing_lease_expires_at
    and new.processing_attempt_count = old.processing_attempt_count
    and new.last_recovery_receipt_sha256
      is not distinct from old.last_recovery_receipt_sha256 then
    return new;
  end if;
  raise exception 'Flight webhook transition is not authorized';
end;
$protect_flight_consumer_webhook_ledger_076$;

create or replace function public.record_flight_consumer_verified_webhook_v1(
  p_source text,
  p_event_id_sha256 text,
  p_idempotency_sha256 text,
  p_event_type text,
  p_payload_sha256 text,
  p_semantic_sha256 text,
  p_verification_receipt_sha256 text,
  p_occurred_at timestamptz,
  p_order_id uuid,
  p_payment_id uuid,
  p_provider_attempt_id uuid
)
returns table (decision text, ledger_id uuid, ledger_revision integer, ledger_state text)
language plpgsql
security definer
set search_path = pg_catalog, public
as $record_flight_consumer_verified_webhook_076$
declare
  v_scope text;
  v_order public.flight_orders;
  v_control public.flight_runtime_controls;
  v_existing public.flight_consumer_webhook_ledger;
  v_ledger public.flight_consumer_webhook_ledger;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Flight verified webhook ingress is service-role only';
  end if;
  if p_order_id is not null then
    select * into v_order from public.flight_orders where id = p_order_id for update;
  end if;
  select * into v_control from public.flight_runtime_controls
   where control_key = 'global' for update;
  v_scope := v_control.bound_execution_scope_sha256;
  perform public.assert_flight_consumer_preview_runtime_v1(v_scope, 'provider_event');
  if p_source not in ('stripe', 'duffel')
    or p_event_id_sha256 is null or p_event_id_sha256 !~ '^[0-9a-f]{64}$'
    or p_idempotency_sha256 is null or p_idempotency_sha256 !~ '^[0-9a-f]{64}$'
    or p_payload_sha256 is null or p_payload_sha256 !~ '^[0-9a-f]{64}$'
    or p_semantic_sha256 is null or p_semantic_sha256 !~ '^[0-9a-f]{64}$'
    or p_verification_receipt_sha256 is null
    or p_verification_receipt_sha256 !~ '^[0-9a-f]{64}$'
    or (p_source = 'stripe' and p_event_type not in (
      'payment_intent.requires_action', 'payment_intent.amount_capturable_updated',
      'payment_intent.payment_failed', 'payment_intent.canceled',
      'payment_intent.succeeded', 'charge.refunded'
    ))
    or (p_source = 'duffel' and p_event_type not in (
      'order.created', 'order.creation_failed', 'air.order.changed',
      'order.airline_initiated_change_detected'
    )) then
    raise exception 'Flight webhook verified digest envelope is invalid';
  end if;
  if p_order_id is not null and (
    v_order.id is null or v_order.execution_mode <> 'test'
    or v_order.execution_scope_sha256 <> v_scope
  ) then raise exception 'Flight webhook order link is outside Preview scope'; end if;
  if p_payment_id is not null and not exists (
    select 1 from public.flight_payments as payment
     where payment.id = p_payment_id
       and (p_order_id is null or payment.order_id = p_order_id)
       and payment.execution_mode = 'test'
       and payment.execution_scope_sha256 = v_scope
  ) then raise exception 'Flight webhook payment link does not match'; end if;
  if p_provider_attempt_id is not null and not exists (
    select 1 from public.flight_provider_request_attempts as attempt
     where attempt.id = p_provider_attempt_id
       and attempt.consumer_flow_version = 1
       and (p_order_id is null or attempt.order_id = p_order_id)
       and attempt.execution_mode = 'test'
       and attempt.execution_scope_sha256 = v_scope
  ) then raise exception 'Flight webhook provider-attempt link does not match'; end if;
  select * into v_existing from public.flight_consumer_webhook_ledger as ledger
   where ledger.execution_scope_sha256 = v_scope and ledger.source = p_source
     and (
       ledger.event_id_sha256 = p_event_id_sha256
       or ledger.idempotency_sha256 = p_idempotency_sha256
     )
   order by (ledger.event_id_sha256 = p_event_id_sha256) desc
   limit 1 for update;
  if found then
    if v_existing.event_type is distinct from p_event_type
      or v_existing.payload_sha256 is distinct from p_payload_sha256
      or v_existing.semantic_sha256 is distinct from p_semantic_sha256
      or v_existing.verification_receipt_sha256
        is distinct from p_verification_receipt_sha256
      or v_existing.order_id is distinct from p_order_id
      or v_existing.payment_id is distinct from p_payment_id
      or v_existing.provider_attempt_id is distinct from p_provider_attempt_id then
      raise exception 'Flight webhook event or idempotency digest collision';
    end if;
    return query select
      case when v_existing.event_id_sha256 = p_event_id_sha256
        then 'replay'::text else 'duplicate'::text end,
      v_existing.id, v_existing.revision, v_existing.state;
    return;
  end if;
  insert into public.flight_consumer_webhook_ledger (
    source, execution_mode, execution_scope_sha256, event_id_sha256,
    idempotency_sha256, event_type, payload_sha256, semantic_sha256,
    verification_receipt_sha256, order_id, payment_id, provider_attempt_id,
    state, revision, occurred_at
  ) values (
    p_source, 'test', v_scope, p_event_id_sha256, p_idempotency_sha256,
    p_event_type, p_payload_sha256, p_semantic_sha256,
    p_verification_receipt_sha256, p_order_id, p_payment_id,
    p_provider_attempt_id, 'verified', 0, p_occurred_at
  ) returning * into v_ledger;
  if p_order_id is not null then
    update public.flight_orders
       set updated_at = greatest(clock_timestamp(), updated_at + interval '1 microsecond')
     where id = p_order_id;
  end if;
  return query select 'created'::text, v_ledger.id, v_ledger.revision, v_ledger.state;
end;
$record_flight_consumer_verified_webhook_076$;

-- Preserve legacy v1 behavior only for a row claimed without a lease. Once a
-- stale row is reclaimed into the lease protocol, v1 completion cannot win.
create or replace function public.complete_flight_consumer_webhook_v1(
  p_ledger_id uuid,
  p_expected_revision integer,
  p_outcome text,
  p_outcome_sha256 text
)
returns table (ledger_id uuid, ledger_revision integer, ledger_state text)
language plpgsql
security definer
set search_path = pg_catalog, public
as $complete_flight_consumer_webhook_076$
declare
  v_order_id uuid;
  v_ledger public.flight_consumer_webhook_ledger;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Flight webhook completion is service-role only';
  end if;
  select ledger.order_id into v_order_id from public.flight_consumer_webhook_ledger ledger
   where ledger.id = p_ledger_id;
  if v_order_id is not null then
    perform 1 from public.flight_orders where id = v_order_id for update;
  end if;
  select * into v_ledger from public.flight_consumer_webhook_ledger
   where id = p_ledger_id for update;
  if v_ledger.id is null or v_ledger.state <> 'processing'
    or v_ledger.revision <> p_expected_revision
    or v_ledger.processing_lease_token_sha256 is not null
    or v_ledger.processing_attempt_count <> 0
    or p_outcome not in ('processed', 'duplicate', 'blocked', 'failed')
    or p_outcome_sha256 is null or p_outcome_sha256 !~ '^[0-9a-f]{64}$' then
    raise exception 'Flight webhook completion CAS failed';
  end if;
  perform public.assert_flight_consumer_preview_runtime_v1(
    v_ledger.execution_scope_sha256, 'provider_event'
  );
  update public.flight_consumer_webhook_ledger
     set state = p_outcome, revision = revision + 1,
         completed_at = clock_timestamp(), outcome_sha256 = p_outcome_sha256
   where id = v_ledger.id and state = 'processing'
     and revision = p_expected_revision
     and processing_lease_token_sha256 is null
  returning * into v_ledger;
  if not found then raise exception 'Flight webhook completion CAS failed'; end if;
  if v_order_id is not null then
    update public.flight_orders
       set updated_at = greatest(clock_timestamp(), updated_at + interval '1 microsecond')
     where id = v_order_id;
  end if;
  return query select v_ledger.id, v_ledger.revision, v_ledger.state;
end;
$complete_flight_consumer_webhook_076$;

create function public.claim_flight_consumer_webhook_lease_v1(
  p_ledger_id uuid,
  p_expected_revision integer,
  p_lease_token_sha256 text,
  p_lease_duration_seconds integer
)
returns table (
  ledger_id uuid,
  ledger_revision integer,
  ledger_state text,
  processing_lease_token_sha256 text,
  processing_lease_expires_at timestamptz,
  processing_attempt_count integer
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $claim_flight_consumer_webhook_lease$
declare
  v_order_id uuid;
  v_ledger public.flight_consumer_webhook_ledger;
  v_now timestamptz;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Flight webhook lease claim is service-role only';
  end if;
  if p_lease_token_sha256 is null or p_lease_token_sha256 !~ '^[0-9a-f]{64}$'
    or p_lease_duration_seconds is null
    or p_lease_duration_seconds not between 30 and 300 then
    raise exception 'Flight webhook lease claim is invalid';
  end if;
  select ledger.order_id into v_order_id from public.flight_consumer_webhook_ledger ledger
   where ledger.id = p_ledger_id;
  if v_order_id is not null then
    perform 1 from public.flight_orders where id = v_order_id for update;
  end if;
  select * into v_ledger from public.flight_consumer_webhook_ledger
   where id = p_ledger_id for update;
  if v_ledger.id is null or v_ledger.state <> 'verified'
    or v_ledger.revision <> p_expected_revision then
    raise exception 'Flight webhook lease claim CAS failed';
  end if;
  perform public.assert_flight_consumer_preview_runtime_v1(
    v_ledger.execution_scope_sha256, 'provider_event'
  );
  v_now := clock_timestamp();
  update public.flight_consumer_webhook_ledger
     set state = 'processing', revision = revision + 1,
         processing_started_at = v_now,
         processing_lease_token_sha256 = p_lease_token_sha256,
         processing_lease_acquired_at = v_now,
         processing_lease_expires_at = v_now
           + make_interval(secs => p_lease_duration_seconds),
         processing_attempt_count = 1
   where id = v_ledger.id and state = 'verified'
     and revision = p_expected_revision
  returning * into v_ledger;
  if not found then raise exception 'Flight webhook lease claim CAS failed'; end if;
  if v_order_id is not null then
    update public.flight_orders
       set updated_at = greatest(clock_timestamp(), updated_at + interval '1 microsecond')
     where id = v_order_id;
  end if;
  return query select v_ledger.id, v_ledger.revision, v_ledger.state,
    v_ledger.processing_lease_token_sha256,
    v_ledger.processing_lease_expires_at, v_ledger.processing_attempt_count;
end;
$claim_flight_consumer_webhook_lease$;

create function public.reclaim_flight_consumer_webhook_v1(
  p_ledger_id uuid,
  p_expected_revision integer,
  p_stale_before timestamptz,
  p_recovery_receipt_sha256 text,
  p_lease_token_sha256 text,
  p_lease_duration_seconds integer
)
returns table (
  ledger_id uuid,
  ledger_revision integer,
  ledger_state text,
  processing_lease_token_sha256 text,
  processing_lease_expires_at timestamptz,
  processing_attempt_count integer
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $reclaim_flight_consumer_webhook$
declare
  v_order_id uuid;
  v_ledger public.flight_consumer_webhook_ledger;
  v_now timestamptz;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Flight webhook reclaim is service-role only';
  end if;
  v_now := clock_timestamp();
  if p_expected_revision is distinct from 1
    or p_stale_before is null
    or p_stale_before > v_now - interval '2 minutes'
    or p_stale_before < v_now - interval '24 hours'
    or p_recovery_receipt_sha256 is null
    or p_recovery_receipt_sha256 !~ '^[0-9a-f]{64}$'
    or p_lease_token_sha256 is null or p_lease_token_sha256 !~ '^[0-9a-f]{64}$'
    or p_lease_duration_seconds is null
    or p_lease_duration_seconds not between 30 and 300 then
    raise exception 'Flight webhook reclaim envelope is invalid';
  end if;
  select ledger.order_id into v_order_id from public.flight_consumer_webhook_ledger ledger
   where ledger.id = p_ledger_id;
  if v_order_id is not null then
    perform 1 from public.flight_orders where id = v_order_id for update;
  end if;
  select * into v_ledger from public.flight_consumer_webhook_ledger
   where id = p_ledger_id for update;
  if v_ledger.id is null or v_ledger.state <> 'processing'
    or v_ledger.revision <> 1
    or coalesce(v_ledger.processing_lease_acquired_at, v_ledger.processing_started_at)
      > p_stale_before
    or (
      v_ledger.processing_lease_expires_at is not null
      and v_ledger.processing_lease_expires_at > v_now
    )
    or v_ledger.processing_lease_token_sha256 is not distinct from p_lease_token_sha256
    or v_ledger.last_recovery_receipt_sha256
      is not distinct from p_recovery_receipt_sha256 then
    raise exception 'Flight webhook reclaim CAS failed';
  end if;
  perform public.assert_flight_consumer_preview_runtime_v1(
    v_ledger.execution_scope_sha256, 'provider_event'
  );
  update public.flight_consumer_webhook_ledger as ledger
     set processing_lease_token_sha256 = p_lease_token_sha256,
         processing_lease_acquired_at = v_now,
         processing_lease_expires_at = v_now
           + make_interval(secs => p_lease_duration_seconds),
         processing_attempt_count = greatest(ledger.processing_attempt_count, 1) + 1,
         last_recovery_receipt_sha256 = p_recovery_receipt_sha256
   where ledger.id = v_ledger.id and ledger.state = 'processing'
     and ledger.revision = 1
     and coalesce(ledger.processing_lease_acquired_at, ledger.processing_started_at)
       <= p_stale_before
     and (ledger.processing_lease_expires_at is null
       or ledger.processing_lease_expires_at <= v_now)
  returning * into v_ledger;
  if not found then raise exception 'Flight webhook reclaim CAS failed'; end if;
  if v_order_id is not null then
    update public.flight_orders
       set updated_at = greatest(clock_timestamp(), updated_at + interval '1 microsecond')
     where id = v_order_id;
  end if;
  return query select v_ledger.id, v_ledger.revision, v_ledger.state,
    v_ledger.processing_lease_token_sha256,
    v_ledger.processing_lease_expires_at, v_ledger.processing_attempt_count;
end;
$reclaim_flight_consumer_webhook$;

create function public.complete_flight_consumer_webhook_lease_v1(
  p_ledger_id uuid,
  p_expected_revision integer,
  p_lease_token_sha256 text,
  p_outcome text,
  p_outcome_sha256 text
)
returns table (ledger_id uuid, ledger_revision integer, ledger_state text)
language plpgsql
security definer
set search_path = pg_catalog, public
as $complete_flight_consumer_webhook_lease$
declare
  v_order_id uuid;
  v_ledger public.flight_consumer_webhook_ledger;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Flight webhook lease completion is service-role only';
  end if;
  if p_expected_revision is distinct from 1
    or p_lease_token_sha256 is null or p_lease_token_sha256 !~ '^[0-9a-f]{64}$'
    or p_outcome not in ('processed', 'duplicate', 'blocked', 'failed')
    or p_outcome_sha256 is null or p_outcome_sha256 !~ '^[0-9a-f]{64}$' then
    raise exception 'Flight webhook lease completion envelope is invalid';
  end if;
  select ledger.order_id into v_order_id from public.flight_consumer_webhook_ledger ledger
   where ledger.id = p_ledger_id;
  if v_order_id is not null then
    perform 1 from public.flight_orders where id = v_order_id for update;
  end if;
  select * into v_ledger from public.flight_consumer_webhook_ledger
   where id = p_ledger_id for update;
  if v_ledger.id is null or v_ledger.state <> 'processing'
    or v_ledger.revision <> 1
    or v_ledger.processing_lease_token_sha256
      is distinct from p_lease_token_sha256 then
    raise exception 'Flight webhook lease completion CAS failed';
  end if;
  perform public.assert_flight_consumer_preview_runtime_v1(
    v_ledger.execution_scope_sha256, 'provider_event'
  );
  update public.flight_consumer_webhook_ledger
     set state = p_outcome, revision = 2, completed_at = clock_timestamp(),
         outcome_sha256 = p_outcome_sha256
   where id = v_ledger.id and state = 'processing' and revision = 1
     and processing_lease_token_sha256 = p_lease_token_sha256
  returning * into v_ledger;
  if not found then raise exception 'Flight webhook lease completion CAS failed'; end if;
  if v_order_id is not null then
    update public.flight_orders
       set updated_at = greatest(clock_timestamp(), updated_at + interval '1 microsecond')
     where id = v_order_id;
  end if;
  return query select v_ledger.id, v_ledger.revision, v_ledger.state;
end;
$complete_flight_consumer_webhook_lease$;

-- Narrow service-only recovery projections replace direct reads of relations
-- intentionally revoked from service_role in 075.
create function public.get_flight_consumer_completion_recovery_v1(
  p_customer_id uuid,
  p_order_id uuid
)
returns table (
  order_id uuid,
  customer_id uuid,
  order_status text,
  payment_id uuid,
  payment_status text,
  processor_reference_ciphertext text,
  processor_reference_sha256 text,
  amount_cents bigint,
  currency text,
  execution_scope_sha256 text
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $get_flight_consumer_completion_recovery$
declare
  v_order public.flight_orders;
  v_payment public.flight_payments;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Flight completion recovery is service-role only';
  end if;
  select * into v_order from public.flight_orders as flight_order
   where flight_order.id = p_order_id
     and flight_order.customer_id = p_customer_id
     and flight_order.consumer_flow_version = 1
     and flight_order.execution_mode = 'test'
     and flight_order.provider_code = 'duffel'
   for share;
  if not found then return; end if;
  perform public.assert_flight_consumer_preview_runtime_v1(
    v_order.execution_scope_sha256, 'order'
  );
  if (select count(*) from public.flight_payments as payment
       where payment.order_id = v_order.id
         and payment.execution_mode = 'test'
         and payment.execution_scope_sha256 = v_order.execution_scope_sha256
         and payment.processor_code = 'stripe') > 1 then
    raise exception 'Flight completion recovery has multiple customer payments';
  end if;
  select * into v_payment from public.flight_payments as payment
   where payment.order_id = v_order.id
     and payment.execution_mode = 'test'
     and payment.execution_scope_sha256 = v_order.execution_scope_sha256
     and payment.processor_code = 'stripe';
  return query select v_order.id, v_order.customer_id, v_order.status,
    v_payment.id, v_payment.status, v_payment.processor_reference_ciphertext,
    v_payment.processor_reference_sha256, v_order.total_cents,
    v_order.currency, v_order.execution_scope_sha256;
end;
$get_flight_consumer_completion_recovery$;

create function public.get_flight_consumer_refund_evidence_v1(
  p_customer_id uuid,
  p_order_id uuid
)
returns table (
  attempt_id uuid,
  order_id uuid,
  payment_id uuid,
  execution_mode text,
  execution_scope_sha256 text,
  refund_reference_sha256 text,
  refunded_cents bigint,
  terminal_receipt_sha256 text
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $get_flight_consumer_refund_evidence$
declare
  v_order public.flight_orders;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Flight refund evidence recovery is service-role only';
  end if;
  select * into v_order from public.flight_orders as flight_order
   where flight_order.id = p_order_id
     and flight_order.customer_id = p_customer_id
     and flight_order.consumer_flow_version = 1
     and flight_order.execution_mode = 'test'
     and flight_order.provider_code = 'duffel'
   for share;
  if not found then return; end if;
  perform public.assert_flight_consumer_preview_runtime_v1(
    v_order.execution_scope_sha256, 'payment'
  );
  return query
  select evidence.attempt_id, evidence.order_id, evidence.payment_id,
    evidence.execution_mode, evidence.execution_scope_sha256,
    evidence.refund_reference_sha256, evidence.refunded_cents,
    evidence.terminal_receipt_sha256
    from public.flight_payment_refund_evidence as evidence
    join public.flight_payment_operation_attempts as attempt
      on attempt.id = evidence.attempt_id
     and attempt.order_id = evidence.order_id
     and attempt.payment_id = evidence.payment_id
     and attempt.operation = 'refund'
     and attempt.customer_id = v_order.customer_id
     and attempt.state = 'succeeded' and attempt.revision = 2
   where evidence.order_id = v_order.id
     and evidence.execution_mode = 'test'
     and evidence.execution_scope_sha256 = v_order.execution_scope_sha256;
end;
$get_flight_consumer_refund_evidence$;

create function public.get_flight_consumer_search_recovery_v1(
  p_customer_id uuid,
  p_search_id uuid
)
returns table (
  search_id uuid,
  customer_id uuid,
  search_status text,
  search_expires_at timestamptz,
  attempt_id uuid,
  attempt_revision integer,
  attempt_state text,
  request_plan_sha256 text,
  request_sha256 text,
  request_body_sha256 text,
  adapter_source_sha256 text,
  provider_binding_receipt_sha256 text,
  operation_authority_receipt_sha256 text,
  dispatch_not_after timestamptz,
  terminal_http_status smallint,
  terminal_response_sha256 text,
  terminal_response_bytes bigint,
  terminal_receipt_sha256 text
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $get_flight_consumer_search_recovery$
declare
  v_search public.flight_searches;
  v_attempt public.flight_provider_request_attempts;
  v_control public.flight_runtime_controls;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Flight search recovery is service-role only';
  end if;
  select * into v_search from public.flight_searches as search
   where search.id = p_search_id
     and search.customer_id = p_customer_id
     and search.execution_mode = 'test'
   for share;
  if not found then return; end if;
  select * into v_control from public.flight_runtime_controls
   where control_key = 'global';
  perform public.assert_flight_consumer_preview_runtime_v1(
    v_search.execution_scope_sha256, 'shopping'
  );
  select * into v_attempt from public.flight_provider_request_attempts as attempt
   where attempt.search_id = v_search.id
     and attempt.customer_id = v_search.customer_id
     and attempt.consumer_flow_version = 1
     and attempt.operation = 'create_offer_request';
  if not found then return; end if;
  if v_attempt.execution_mode <> 'test'
    or v_attempt.execution_scope_sha256
      is distinct from v_search.execution_scope_sha256
    or v_attempt.provider_code <> 'duffel'
    or v_attempt.provider_account_sha256
      is distinct from v_control.bound_provider_account_sha256
    or v_attempt.content_scope_sha256
      is distinct from v_control.bound_content_scope_sha256
    or v_attempt.adapter_version_sha256
      is distinct from v_control.bound_adapter_version_sha256
    or v_attempt.retry_authorized then
    raise exception 'Flight search recovery binding is stale';
  end if;
  return query select v_search.id, v_search.customer_id, v_search.status,
    v_search.expires_at, v_attempt.id, v_attempt.revision, v_attempt.state,
    v_attempt.request_plan_sha256, v_attempt.request_sha256,
    v_attempt.request_body_sha256, v_attempt.adapter_source_sha256,
    v_attempt.provider_binding_receipt_sha256,
    v_attempt.operation_authority_receipt_sha256,
    v_attempt.dispatch_not_after, v_attempt.terminal_http_status,
    v_attempt.terminal_response_sha256, v_attempt.terminal_response_bytes,
    v_attempt.terminal_receipt_sha256;
end;
$get_flight_consumer_search_recovery$;

-- Admin projections intentionally omit encrypted references, provider payloads,
-- passenger records, and payment-object identifiers.
create function public.list_flight_consumer_admin_reconciliation_v1(
  p_limit integer,
  p_status text default null
)
returns table (
  case_id uuid,
  order_id uuid,
  customer_id uuid,
  confirmation_code text,
  case_type text,
  subject_type text,
  source_status text,
  target_status text,
  case_status text,
  resolution_code text,
  created_at timestamptz,
  updated_at timestamptz,
  resolved_at timestamptz,
  order_status text,
  payment_status text,
  provider_attempt_state text,
  refund_attempt_state text,
  total_cents bigint,
  currency text,
  ticket_count bigint,
  execution_scope_sha256 text
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $list_flight_consumer_admin_reconciliation$
begin
  if coalesce(auth.role(), '') <> 'authenticated' or auth.uid() is null
    or not exists (
      select 1 from public.profiles where id = auth.uid() and role = 'admin'
    ) then
    raise exception 'Flight reconciliation list requires an authenticated administrator';
  end if;
  if p_limit is null or p_limit not between 1 and 100
    or (p_status is not null
      and p_status not in ('open', 'investigating', 'blocked', 'resolved')) then
    raise exception 'Flight reconciliation list filter is invalid';
  end if;
  return query
  select reconciliation.id, flight_order.id, flight_order.customer_id,
    flight_order.confirmation_code, reconciliation.case_type,
    reconciliation.subject_type, reconciliation.source_status,
    reconciliation.target_status, reconciliation.status,
    reconciliation.resolution_code, reconciliation.created_at,
    reconciliation.updated_at, reconciliation.resolved_at,
    flight_order.status, payment.status, provider_attempt.state,
    refund_attempt.state, flight_order.total_cents, flight_order.currency,
    (select count(*) from public.flight_ticket_documents as document
      where document.order_id = flight_order.id),
    reconciliation.execution_scope_sha256
    from public.flight_reconciliation_cases as reconciliation
    join public.flight_orders as flight_order
      on flight_order.id = reconciliation.order_id
     and flight_order.consumer_flow_version = 1
     and flight_order.execution_mode = 'test'
     and flight_order.provider_code = 'duffel'
     and flight_order.execution_scope_sha256 = reconciliation.execution_scope_sha256
    left join lateral (
      select candidate.status
        from public.flight_payments as candidate
       where candidate.order_id = flight_order.id
         and candidate.execution_mode = 'test'
         and candidate.execution_scope_sha256 = flight_order.execution_scope_sha256
         and candidate.processor_code = 'stripe'
       order by candidate.created_at asc, candidate.id asc limit 1
    ) as payment on true
    left join lateral (
      select candidate.state
        from public.flight_provider_request_attempts as candidate
       where candidate.order_id = flight_order.id
         and candidate.consumer_flow_version = 1
         and candidate.operation = 'create_order'
       order by candidate.prepared_at asc, candidate.id asc limit 1
    ) as provider_attempt on true
    left join lateral (
      select candidate.state
        from public.flight_payment_operation_attempts as candidate
       where candidate.order_id = flight_order.id
         and candidate.operation = 'refund'
       order by candidate.prepared_at asc, candidate.id asc limit 1
    ) as refund_attempt on true
   where reconciliation.execution_mode = 'test'
     and (p_status is null or reconciliation.status = p_status)
     and public.flight_consumer_preview_control_is_bound_v1(
       reconciliation.execution_scope_sha256
     )
   order by reconciliation.updated_at desc, reconciliation.id desc
   limit p_limit;
end;
$list_flight_consumer_admin_reconciliation$;

create function public.get_flight_consumer_admin_reconciliation_v1(
  p_case_id uuid
)
returns table (
  case_id uuid,
  order_id uuid,
  customer_id uuid,
  confirmation_code text,
  case_type text,
  subject_type text,
  source_status text,
  source_revision_at timestamptz,
  expected_state_sha256 text,
  observed_state_sha256 text,
  target_status text,
  target_state_sha256 text,
  case_status text,
  resolution_code text,
  resolution_evidence_sha256 text,
  resolved_by uuid,
  created_at timestamptz,
  updated_at timestamptz,
  resolved_at timestamptz,
  order_status text,
  payment_id uuid,
  payment_status text,
  provider_attempt_id uuid,
  provider_attempt_state text,
  provider_attempt_revision integer,
  refund_attempt_id uuid,
  refund_attempt_state text,
  refund_attempt_revision integer,
  authorized_cents bigint,
  captured_cents bigint,
  refunded_cents bigint,
  total_cents bigint,
  currency text,
  ticket_count bigint,
  execution_scope_sha256 text
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $get_flight_consumer_admin_reconciliation$
begin
  if coalesce(auth.role(), '') <> 'authenticated' or auth.uid() is null
    or not exists (
      select 1 from public.profiles where id = auth.uid() and role = 'admin'
    ) then
    raise exception 'Flight reconciliation detail requires an authenticated administrator';
  end if;
  return query
  select reconciliation.id, flight_order.id, flight_order.customer_id,
    flight_order.confirmation_code, reconciliation.case_type,
    reconciliation.subject_type, reconciliation.source_status,
    reconciliation.source_revision_at, reconciliation.expected_state_sha256,
    reconciliation.observed_state_sha256, reconciliation.target_status,
    reconciliation.target_state_sha256, reconciliation.status,
    reconciliation.resolution_code, reconciliation.resolution_evidence_sha256,
    reconciliation.resolved_by, reconciliation.created_at,
    reconciliation.updated_at, reconciliation.resolved_at,
    flight_order.status, payment.id, payment.status, provider_attempt.id,
    provider_attempt.state, provider_attempt.revision, refund_attempt.id,
    refund_attempt.state, refund_attempt.revision,
    payment.authorized_cents, payment.captured_cents, payment.refunded_cents,
    flight_order.total_cents, flight_order.currency,
    (select count(*) from public.flight_ticket_documents as document
      where document.order_id = flight_order.id),
    reconciliation.execution_scope_sha256
    from public.flight_reconciliation_cases as reconciliation
    join public.flight_orders as flight_order
      on flight_order.id = reconciliation.order_id
     and flight_order.consumer_flow_version = 1
     and flight_order.execution_mode = 'test'
     and flight_order.provider_code = 'duffel'
     and flight_order.execution_scope_sha256 = reconciliation.execution_scope_sha256
    left join lateral (
      select candidate.* from public.flight_payments as candidate
       where candidate.order_id = flight_order.id
         and candidate.execution_mode = 'test'
         and candidate.execution_scope_sha256 = flight_order.execution_scope_sha256
         and candidate.processor_code = 'stripe'
       order by candidate.created_at asc, candidate.id asc limit 1
    ) as payment on true
    left join lateral (
      select candidate.* from public.flight_provider_request_attempts as candidate
       where candidate.order_id = flight_order.id
         and candidate.consumer_flow_version = 1
         and candidate.operation = 'create_order'
       order by candidate.prepared_at asc, candidate.id asc limit 1
    ) as provider_attempt on true
    left join lateral (
      select candidate.* from public.flight_payment_operation_attempts as candidate
       where candidate.order_id = flight_order.id
         and candidate.operation = 'refund'
       order by candidate.prepared_at asc, candidate.id asc limit 1
    ) as refund_attempt on true
   where reconciliation.id = p_case_id
     and reconciliation.execution_mode = 'test'
     and public.flight_consumer_preview_control_is_bound_v1(
       reconciliation.execution_scope_sha256
     );
end;
$get_flight_consumer_admin_reconciliation$;

create function public.resolve_flight_consumer_admin_reconciliation_v1(
  p_case_id uuid,
  p_expected_updated_at timestamptz,
  p_resolution_code text,
  p_resolution_evidence_sha256 text
)
returns table (
  decision text,
  case_id uuid,
  case_status text,
  resolution_code text,
  resolution_evidence_sha256 text,
  resolved_by uuid,
  resolved_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $resolve_flight_consumer_admin_reconciliation$
declare
  v_actor uuid;
  v_order_id uuid;
  v_case public.flight_reconciliation_cases;
begin
  if coalesce(auth.role(), '') <> 'authenticated' or auth.uid() is null
    or not exists (
      select 1 from public.profiles where id = auth.uid() and role = 'admin'
    ) then
    raise exception 'Flight reconciliation resolution requires an authenticated administrator';
  end if;
  v_actor := auth.uid();
  if p_expected_updated_at is null
    or p_resolution_code is null
    or p_resolution_code not in (
      'local_state_corrected', 'provider_state_confirmed', 'payment_reversed',
      'ticket_reissued', 'duplicate_suppressed', 'manual_followup_required'
    )
    or p_resolution_evidence_sha256 is null
    or p_resolution_evidence_sha256 !~ '^[0-9a-f]{64}$' then
    raise exception 'Flight reconciliation resolution envelope is invalid';
  end if;
  select reconciliation.order_id into v_order_id
    from public.flight_reconciliation_cases as reconciliation
   where reconciliation.id = p_case_id;
  if v_order_id is not null then
    perform 1 from public.flight_orders where id = v_order_id for update;
  end if;
  select * into v_case from public.flight_reconciliation_cases
   where id = p_case_id for update;
  if v_case.id is null or v_case.order_id is null
    or v_case.execution_mode <> 'test'
    or not public.flight_consumer_preview_control_is_bound_v1(
      v_case.execution_scope_sha256
    ) then
    raise exception 'Flight reconciliation case is unavailable';
  end if;
  if v_case.status = 'resolved' then
    if v_case.resolution_code is distinct from p_resolution_code
      or v_case.resolution_evidence_sha256
        is distinct from p_resolution_evidence_sha256
      or v_case.resolved_by is distinct from v_actor then
      raise exception 'Flight reconciliation resolution replay collides';
    end if;
    return query select 'replay'::text, v_case.id, v_case.status,
      v_case.resolution_code, v_case.resolution_evidence_sha256,
      v_case.resolved_by, v_case.resolved_at, v_case.updated_at;
    return;
  end if;
  perform public.assert_flight_consumer_preview_runtime_v1(
    v_case.execution_scope_sha256, 'order'
  );
  if v_case.updated_at is distinct from p_expected_updated_at
    or v_case.status not in ('open', 'investigating', 'blocked') then
    raise exception 'Flight reconciliation resolution CAS failed';
  end if;
  update public.flight_reconciliation_cases as reconciliation
     set status = 'resolved', resolution_code = p_resolution_code,
         resolution_evidence_sha256 = p_resolution_evidence_sha256,
         resolved_by = v_actor,
         resolved_at = greatest(
           clock_timestamp(), reconciliation.updated_at + interval '1 microsecond'
         ),
         updated_at = greatest(
           clock_timestamp(), reconciliation.updated_at + interval '1 microsecond'
         )
   where reconciliation.id = v_case.id
     and reconciliation.updated_at = p_expected_updated_at
     and reconciliation.status in ('open', 'investigating', 'blocked')
  returning * into v_case;
  if not found then raise exception 'Flight reconciliation resolution CAS failed'; end if;
  return query select 'resolved'::text, v_case.id, v_case.status,
    v_case.resolution_code, v_case.resolution_evidence_sha256,
    v_case.resolved_by, v_case.resolved_at, v_case.updated_at;
end;
$resolve_flight_consumer_admin_reconciliation$;

create function public.resolve_flight_consumer_duffel_webhook_link_v1(
  p_provider_order_ref_sha256 text,
  p_provider_offer_ref_sha256 text
)
returns table (
  order_id uuid,
  customer_id uuid,
  provider_attempt_id uuid,
  order_status text,
  execution_scope_sha256 text
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $resolve_flight_consumer_duffel_webhook_link$
declare
  v_count integer;
  v_scope text;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Flight Duffel webhook linkage is service-role only';
  end if;
  if p_provider_order_ref_sha256 is null
    or p_provider_order_ref_sha256 !~ '^[0-9a-f]{64}$'
    or p_provider_offer_ref_sha256 is null
    or p_provider_offer_ref_sha256 !~ '^[0-9a-f]{64}$' then
    raise exception 'Flight Duffel webhook provider identity is invalid';
  end if;
  select bound_execution_scope_sha256 into v_scope
    from public.flight_runtime_controls where control_key = 'global';
  perform public.assert_flight_consumer_preview_runtime_v1(v_scope, 'provider_event');
  select count(*)::integer into v_count
    from public.flight_orders as flight_order
    join public.flight_offers as offer
      on offer.id = flight_order.offer_id
     and offer.search_id = flight_order.search_id
    join public.flight_provider_request_attempts as attempt
      on attempt.order_id = flight_order.id
     and attempt.customer_id = flight_order.customer_id
     and attempt.offer_id = offer.id
     and attempt.operation = 'create_order'
     and attempt.consumer_flow_version = 1
    join public.flight_payments as payment
      on payment.order_id = flight_order.id
     and payment.processor_code = 'stripe'
     and payment.status = 'captured'
     and payment.authorized_cents = flight_order.total_cents
     and payment.captured_cents = flight_order.total_cents
     and payment.refunded_cents = 0
   where flight_order.consumer_flow_version = 1
     and flight_order.execution_mode = 'test'
     and flight_order.execution_scope_sha256 = v_scope
     and flight_order.provider_code = 'duffel'
     and flight_order.status in ('requires_review', 'order_creating')
     and (flight_order.provider_order_ref_sha256 is null
       or flight_order.provider_order_ref_sha256 = p_provider_order_ref_sha256)
     and offer.execution_mode = 'test'
     and offer.execution_scope_sha256 = v_scope
     and offer.provider_code = 'duffel'
     and offer.provider_offer_ref_sha256 = p_provider_offer_ref_sha256
     and attempt.execution_mode = 'test'
     and attempt.execution_scope_sha256 = v_scope
     and attempt.provider_code = 'duffel'
     and attempt.state = 'succeeded' and attempt.revision = 2
     and not attempt.retry_authorized
     and payment.execution_mode = 'test'
     and payment.execution_scope_sha256 = v_scope
     and payment.currency = flight_order.currency;
  if v_count = 0 then return; end if;
  if v_count <> 1 then
    raise exception 'Flight Duffel webhook identity does not resolve uniquely';
  end if;
  return query
  select flight_order.id, flight_order.customer_id, attempt.id,
    flight_order.status, flight_order.execution_scope_sha256
    from public.flight_orders as flight_order
    join public.flight_offers as offer
      on offer.id = flight_order.offer_id
     and offer.search_id = flight_order.search_id
    join public.flight_provider_request_attempts as attempt
      on attempt.order_id = flight_order.id
     and attempt.customer_id = flight_order.customer_id
     and attempt.offer_id = offer.id
     and attempt.operation = 'create_order'
     and attempt.consumer_flow_version = 1
    join public.flight_payments as payment
      on payment.order_id = flight_order.id
     and payment.processor_code = 'stripe'
     and payment.status = 'captured'
     and payment.authorized_cents = flight_order.total_cents
     and payment.captured_cents = flight_order.total_cents
     and payment.refunded_cents = 0
   where flight_order.consumer_flow_version = 1
     and flight_order.execution_mode = 'test'
     and flight_order.execution_scope_sha256 = v_scope
     and flight_order.provider_code = 'duffel'
     and flight_order.status in ('requires_review', 'order_creating')
     and (flight_order.provider_order_ref_sha256 is null
       or flight_order.provider_order_ref_sha256 = p_provider_order_ref_sha256)
     and offer.provider_offer_ref_sha256 = p_provider_offer_ref_sha256
     and offer.execution_mode = 'test' and offer.execution_scope_sha256 = v_scope
     and attempt.execution_mode = 'test' and attempt.execution_scope_sha256 = v_scope
     and attempt.provider_code = 'duffel'
     and attempt.state = 'succeeded' and attempt.revision = 2
     and not attempt.retry_authorized
     and payment.execution_mode = 'test'
     and payment.execution_scope_sha256 = v_scope
     and payment.currency = flight_order.currency;
end;
$resolve_flight_consumer_duffel_webhook_link$;

create function public.record_flight_consumer_verified_duffel_order_webhook_v1(
  p_event_id_sha256 text,
  p_idempotency_sha256 text,
  p_event_type text,
  p_payload_sha256 text,
  p_semantic_sha256 text,
  p_verification_receipt_sha256 text,
  p_occurred_at timestamptz,
  p_live_mode boolean,
  p_provider_order_ref_sha256 text,
  p_provider_offer_ref_sha256 text
)
returns table (decision text, ledger_id uuid, ledger_revision integer, ledger_state text)
language plpgsql
security definer
set search_path = pg_catalog, public
as $record_flight_consumer_verified_duffel_order_webhook$
declare
  v_link record;
  v_order public.flight_orders;
  v_attempt public.flight_provider_request_attempts;
  v_payment public.flight_payments;
  v_existing public.flight_consumer_webhook_ledger;
  v_ledger public.flight_consumer_webhook_ledger;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Flight verified Duffel order webhook ingress is service-role only';
  end if;
  if p_live_mode is distinct from false
    or p_event_type not in (
      'order.created', 'order.creation_failed', 'air.order.changed',
      'order.airline_initiated_change_detected'
    )
    or p_event_id_sha256 is null or p_event_id_sha256 !~ '^[0-9a-f]{64}$'
    or p_idempotency_sha256 is null or p_idempotency_sha256 !~ '^[0-9a-f]{64}$'
    or p_payload_sha256 is null or p_payload_sha256 !~ '^[0-9a-f]{64}$'
    or p_semantic_sha256 is null or p_semantic_sha256 !~ '^[0-9a-f]{64}$'
    or p_verification_receipt_sha256 is null
    or p_verification_receipt_sha256 !~ '^[0-9a-f]{64}$' then
    raise exception 'Flight verified Duffel order webhook envelope is invalid';
  end if;
  select * into v_link
    from public.resolve_flight_consumer_duffel_webhook_link_v1(
      p_provider_order_ref_sha256, p_provider_offer_ref_sha256
    );
  if not found then return; end if;
  select * into v_order from public.flight_orders
   where id = v_link.order_id for update;
  select * into v_attempt from public.flight_provider_request_attempts
   where id = v_link.provider_attempt_id for share;
  select * into v_payment from public.flight_payments as payment
   where payment.order_id = v_order.id
     and payment.execution_mode = 'test'
     and payment.execution_scope_sha256 = v_order.execution_scope_sha256
     and payment.processor_code = 'stripe'
     and payment.status = 'captured'
     and payment.authorized_cents = v_order.total_cents
     and payment.captured_cents = v_order.total_cents
     and payment.refunded_cents = 0
   for share;
  if v_order.id is null or v_attempt.id is null or v_payment.id is null then
    raise exception 'Flight verified Duffel order webhook link changed';
  end if;
  select * into v_existing from public.flight_consumer_webhook_ledger as ledger
   where ledger.execution_scope_sha256 = v_order.execution_scope_sha256
     and ledger.source = 'duffel'
     and (
       ledger.event_id_sha256 = p_event_id_sha256
       or ledger.idempotency_sha256 = p_idempotency_sha256
     )
   order by (ledger.event_id_sha256 = p_event_id_sha256) desc
   limit 1 for update;
  if found then
    if v_existing.event_type is distinct from p_event_type
      or v_existing.payload_sha256 is distinct from p_payload_sha256
      or v_existing.semantic_sha256 is distinct from p_semantic_sha256
      or v_existing.verification_receipt_sha256
        is distinct from p_verification_receipt_sha256
      or v_existing.order_id is distinct from v_order.id
      or v_existing.payment_id is distinct from v_payment.id
      or v_existing.provider_attempt_id is distinct from v_attempt.id
      or v_existing.provider_live_mode is distinct from false
      or v_existing.provider_order_ref_sha256
        is distinct from p_provider_order_ref_sha256
      or v_existing.provider_offer_ref_sha256
        is distinct from p_provider_offer_ref_sha256 then
      raise exception 'Flight Duffel webhook event or idempotency digest collision';
    end if;
    return query select
      case when v_existing.event_id_sha256 = p_event_id_sha256
        then 'replay'::text else 'duplicate'::text end,
      v_existing.id, v_existing.revision, v_existing.state;
    return;
  end if;
  insert into public.flight_consumer_webhook_ledger (
    source, execution_mode, execution_scope_sha256, event_id_sha256,
    idempotency_sha256, event_type, payload_sha256, semantic_sha256,
    verification_receipt_sha256, order_id, payment_id, provider_attempt_id,
    provider_offer_ref_sha256, provider_order_ref_sha256, provider_live_mode,
    state, revision, occurred_at
  ) values (
    'duffel', 'test', v_order.execution_scope_sha256, p_event_id_sha256,
    p_idempotency_sha256, p_event_type, p_payload_sha256, p_semantic_sha256,
    p_verification_receipt_sha256, v_order.id, v_payment.id, v_attempt.id,
    p_provider_offer_ref_sha256, p_provider_order_ref_sha256, false,
    'verified', 0, p_occurred_at
  ) returning * into v_ledger;
  update public.flight_orders
     set updated_at = greatest(clock_timestamp(), updated_at + interval '1 microsecond')
   where id = v_order.id;
  return query select 'created'::text, v_ledger.id, v_ledger.revision, v_ledger.state;
end;
$record_flight_consumer_verified_duffel_order_webhook$;

-- A GET /air/orders/:id convergence response is separate evidence from the
-- original create-order response. Only its authenticated AES-GCM envelope and
-- binding digests are durable; plaintext provider JSON never enters PostgreSQL.
create table public.flight_order_recovery_evidence_vault (
  id uuid primary key default gen_random_uuid(),
  ledger_id uuid not null unique
    references public.flight_consumer_webhook_ledger(id) on delete restrict,
  attempt_id uuid not null
    references public.flight_provider_request_attempts(id) on delete restrict,
  order_id uuid not null,
  customer_id uuid not null references public.profiles(id) on delete restrict,
  execution_mode text not null default 'test' check (execution_mode = 'test'),
  execution_scope_sha256 text not null
    check (execution_scope_sha256 ~ '^[0-9a-f]{64}$'),
  provider_offer_ref_sha256 text not null
    check (provider_offer_ref_sha256 ~ '^[0-9a-f]{64}$'),
  provider_order_ref_sha256 text not null
    check (provider_order_ref_sha256 ~ '^[0-9a-f]{64}$'),
  recovery_request_sha256 text not null
    check (recovery_request_sha256 ~ '^[0-9a-f]{64}$'),
  provider_response_sha256 text not null
    check (provider_response_sha256 ~ '^[0-9a-f]{64}$'),
  webhook_verification_receipt_sha256 text not null
    check (webhook_verification_receipt_sha256 ~ '^[0-9a-f]{64}$'),
  recovery_authority_receipt_sha256 text not null
    check (recovery_authority_receipt_sha256 ~ '^[0-9a-f]{64}$'),
  recovery_evidence_receipt_sha256 text not null unique
    check (recovery_evidence_receipt_sha256 ~ '^[0-9a-f]{64}$'),
  key_version text not null check (
    key_version ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$'
  ),
  iv_base64url text not null check (
    iv_base64url ~ '^[A-Za-z0-9_-]+$' and char_length(iv_base64url) = 16
  ),
  auth_tag_base64url text not null check (
    auth_tag_base64url ~ '^[A-Za-z0-9_-]+$' and char_length(auth_tag_base64url) = 22
  ),
  ciphertext_base64url text not null check (
    ciphertext_base64url ~ '^[A-Za-z0-9_-]+$'
    and char_length(ciphertext_base64url) between 16 and 2100000
  ),
  aad_sha256 text not null check (aad_sha256 ~ '^[0-9a-f]{64}$'),
  ciphertext_sha256 text not null check (ciphertext_sha256 ~ '^[0-9a-f]{64}$'),
  retention_expires_at timestamptz not null,
  created_at timestamptz not null default clock_timestamp(),
  deleted_at timestamptz,
  foreign key (order_id, customer_id)
    references public.flight_orders(id, customer_id) on delete restrict,
  unique (execution_scope_sha256, provider_order_ref_sha256),
  check (retention_expires_at > created_at),
  check (retention_expires_at <= created_at + interval '7 days'),
  check (deleted_at is null or deleted_at >= created_at)
);

create index flight_order_recovery_evidence_retention_idx
  on public.flight_order_recovery_evidence_vault (retention_expires_at)
  where deleted_at is null;

create trigger flight_order_recovery_evidence_append_only_guard
before update or delete on public.flight_order_recovery_evidence_vault
for each row execute function public.reject_flight_evidence_mutation();

create function public.record_flight_consumer_duffel_order_recovery_evidence_v1(
  p_customer_id uuid,
  p_order_id uuid,
  p_ledger_id uuid,
  p_attempt_id uuid,
  p_recovery_request_sha256 text,
  p_recovery_authority_receipt_sha256 text,
  p_provider_order_ref_sha256 text,
  p_provider_response_sha256 text,
  p_key_version text,
  p_iv_base64url text,
  p_auth_tag_base64url text,
  p_ciphertext_base64url text,
  p_aad_sha256 text,
  p_ciphertext_sha256 text,
  p_recovery_evidence_receipt_sha256 text,
  p_retention_expires_at timestamptz
)
returns table (
  evidence_id uuid,
  ledger_id uuid,
  order_id uuid,
  recovery_evidence_receipt_sha256 text,
  retention_expires_at timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $record_flight_consumer_duffel_order_recovery_evidence$
declare
  v_order public.flight_orders;
  v_attempt public.flight_provider_request_attempts;
  v_ledger public.flight_consumer_webhook_ledger;
  v_payment public.flight_payments;
  v_offer public.flight_offers;
  v_evidence public.flight_order_recovery_evidence_vault;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Flight Duffel order recovery evidence is service-role only';
  end if;
  if p_recovery_request_sha256 is null
    or p_recovery_request_sha256 !~ '^[0-9a-f]{64}$'
    or p_recovery_authority_receipt_sha256 is null
    or p_recovery_authority_receipt_sha256 !~ '^[0-9a-f]{64}$'
    or p_provider_order_ref_sha256 is null
    or p_provider_order_ref_sha256 !~ '^[0-9a-f]{64}$'
    or p_provider_response_sha256 is null
    or p_provider_response_sha256 !~ '^[0-9a-f]{64}$'
    or p_recovery_evidence_receipt_sha256 is null
    or p_recovery_evidence_receipt_sha256 !~ '^[0-9a-f]{64}$'
    or p_key_version is null
    or p_key_version !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$'
    or p_iv_base64url is null or p_iv_base64url !~ '^[A-Za-z0-9_-]{16}$'
    or p_auth_tag_base64url is null
    or p_auth_tag_base64url !~ '^[A-Za-z0-9_-]{22}$'
    or p_ciphertext_base64url is null
    or p_ciphertext_base64url !~ '^[A-Za-z0-9_-]+$'
    or char_length(p_ciphertext_base64url) not between 16 and 2100000
    or p_aad_sha256 is null or p_aad_sha256 !~ '^[0-9a-f]{64}$'
    or p_ciphertext_sha256 is null or p_ciphertext_sha256 !~ '^[0-9a-f]{64}$'
    or p_retention_expires_at is null
    or p_retention_expires_at <= clock_timestamp()
    or p_retention_expires_at > clock_timestamp() + interval '7 days' then
    raise exception 'Flight Duffel order recovery evidence envelope is invalid';
  end if;
  select * into v_order from public.flight_orders as flight_order
   where flight_order.id = p_order_id
     and flight_order.customer_id = p_customer_id
   for update;
  select * into v_attempt from public.flight_provider_request_attempts as attempt
   where attempt.id = p_attempt_id for share;
  select * into v_ledger from public.flight_consumer_webhook_ledger as ledger
   where ledger.id = p_ledger_id for share;
  if v_order.id is null or v_order.consumer_flow_version <> 1
    or v_order.execution_mode <> 'test' or v_order.provider_code <> 'duffel'
    or v_order.status not in ('requires_review', 'order_creating')
    or (v_order.provider_order_ref_sha256 is not null
      and v_order.provider_order_ref_sha256 <> p_provider_order_ref_sha256)
    or v_attempt.id is null or v_attempt.consumer_flow_version <> 1
    or v_attempt.operation <> 'create_order'
    or v_attempt.order_id is distinct from v_order.id
    or v_attempt.customer_id is distinct from v_order.customer_id
    or v_attempt.offer_id is distinct from v_order.offer_id
    or v_attempt.execution_mode <> 'test'
    or v_attempt.execution_scope_sha256
      is distinct from v_order.execution_scope_sha256
    or v_attempt.provider_code <> 'duffel'
    or v_attempt.state <> 'succeeded' or v_attempt.revision <> 2
    or v_attempt.retry_authorized
    or v_ledger.id is null or v_ledger.source <> 'duffel'
    or v_ledger.execution_mode <> 'test'
    or v_ledger.execution_scope_sha256
      is distinct from v_order.execution_scope_sha256
    or v_ledger.event_type <> 'order.created'
    or v_ledger.state <> 'processed' or v_ledger.revision <> 2
    or v_ledger.order_id is distinct from v_order.id
    or v_ledger.provider_attempt_id is distinct from v_attempt.id
    or v_ledger.provider_offer_ref_sha256 is null
    or v_ledger.provider_live_mode is distinct from false
    or v_ledger.provider_order_ref_sha256
      is distinct from p_provider_order_ref_sha256 then
    raise exception 'Flight Duffel async recovery linkage is unavailable';
  end if;
  perform public.assert_flight_consumer_preview_runtime_v1(
    v_order.execution_scope_sha256, 'ticketing'
  );
  select * into v_offer from public.flight_offers as offer
   where offer.id = v_order.offer_id
     and offer.search_id = v_order.search_id
     and offer.execution_mode = 'test'
     and offer.execution_scope_sha256 = v_order.execution_scope_sha256
     and offer.provider_code = 'duffel'
     and offer.provider_offer_ref_sha256 = v_ledger.provider_offer_ref_sha256
   for share;
  select * into v_payment from public.flight_payments as payment
   where payment.id = v_ledger.payment_id
     and payment.order_id = v_order.id
     and payment.execution_mode = 'test'
     and payment.execution_scope_sha256 = v_order.execution_scope_sha256
     and payment.processor_code = 'stripe'
     and payment.currency = v_order.currency
     and payment.status = 'captured'
     and payment.authorized_cents = v_order.total_cents
     and payment.captured_cents = v_order.total_cents
     and payment.refunded_cents = 0
   for share;
  if v_offer.id is null or v_payment.id is null then
    raise exception 'Flight Duffel async recovery commercial evidence changed';
  end if;
  select * into v_evidence
    from public.flight_order_recovery_evidence_vault as evidence
   where evidence.ledger_id = v_ledger.id;
  if found then
    if v_evidence.attempt_id is distinct from v_attempt.id
      or v_evidence.order_id is distinct from v_order.id
      or v_evidence.customer_id is distinct from v_order.customer_id
      or v_evidence.execution_scope_sha256
        is distinct from v_order.execution_scope_sha256
      or v_evidence.provider_offer_ref_sha256
        is distinct from v_offer.provider_offer_ref_sha256
      or v_evidence.provider_order_ref_sha256
        is distinct from p_provider_order_ref_sha256
      or v_evidence.recovery_request_sha256
        is distinct from p_recovery_request_sha256
      or v_evidence.provider_response_sha256
        is distinct from p_provider_response_sha256
      or v_evidence.webhook_verification_receipt_sha256
        is distinct from v_ledger.verification_receipt_sha256
      or v_evidence.recovery_authority_receipt_sha256
        is distinct from p_recovery_authority_receipt_sha256
      or v_evidence.recovery_evidence_receipt_sha256
        is distinct from p_recovery_evidence_receipt_sha256
      or v_evidence.key_version is distinct from p_key_version
      or v_evidence.iv_base64url is distinct from p_iv_base64url
      or v_evidence.auth_tag_base64url is distinct from p_auth_tag_base64url
      or v_evidence.ciphertext_base64url is distinct from p_ciphertext_base64url
      or v_evidence.aad_sha256 is distinct from p_aad_sha256
      or v_evidence.ciphertext_sha256 is distinct from p_ciphertext_sha256
      or v_evidence.retention_expires_at is distinct from p_retention_expires_at then
      raise exception 'Flight Duffel order recovery evidence replay collides';
    end if;
  else
    insert into public.flight_order_recovery_evidence_vault (
      ledger_id, attempt_id, order_id, customer_id, execution_mode,
      execution_scope_sha256, provider_offer_ref_sha256,
      provider_order_ref_sha256, recovery_request_sha256,
      provider_response_sha256, webhook_verification_receipt_sha256,
      recovery_authority_receipt_sha256, recovery_evidence_receipt_sha256,
      key_version, iv_base64url, auth_tag_base64url, ciphertext_base64url,
      aad_sha256, ciphertext_sha256, retention_expires_at
    ) values (
      v_ledger.id, v_attempt.id, v_order.id, v_order.customer_id, 'test',
      v_order.execution_scope_sha256, v_offer.provider_offer_ref_sha256,
      p_provider_order_ref_sha256, p_recovery_request_sha256,
      p_provider_response_sha256, v_ledger.verification_receipt_sha256,
      p_recovery_authority_receipt_sha256, p_recovery_evidence_receipt_sha256,
      p_key_version, p_iv_base64url, p_auth_tag_base64url,
      p_ciphertext_base64url, p_aad_sha256, p_ciphertext_sha256,
      p_retention_expires_at
    ) returning * into v_evidence;
  end if;
  update public.flight_orders
     set updated_at = greatest(clock_timestamp(), updated_at + interval '1 microsecond')
   where id = v_order.id;
  return query select v_evidence.id, v_evidence.ledger_id,
    v_evidence.order_id, v_evidence.recovery_evidence_receipt_sha256,
    v_evidence.retention_expires_at;
end;
$record_flight_consumer_duffel_order_recovery_evidence$;

create function public.load_flight_consumer_duffel_order_recovery_evidence_v1(
  p_customer_id uuid,
  p_order_id uuid,
  p_ledger_id uuid,
  p_recovery_evidence_receipt_sha256 text
)
returns table (
  evidence_id uuid,
  ledger_id uuid,
  attempt_id uuid,
  order_id uuid,
  customer_id uuid,
  execution_scope_sha256 text,
  provider_offer_ref_sha256 text,
  provider_order_ref_sha256 text,
  recovery_request_sha256 text,
  provider_response_sha256 text,
  webhook_verification_receipt_sha256 text,
  recovery_authority_receipt_sha256 text,
  recovery_evidence_receipt_sha256 text,
  key_version text,
  iv_base64url text,
  auth_tag_base64url text,
  ciphertext_base64url text,
  aad_sha256 text,
  ciphertext_sha256 text,
  retention_expires_at timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $load_flight_consumer_duffel_order_recovery_evidence$
declare
  v_order public.flight_orders;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Flight Duffel order recovery evidence load is service-role only';
  end if;
  select * into v_order from public.flight_orders as flight_order
   where flight_order.id = p_order_id
     and flight_order.customer_id = p_customer_id
     and flight_order.consumer_flow_version = 1
     and flight_order.execution_mode = 'test'
     and flight_order.provider_code = 'duffel'
   for share;
  if not found then return; end if;
  perform public.assert_flight_consumer_preview_runtime_v1(
    v_order.execution_scope_sha256, 'ticketing'
  );
  return query
  select evidence.id, evidence.ledger_id, evidence.attempt_id,
    evidence.order_id, evidence.customer_id, evidence.execution_scope_sha256,
    evidence.provider_offer_ref_sha256, evidence.provider_order_ref_sha256,
    evidence.recovery_request_sha256, evidence.provider_response_sha256,
    evidence.webhook_verification_receipt_sha256,
    evidence.recovery_authority_receipt_sha256,
    evidence.recovery_evidence_receipt_sha256, evidence.key_version,
    evidence.iv_base64url, evidence.auth_tag_base64url,
    evidence.ciphertext_base64url, evidence.aad_sha256,
    evidence.ciphertext_sha256, evidence.retention_expires_at
    from public.flight_order_recovery_evidence_vault as evidence
    join public.flight_consumer_webhook_ledger as ledger
      on ledger.id = evidence.ledger_id
     and ledger.state = 'processed' and ledger.revision = 2
     and ledger.event_type = 'order.created' and ledger.source = 'duffel'
   where evidence.ledger_id = p_ledger_id
     and evidence.order_id = v_order.id
     and evidence.customer_id = v_order.customer_id
     and evidence.execution_mode = 'test'
     and evidence.execution_scope_sha256 = v_order.execution_scope_sha256
     and evidence.recovery_evidence_receipt_sha256
       = p_recovery_evidence_receipt_sha256
     and evidence.deleted_at is null
     and evidence.retention_expires_at > clock_timestamp();
end;
$load_flight_consumer_duffel_order_recovery_evidence$;

create function public.get_flight_consumer_reconciliation_context_v1(
  p_customer_id uuid,
  p_order_id uuid
)
returns table (context jsonb)
language plpgsql
security definer
set search_path = pg_catalog, public
as $get_flight_consumer_reconciliation_context$
declare
  v_order public.flight_orders;
  v_payment public.flight_payments;
  v_provider_attempt public.flight_provider_request_attempts;
  v_resolution public.flight_reconciliation_cases;
  v_refund_attempt public.flight_payment_operation_attempts;
  v_refund_evidence public.flight_payment_refund_evidence;
  v_ticket_count integer;
  v_payment_json jsonb;
  v_provider_attempt_json jsonb;
  v_resolution_json jsonb;
  v_refund_attempt_json jsonb;
  v_refund_evidence_json jsonb;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Flight reconciliation context is service-role only';
  end if;
  select * into v_order from public.flight_orders as flight_order
   where flight_order.id = p_order_id
     and flight_order.customer_id = p_customer_id
     and flight_order.consumer_flow_version = 1
     and flight_order.execution_mode = 'test'
     and flight_order.provider_code = 'duffel'
     and flight_order.status in ('requires_review', 'failed')
   for share;
  if not found then return; end if;
  perform public.assert_flight_consumer_preview_runtime_v1(
    v_order.execution_scope_sha256, 'payment'
  );
  if (select count(*) from public.flight_payments as candidate
       where candidate.order_id = v_order.id
         and candidate.execution_mode = 'test'
         and candidate.execution_scope_sha256 = v_order.execution_scope_sha256
         and candidate.processor_code = 'stripe') > 1 then
    raise exception 'Flight reconciliation context has multiple customer payments';
  end if;
  select * into v_payment from public.flight_payments as payment
   where payment.order_id = v_order.id
     and payment.execution_mode = 'test'
     and payment.execution_scope_sha256 = v_order.execution_scope_sha256
     and payment.processor_code = 'stripe';
  if found then
    v_payment_json := jsonb_build_object(
      'id', v_payment.id,
      'order_id', v_payment.order_id,
      'execution_mode', v_payment.execution_mode,
      'execution_scope_sha256', v_payment.execution_scope_sha256,
      'processor_code', v_payment.processor_code,
      'processor_reference_ciphertext', v_payment.processor_reference_ciphertext,
      'processor_reference_sha256', v_payment.processor_reference_sha256,
      'currency', v_payment.currency,
      'authorized_cents', v_payment.authorized_cents,
      'captured_cents', v_payment.captured_cents,
      'refunded_cents', v_payment.refunded_cents,
      'status', v_payment.status
    );
  end if;
  select * into v_provider_attempt
    from public.flight_provider_request_attempts as attempt
   where attempt.customer_id = v_order.customer_id
     and attempt.order_id = v_order.id
     and attempt.provider_code = 'duffel'
     and attempt.operation = 'create_order'
     and attempt.consumer_flow_version = 1
     and attempt.execution_mode = 'test'
     and attempt.execution_scope_sha256 = v_order.execution_scope_sha256;
  if found then
    v_provider_attempt_json := jsonb_build_object(
      'id', v_provider_attempt.id,
      'customer_id', v_provider_attempt.customer_id,
      'order_id', v_provider_attempt.order_id,
      'provider_code', v_provider_attempt.provider_code,
      'operation', v_provider_attempt.operation,
      'consumer_flow_version', v_provider_attempt.consumer_flow_version,
      'execution_mode', v_provider_attempt.execution_mode,
      'execution_scope_sha256', v_provider_attempt.execution_scope_sha256,
      'retry_authorized', v_provider_attempt.retry_authorized,
      'state', v_provider_attempt.state,
      'revision', v_provider_attempt.revision
    );
  end if;
  select * into v_resolution from public.flight_reconciliation_cases as reconciliation
   where reconciliation.order_id = v_order.id
     and reconciliation.provider_code = 'duffel'
     and reconciliation.execution_mode = 'test'
     and reconciliation.execution_scope_sha256 = v_order.execution_scope_sha256
     and reconciliation.case_type = 'ambiguous_order'
     and reconciliation.subject_type = 'flight_order'
     and reconciliation.subject_id = v_order.id
     and reconciliation.source_status = 'requires_review'
     and reconciliation.target_status = 'failed'
     and reconciliation.status = 'resolved'
   order by (reconciliation.resolution_code = 'duplicate_suppressed') desc,
     reconciliation.resolved_at desc, reconciliation.id desc
   limit 1;
  if found then
    v_resolution_json := jsonb_build_object(
      'id', v_resolution.id,
      'order_id', v_resolution.order_id,
      'provider_code', v_resolution.provider_code,
      'execution_mode', v_resolution.execution_mode,
      'execution_scope_sha256', v_resolution.execution_scope_sha256,
      'case_type', v_resolution.case_type,
      'subject_type', v_resolution.subject_type,
      'subject_id', v_resolution.subject_id,
      'source_status', v_resolution.source_status,
      'target_status', v_resolution.target_status,
      'status', v_resolution.status,
      'resolution_code', v_resolution.resolution_code,
      'resolution_evidence_sha256', v_resolution.resolution_evidence_sha256
    );
  end if;
  select * into v_refund_attempt
    from public.flight_payment_operation_attempts as attempt
   where attempt.customer_id = v_order.customer_id
     and attempt.order_id = v_order.id
     and attempt.operation = 'refund'
     and attempt.execution_mode = 'test'
     and attempt.execution_scope_sha256 = v_order.execution_scope_sha256;
  if found then
    v_refund_attempt_json := jsonb_build_object(
      'id', v_refund_attempt.id,
      'customer_id', v_refund_attempt.customer_id,
      'order_id', v_refund_attempt.order_id,
      'payment_id', v_refund_attempt.payment_id,
      'operation', v_refund_attempt.operation,
      'processor_code', v_refund_attempt.processor_code,
      'execution_mode', v_refund_attempt.execution_mode,
      'execution_scope_sha256', v_refund_attempt.execution_scope_sha256,
      'processor_account_sha256', v_refund_attempt.processor_account_sha256,
      'processor_environment', v_refund_attempt.processor_environment,
      'processor_source_sha256', v_refund_attempt.processor_source_sha256,
      'processor_adapter_version_sha256',
        v_refund_attempt.processor_adapter_version_sha256,
      'payment_binding_receipt_sha256',
        v_refund_attempt.payment_binding_receipt_sha256,
      'adapter_source_sha256', v_refund_attempt.adapter_source_sha256,
      'operation_authority_receipt_sha256',
        v_refund_attempt.operation_authority_receipt_sha256,
      'idempotency_key_sha256', v_refund_attempt.idempotency_key_sha256,
      'idempotency_request_sha256', v_refund_attempt.idempotency_request_sha256,
      'request_plan_sha256', v_refund_attempt.request_plan_sha256,
      'request_sha256', v_refund_attempt.request_sha256,
      'request_body_sha256', v_refund_attempt.request_body_sha256,
      'amount_cents', v_refund_attempt.amount_cents,
      'currency', v_refund_attempt.currency,
      'dispatch_not_after', v_refund_attempt.dispatch_not_after,
      'state', v_refund_attempt.state,
      'revision', v_refund_attempt.revision,
      'terminal_http_status', v_refund_attempt.terminal_http_status,
      'terminal_response_sha256', v_refund_attempt.terminal_response_sha256,
      'terminal_response_bytes', v_refund_attempt.terminal_response_bytes,
      'terminal_receipt_sha256', v_refund_attempt.terminal_receipt_sha256
    );
  end if;
  select * into v_refund_evidence
    from public.flight_payment_refund_evidence as evidence
   where evidence.order_id = v_order.id
     and evidence.execution_mode = 'test'
     and evidence.execution_scope_sha256 = v_order.execution_scope_sha256;
  if found then
    v_refund_evidence_json := jsonb_build_object(
      'attempt_id', v_refund_evidence.attempt_id,
      'order_id', v_refund_evidence.order_id,
      'payment_id', v_refund_evidence.payment_id,
      'execution_mode', v_refund_evidence.execution_mode,
      'execution_scope_sha256', v_refund_evidence.execution_scope_sha256,
      'refund_reference_sha256', v_refund_evidence.refund_reference_sha256,
      'refunded_cents', v_refund_evidence.refunded_cents,
      'terminal_receipt_sha256', v_refund_evidence.terminal_receipt_sha256
    );
  end if;
  select count(*)::integer into v_ticket_count
    from public.flight_ticket_documents as document
   where document.order_id = v_order.id
     and document.execution_mode = 'test'
     and document.execution_scope_sha256 = v_order.execution_scope_sha256;
  return query select jsonb_build_object(
    'order', jsonb_build_object(
      'id', v_order.id,
      'customer_id', v_order.customer_id,
      'execution_mode', v_order.execution_mode,
      'execution_scope_sha256', v_order.execution_scope_sha256,
      'provider_code', v_order.provider_code,
      'consumer_flow_version', v_order.consumer_flow_version,
      'currency', v_order.currency,
      'total_cents', v_order.total_cents,
      'status', v_order.status,
      'provider_order_ref_sha256', v_order.provider_order_ref_sha256
    ),
    'payment', v_payment_json,
    'providerAttempt', v_provider_attempt_json,
    'safeResolution', v_resolution_json,
    'refundAttempt', v_refund_attempt_json,
    'refundEvidence', v_refund_evidence_json,
    'ticketCount', v_ticket_count
  );
end;
$get_flight_consumer_reconciliation_context$;

alter table public.flight_order_recovery_evidence_vault enable row level security;
alter table public.flight_order_recovery_evidence_vault force row level security;

revoke all on table public.flight_order_recovery_evidence_vault
  from public, anon, authenticated, service_role;

revoke all on function public.flight_current_runtime_control_receipt_sha256_v1()
  from public, anon, authenticated, service_role;
revoke all on function public.flight_consumer_preview_target_scope_sha256_v1(text)
  from public, anon, authenticated, service_role;
revoke all on function public.flight_consumer_preview_control_is_bound_v1(text)
  from public, anon, authenticated, service_role;
revoke all on function public.activate_flight_consumer_preview_v1(
  timestamptz, text, text, text, text, text, text
) from public, anon, authenticated, service_role;
revoke all on function public.relock_flight_consumer_preview_v1(
  timestamptz, text, text, text, text, text
) from public, anon, authenticated, service_role;
revoke all on function public.protect_flight_consumer_webhook_ledger_v1()
  from public, anon, authenticated, service_role;
revoke all on function public.record_flight_consumer_verified_webhook_v1(
  text, text, text, text, text, text, text, timestamptz, uuid, uuid, uuid
) from public, anon, authenticated, service_role;
revoke all on function public.complete_flight_consumer_webhook_v1(
  uuid, integer, text, text
) from public, anon, authenticated, service_role;
revoke all on function public.claim_flight_consumer_webhook_lease_v1(
  uuid, integer, text, integer
) from public, anon, authenticated, service_role;
revoke all on function public.reclaim_flight_consumer_webhook_v1(
  uuid, integer, timestamptz, text, text, integer
) from public, anon, authenticated, service_role;
revoke all on function public.complete_flight_consumer_webhook_lease_v1(
  uuid, integer, text, text, text
) from public, anon, authenticated, service_role;
revoke all on function public.get_flight_consumer_completion_recovery_v1(uuid, uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.get_flight_consumer_refund_evidence_v1(uuid, uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.get_flight_consumer_reconciliation_context_v1(uuid, uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.get_flight_consumer_search_recovery_v1(uuid, uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.list_flight_consumer_admin_reconciliation_v1(integer, text)
  from public, anon, authenticated, service_role;
revoke all on function public.get_flight_consumer_admin_reconciliation_v1(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.resolve_flight_consumer_admin_reconciliation_v1(
  uuid, timestamptz, text, text
) from public, anon, authenticated, service_role;
revoke all on function public.resolve_flight_consumer_duffel_webhook_link_v1(text, text)
  from public, anon, authenticated, service_role;
revoke all on function public.record_flight_consumer_verified_duffel_order_webhook_v1(
  text, text, text, text, text, text, timestamptz, boolean, text, text
) from public, anon, authenticated, service_role;
revoke all on function public.record_flight_consumer_duffel_order_recovery_evidence_v1(
  uuid, uuid, uuid, uuid, text, text, text, text, text, text, text, text,
  text, text, text, timestamptz
) from public, anon, authenticated, service_role;
revoke all on function public.load_flight_consumer_duffel_order_recovery_evidence_v1(
  uuid, uuid, uuid, text
) from public, anon, authenticated, service_role;

grant execute on function public.activate_flight_consumer_preview_v1(
  timestamptz, text, text, text, text, text, text
) to authenticated;
grant execute on function public.relock_flight_consumer_preview_v1(
  timestamptz, text, text, text, text, text
) to authenticated;
grant execute on function public.list_flight_consumer_admin_reconciliation_v1(integer, text)
  to authenticated;
grant execute on function public.get_flight_consumer_admin_reconciliation_v1(uuid)
  to authenticated;
grant execute on function public.resolve_flight_consumer_admin_reconciliation_v1(
  uuid, timestamptz, text, text
) to authenticated;

grant execute on function public.record_flight_consumer_verified_webhook_v1(
  text, text, text, text, text, text, text, timestamptz, uuid, uuid, uuid
) to service_role;
grant execute on function public.complete_flight_consumer_webhook_v1(
  uuid, integer, text, text
) to service_role;
grant execute on function public.claim_flight_consumer_webhook_lease_v1(
  uuid, integer, text, integer
) to service_role;
grant execute on function public.reclaim_flight_consumer_webhook_v1(
  uuid, integer, timestamptz, text, text, integer
) to service_role;
grant execute on function public.complete_flight_consumer_webhook_lease_v1(
  uuid, integer, text, text, text
) to service_role;
grant execute on function public.get_flight_consumer_completion_recovery_v1(uuid, uuid)
  to service_role;
grant execute on function public.get_flight_consumer_refund_evidence_v1(uuid, uuid)
  to service_role;
grant execute on function public.get_flight_consumer_reconciliation_context_v1(uuid, uuid)
  to service_role;
grant execute on function public.get_flight_consumer_search_recovery_v1(uuid, uuid)
  to service_role;
grant execute on function public.resolve_flight_consumer_duffel_webhook_link_v1(text, text)
  to service_role;
grant execute on function public.record_flight_consumer_verified_duffel_order_webhook_v1(
  text, text, text, text, text, text, timestamptz, boolean, text, text
) to service_role;
grant execute on function public.record_flight_consumer_duffel_order_recovery_evidence_v1(
  uuid, uuid, uuid, uuid, text, text, text, text, text, text, text, text,
  text, text, text, timestamptz
) to service_role;
grant execute on function public.load_flight_consumer_duffel_order_recovery_evidence_v1(
  uuid, uuid, uuid, text
) to service_role;

comment on function public.activate_flight_consumer_preview_v1(
  timestamptz, text, text, text, text, text, text
) is
  'Authenticated-admin CAS activation for the one exact test-only Consumer Preview target; all final bindings, scope, and evidence are derived inside PostgreSQL.';
comment on function public.relock_flight_consumer_preview_v1(
  timestamptz, text, text, text, text, text
) is
  'Authenticated-admin CAS relock that disables every execution capability while preserving the exact Consumer Preview binding and scope.';
comment on function public.reclaim_flight_consumer_webhook_v1(
  uuid, integer, timestamptz, text, text, integer
) is
  'Token-fenced stale webhook lease rotation; the ledger remains processing revision 1 and only the current lease may complete revision 2.';
comment on function public.get_flight_consumer_search_recovery_v1(uuid, uuid) is
  'Owner/search-scoped digest-only provider attempt metadata for crash-safe search convergence without provider redispatch.';
comment on function public.resolve_flight_consumer_duffel_webhook_link_v1(text, text) is
  'Resolves exactly one captured Consumer Preview order and succeeded create-order attempt from hashed Duffel order and offer identities; returns no row when unmatched.';
comment on table public.flight_order_recovery_evidence_vault is
  'Service-only AES-GCM Duffel GET-order recovery evidence bound to one processed verified order.created webhook; plaintext provider JSON never enters PostgreSQL.';

commit;
