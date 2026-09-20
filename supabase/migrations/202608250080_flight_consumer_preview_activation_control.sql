begin;

-- Consumer Preview activation authority repair. This migration does not
-- activate the runtime, dispatch provider traffic, take payment, issue a
-- ticket, send email, or authorize Production.
do $flight_consumer_preview_080_dependencies$
begin
  if to_regprocedure(
      'public.flight_current_runtime_control_receipt_sha256_v1()'
    ) is null
    or to_regprocedure(
      'public.flight_consumer_preview_target_scope_sha256_v1(text)'
    ) is null
    or to_regprocedure(
      'public.activate_flight_consumer_preview_v1(timestamptz,text,text,text,text,text,text)'
    ) is null
    or to_regprocedure(
      'public.relock_flight_consumer_preview_v1(timestamptz,text,text,text,text,text)'
    ) is null
    or to_regprocedure(
      'public.finalize_flight_consumer_async_duffel_order_v1(uuid,uuid,uuid,text,text,text,timestamptz,timestamptz,jsonb,jsonb)'
    ) is null
    or to_regprocedure(
      'public.queue_flight_consumer_notification_v1(uuid,uuid,text,uuid,text,text,text,text,text,text,text)'
    ) is null
    or to_regprocedure(
      'public.create_flight_consumer_preview_service_request_v1(uuid,text,text,text)'
    ) is null then
    raise exception 'Flight Consumer Preview activation control requires migrations 068 through 079';
  end if;
  if to_regprocedure('extensions.digest(bytea,text)') is null then
    raise exception 'Flight Consumer Preview activation control requires reviewed SHA-256 support';
  end if;
end;
$flight_consumer_preview_080_dependencies$;

-- This manifest covers every consumer-runtime migration whose exact bytes can
-- be named without creating a self-referential hash. Migration 080 itself is
-- identified by its version here and byte-pinned by the guarded installer.
create function public.flight_consumer_preview_activation_manifest_sha256_v2()
returns text
language sql
stable
security definer
set search_path = pg_catalog, public, extensions
as $flight_consumer_preview_activation_manifest$
  select encode(extensions.digest(convert_to(
    'iratepilot.flight.consumer-preview.activation-manifest.v2' || chr(10)
      || jsonb_build_object(
        'activation_control_migration', '202608250080',
        'migrations', jsonb_build_array(
          jsonb_build_object(
            'version', '202608250074',
            'sha256', 'c5cf8ace2562332255758736970a022bced59c76867b1b71ce7703f12bb7bb98'
          ),
          jsonb_build_object(
            'version', '202608250075',
            'sha256', '3edaffb8bb93588932ad4d3c5cd0727b360c9f669709bab2da9c4e25130f5e49'
          ),
          jsonb_build_object(
            'version', '202608250076',
            'sha256', '3023e8190fa10b7b5f5de57fa588eaba39fe082a4eb06218d60d12adf839f8b1'
          ),
          jsonb_build_object(
            'version', '202608250077',
            'sha256', 'f7aba46a72d6acfb9bf016faf8c666c37e3e3a73715114ebeadd12f2cd1f5ff7'
          ),
          jsonb_build_object(
            'version', '202608250078',
            'sha256', '187c46f7bc08d7f8165341858ecfac918048aac8dce2f70cb594406647aed8fb'
          ),
          jsonb_build_object(
            'version', '202608250079',
            'sha256', '02f5ed7064cfb2623e60c88bae8b042bdea08682473963e794711caf38d242ca'
          )
        )
      )::text,
    'UTF8'
  ), 'sha256'), 'hex');
$flight_consumer_preview_activation_manifest$;

-- Return only the exact CAS inputs needed by the activation RPC. The caller
-- must be an authenticated administrator, the control must still be locked,
-- and the predecessor must be either the reviewed V8 binding or the exact
-- split Stripe/Duffel-Balance target preserved by a later relock.
create function public.get_flight_consumer_preview_activation_preflight_v1(
  p_stripe_account_id text
)
returns table (
  version text,
  ready boolean,
  control_key text,
  expected_updated_at timestamptz,
  expected_execution_scope_sha256 text,
  expected_activation_evidence_sha256 text,
  expected_runtime_control_receipt_sha256 text,
  target_execution_scope_sha256 text,
  activation_manifest_sha256 text
)
language plpgsql
volatile
security definer
set search_path = pg_catalog, public, extensions
as $get_flight_consumer_preview_activation_preflight$
declare
  v_actor uuid;
  v_control public.flight_runtime_controls;
  v_provider_account_sha256 text;
  v_content_scope_sha256 text;
  v_provider_adapter_sha256 text;
  v_payment_account_sha256 text;
  v_payment_source_sha256 text;
  v_payment_adapter_sha256 text;
  v_settlement_account_sha256 text;
  v_settlement_source_sha256 text;
  v_settlement_adapter_sha256 text;
  v_target_scope_sha256 text;
  v_current_receipt_sha256 text;
  v_is_v8_predecessor boolean;
  v_is_target_predecessor boolean;
begin
  if coalesce(auth.role(), '') <> 'authenticated' or auth.uid() is null then
    raise exception 'Flight Consumer Preview activation preflight requires an authenticated administrator';
  end if;
  v_actor := auth.uid();
  if not exists (
    select 1 from public.profiles as profile
     where profile.id = v_actor and profile.role = 'admin'
  ) then
    raise exception 'Flight Consumer Preview activation preflight requires an authenticated administrator';
  end if;
  if current_database()::text <> 'postgres' or session_user::text <> 'authenticator' then
    raise exception 'Flight Consumer Preview activation preflight target is not the exact Preview API database';
  end if;
  if p_stripe_account_id is null
    or p_stripe_account_id !~ '^acct_[A-Za-z0-9]{8,127}$' then
    raise exception 'Flight Consumer Preview activation preflight Stripe account is invalid';
  end if;

  select * into v_control
    from public.flight_runtime_controls as control
   where control.control_key = 'global';
  if not found then raise exception 'Flight runtime control is unavailable'; end if;
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
    or v_control.bound_point_of_sale is distinct from 'US'
    or v_control.bound_execution_scope_sha256 is null
    or v_control.bound_execution_scope_sha256 !~ '^[0-9a-f]{64}$'
    or v_control.activation_evidence_sha256 is null
    or v_control.activation_evidence_sha256 !~ '^[0-9a-f]{64}$' then
    raise exception 'Flight Consumer Preview activation preflight requires the exact locked Preview predecessor';
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
  v_target_scope_sha256 := public.flight_consumer_preview_target_scope_sha256_v1(
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
    and v_control.bound_execution_scope_sha256 = v_target_scope_sha256;
  if not coalesce(v_is_v8_predecessor, false)
    and not coalesce(v_is_target_predecessor, false) then
    raise exception 'Flight Consumer Preview activation preflight predecessor binding is not canonical';
  end if;

  v_current_receipt_sha256 := public.flight_current_runtime_control_receipt_sha256_v1();
  return query select
    'flight-consumer-preview-activation-preflight-v1'::text,
    true,
    v_control.control_key,
    v_control.updated_at,
    v_control.bound_execution_scope_sha256,
    v_control.activation_evidence_sha256,
    v_current_receipt_sha256,
    v_target_scope_sha256,
    public.flight_consumer_preview_activation_manifest_sha256_v2();
end;
$get_flight_consumer_preview_activation_preflight$;

-- Replace the original activation function so the durable activation evidence
-- commits to the exact current 074-through-079 byte ledger rather than the
-- superseded migration-075 digest that existed when 076 was first authored.
create or replace function public.activate_flight_consumer_preview_v1(
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
  v_activation_manifest_sha256 text;
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
    or p_stripe_account_id !~ '^acct_[A-Za-z0-9]{8,127}$'
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

  v_activation_manifest_sha256 :=
    public.flight_consumer_preview_activation_manifest_sha256_v2();
  v_activation_evidence_sha256 := encode(extensions.digest(convert_to(
    'iratepilot.flight.consumer-preview.activation-evidence.v2' || chr(10)
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
        'activation_manifest_sha256', v_activation_manifest_sha256,
        'activation_control_migration', '202608250080',
        'migration_074_sha256',
          'c5cf8ace2562332255758736970a022bced59c76867b1b71ce7703f12bb7bb98',
        'migration_075_sha256',
          '3edaffb8bb93588932ad4d3c5cd0727b360c9f669709bab2da9c4e25130f5e49',
        'migration_076_sha256',
          '3023e8190fa10b7b5f5de57fa588eaba39fe082a4eb06218d60d12adf839f8b1',
        'migration_077_sha256',
          'f7aba46a72d6acfb9bf016faf8c666c37e3e3a73715114ebeadd12f2cd1f5ff7',
        'migration_078_sha256',
          '187c46f7bc08d7f8165341858ecfac918048aac8dce2f70cb594406647aed8fb',
        'migration_079_sha256',
          '02f5ed7064cfb2623e60c88bae8b042bdea08682473963e794711caf38d242ca'
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

-- Remove the legacy generic authenticated-admin UPDATE path. Authenticated
-- administrators retain digest-only reads, while activation and relock remain
-- the only application-role mutations and enforce their own admin/CAS checks.
drop policy if exists "Flight admins update runtime controls"
  on public.flight_runtime_controls;
revoke update on table public.flight_runtime_controls
  from public, anon, authenticated, service_role;

do $flight_consumer_preview_080_exclusive_update$
begin
  if has_table_privilege('authenticated', 'public.flight_runtime_controls', 'UPDATE')
    or has_any_column_privilege(
      'authenticated', 'public.flight_runtime_controls', 'UPDATE'
    )
    or exists (
      select 1 from pg_catalog.pg_policies
       where schemaname = 'public'
         and tablename = 'flight_runtime_controls'
         and cmd in ('ALL', 'UPDATE')
    ) then
    raise exception 'Flight Consumer Preview activation RPC is not the exclusive authenticated runtime-control mutation path';
  end if;
end;
$flight_consumer_preview_080_exclusive_update$;

revoke all on function public.flight_consumer_preview_activation_manifest_sha256_v2()
  from public, anon, authenticated, service_role;
revoke all on function public.get_flight_consumer_preview_activation_preflight_v1(text)
  from public, anon, authenticated, service_role;
revoke all on function public.activate_flight_consumer_preview_v1(
  timestamptz, text, text, text, text, text, text
) from public, anon, authenticated, service_role;

grant execute on function public.get_flight_consumer_preview_activation_preflight_v1(text)
  to authenticated;
grant execute on function public.activate_flight_consumer_preview_v1(
  timestamptz, text, text, text, text, text, text
) to authenticated;

comment on function public.flight_consumer_preview_activation_manifest_sha256_v2() is
  'Private exact-byte 074-through-079 activation manifest; migration 080 is identified by version and separately byte-pinned by the guarded installer.';
comment on function public.get_flight_consumer_preview_activation_preflight_v1(text) is
  'Authenticated-admin, locked-state-only CAS snapshot for the exact Consumer Preview activation target; exposes no credentials, passenger data, provider references, or service-role authority.';
comment on function public.activate_flight_consumer_preview_v1(
  timestamptz, text, text, text, text, text, text
) is
  'Exclusive authenticated-admin CAS activation for the one exact test-only Consumer Preview target with current 074-through-079 byte lineage and migration-080 contract identity.';

commit;
