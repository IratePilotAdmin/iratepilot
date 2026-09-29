begin;

create or replace function public.derive_email_logical_dedupe_key(
  p_template_data jsonb
)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select case
    when jsonb_typeof(p_template_data -> 'dedupe_key') = 'string'
      and p_template_data ->> 'dedupe_key' = btrim(
        p_template_data ->> 'dedupe_key'
      )
      and char_length(p_template_data ->> 'dedupe_key') between 1 and 200
    then btrim(p_template_data ->> 'dedupe_key')
    else null
  end;
$$;

revoke all on function public.derive_email_logical_dedupe_key(jsonb)
  from public, anon, authenticated;
grant execute on function public.derive_email_logical_dedupe_key(jsonb)
  to service_role;

-- Serialize the duplicate preflight with outbox writers. Existing rows are
-- retained. A missing or malformed dedupe key remains unclaimable; a row with
-- a valid key is still subject to the worker's fail-closed payload validation.
lock table public.email_outbox, public.email_delivery_events
  in share row exclusive mode;

do $$
declare
  v_duplicate_key_groups bigint;
begin
  select count(*)
  into v_duplicate_key_groups
  from (
    select public.derive_email_logical_dedupe_key(
      template_data
    ) as logical_dedupe_key
    from public.email_outbox
    where public.derive_email_logical_dedupe_key(template_data) is not null
    group by public.derive_email_logical_dedupe_key(template_data)
    having count(*) > 1
  ) as duplicate_groups;

  if v_duplicate_key_groups > 0 then
    raise exception
      'Email logical-deduplication preflight failed: % duplicate key group(s)',
      v_duplicate_key_groups
      using
        errcode = '23505',
        hint = 'Resolve duplicate logical keys under a separate reviewed data-change gate before applying migration 202608220074.';
  end if;
end;
$$;

alter table public.email_outbox
  add column logical_dedupe_key text generated always as (
    public.derive_email_logical_dedupe_key(template_data)
  ) stored;

create unique index email_outbox_logical_dedupe_key_key
  on public.email_outbox (logical_dedupe_key)
  where logical_dedupe_key is not null;

-- Keep every safety allowlist and state matrix in an immutable function whose
-- exact source is pinned by the runtime-safety receipt below. Named CHECK
-- constraints invoke these functions directly, so weakening either the
-- function or its table wiring makes the receipt fail closed.
create or replace function public.is_email_outbox_safety_disposition_valid(
  p_disposition text
)
returns boolean
language sql
immutable
parallel safe
set search_path = ''
as $$
  select p_disposition is null or p_disposition = 'quarantined';
$$;

create or replace function public.is_email_outbox_safety_reason_valid(
  p_reason text
)
returns boolean
language sql
immutable
parallel safe
set search_path = ''
as $$
  select p_reason is null or p_reason in (
    'template_not_allowlisted',
    'payload_schema_invalid',
    'logical_dedupe_invalid',
    'source_record_missing',
    'source_state_stale',
    'recipient_binding_invalid',
    'recipient_not_allowlisted',
    'recipient_suppressed',
    'action_url_invalid'
  );
$$;

create or replace function public.is_email_outbox_provider_send_attempt_valid(
  p_provider_send_attempt_id uuid,
  p_provider_send_started_at timestamptz,
  p_attempts integer,
  p_status text,
  p_safety_disposition text
)
returns boolean
language sql
immutable
parallel safe
set search_path = ''
as $$
  select
    (
      p_provider_send_attempt_id is null
      and p_provider_send_started_at is null
    )
    or (
      p_provider_send_attempt_id is not null
      and p_provider_send_started_at is not null
      and coalesce(p_attempts >= 1, false)
      and coalesce(
        p_status in ('processing', 'sent', 'failed', 'dead_letter'),
        false
      )
      and p_safety_disposition is null
    );
$$;

create or replace function public.is_email_outbox_safety_quarantine_valid(
  p_safety_disposition text,
  p_safety_reason_category text,
  p_safety_dispositioned_at timestamptz,
  p_status text,
  p_processed_at timestamptz,
  p_last_error text,
  p_resend_email_id text,
  p_delivery_status text,
  p_delivery_event_at timestamptz,
  p_delivery_detail text,
  p_provider_send_attempt_id uuid,
  p_provider_send_started_at timestamptz
)
returns boolean
language sql
immutable
parallel safe
set search_path = ''
as $$
  select
    (
      p_safety_disposition is null
      and p_safety_reason_category is null
      and p_safety_dispositioned_at is null
    )
    or (
      coalesce(p_safety_disposition = 'quarantined', false)
      and p_safety_reason_category is not null
      and p_safety_dispositioned_at is not null
      and coalesce(p_status = 'dead_letter', false)
      and p_processed_at is not null
      and p_last_error is null
      and p_resend_email_id is null
      and p_delivery_status is null
      and p_delivery_event_at is null
      and p_delivery_detail is null
      and p_provider_send_attempt_id is null
      and p_provider_send_started_at is null
    );
$$;

revoke all on function public.is_email_outbox_safety_disposition_valid(text)
  from public, anon, authenticated;
revoke all on function public.is_email_outbox_safety_reason_valid(text)
  from public, anon, authenticated;
revoke all on function public.is_email_outbox_provider_send_attempt_valid(uuid,timestamptz,integer,text,text)
  from public, anon, authenticated;
revoke all on function public.is_email_outbox_safety_quarantine_valid(text,text,timestamptz,text,timestamptz,text,text,text,timestamptz,text,uuid,timestamptz)
  from public, anon, authenticated;
grant execute on function public.is_email_outbox_safety_disposition_valid(text)
  to service_role;
grant execute on function public.is_email_outbox_safety_reason_valid(text)
  to service_role;
grant execute on function public.is_email_outbox_provider_send_attempt_valid(uuid,timestamptz,integer,text,text)
  to service_role;
grant execute on function public.is_email_outbox_safety_quarantine_valid(text,text,timestamptz,text,timestamptz,text,text,text,timestamptz,text,uuid,timestamptz)
  to service_role;

-- These fields are intentionally nullable so the migration does not classify
-- or otherwise mutate existing pending rows. The worker may use only this
-- terminal, sanitized state when action-time validation fails before sending.
alter table public.email_outbox
  add column provider_send_attempt_id uuid,
  add column provider_send_started_at timestamptz,
  add column safety_disposition text,
  add column safety_reason_category text,
  add column safety_dispositioned_at timestamptz,
  add constraint email_outbox_safety_disposition_check
    check (public.is_email_outbox_safety_disposition_valid(
      safety_disposition
    )),
  add constraint email_outbox_safety_reason_category_check
    check (public.is_email_outbox_safety_reason_valid(
      safety_reason_category
    )),
  add constraint email_outbox_provider_send_attempt_check
    check (public.is_email_outbox_provider_send_attempt_valid(
      provider_send_attempt_id,
      provider_send_started_at,
      attempts,
      status,
      safety_disposition
    )),
  add constraint email_outbox_safety_quarantine_check
    check (public.is_email_outbox_safety_quarantine_valid(
      safety_disposition,
      safety_reason_category,
      safety_dispositioned_at,
      status,
      processed_at,
      last_error,
      resend_email_id,
      delivery_status,
      delivery_event_at,
      delivery_detail,
      provider_send_attempt_id,
      provider_send_started_at
    ));

create index email_outbox_safety_quarantine_idx
  on public.email_outbox (safety_disposition, safety_reason_category, created_at)
  where safety_disposition = 'quarantined';

create or replace function public.claim_transactional_email_job()
returns setof public.email_outbox
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job_id uuid;
begin
  select id into v_job_id
  from public.email_outbox
  where logical_dedupe_key is not null
    and safety_disposition is null
    and resend_email_id is null
    and processed_at is null
    and delivery_status is null
    and delivery_event_at is null
    and delivery_detail is null
    and provider_send_attempt_id is null
    and provider_send_started_at is null
    and scheduled_at <= now()
    and attempts < 5
    and (
      status in ('pending', 'failed')
      or (status = 'processing' and updated_at < now() - interval '15 minutes')
    )
  order by scheduled_at, created_at
  for update skip locked
  limit 1;

  if v_job_id is null then return; end if;

  return query
  update public.email_outbox
  set status = 'processing', attempts = attempts + 1,
      last_error = null, updated_at = now()
  where id = v_job_id
  returning *;
end;
$$;

revoke all on function public.claim_transactional_email_job()
  from public, anon, authenticated;
grant execute on function public.claim_transactional_email_job() to service_role;

create or replace function public.classify_email_recipient_account(p_email text)
returns table (
  account_exists boolean,
  is_admin boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_normalized_email text;
begin
  v_normalized_email := lower(btrim(coalesce(p_email, '')));
  if v_normalized_email = ''
    or char_length(v_normalized_email) > 254
    or position('@' in v_normalized_email) <= 1
  then
    raise exception 'Email recipient account classification input is invalid'
      using errcode = '22023';
  end if;

  return query
  select
    exists (
      select 1
      from auth.users as candidate
      where lower(btrim(candidate.email)) = v_normalized_email
    ),
    exists (
      select 1
      from auth.users as candidate
      join public.profiles as profile on profile.id = candidate.id
      where lower(btrim(candidate.email)) = v_normalized_email
        and profile.role = 'admin'
    );
end;
$$;

revoke all on function public.classify_email_recipient_account(text)
  from public, anon, authenticated;
grant execute on function public.classify_email_recipient_account(text)
  to service_role;

create or replace function public.is_email_delivery_correlation_status_valid(
  p_status text
)
returns boolean
language sql
immutable
parallel safe
set search_path = ''
as $$
  select coalesce(p_status in (
    'unverified',
    'matched_outbox',
    'trusted_untracked',
    'orphaned',
    'legacy_unclassified'
  ), false);
$$;

create or replace function public.is_email_delivery_disposition_status_valid(
  p_status text
)
returns boolean
language sql
immutable
parallel safe
set search_path = ''
as $$
  select coalesce(p_status in (
    'pending_review',
    'not_required',
    'quarantined',
    'dismissed',
    'legacy_unclassified'
  ), false);
$$;

create or replace function public.is_email_delivery_disposition_code_valid(
  p_code text
)
returns boolean
language sql
immutable
parallel safe
set search_path = ''
as $$
  select p_code is null or p_code in (
    'matched_outbox',
    'trusted_account_event',
    'invalid_outbox_tag',
    'tagged_outbox_missing',
    'correlation_mismatch',
    'legacy_correlation_ambiguous',
    'manual_rejected',
    'legacy_unclassified'
  );
$$;

create or replace function public.is_email_delivery_event_state_valid(
  p_correlated_outbox_id uuid,
  p_correlation_status text,
  p_disposition_status text,
  p_disposition_code text,
  p_dispositioned_at timestamptz,
  p_dispositioned_by uuid,
  p_processing_status text,
  p_processed_at timestamptz,
  p_error_message text
)
returns boolean
language sql
immutable
parallel safe
set search_path = ''
as $$
  select coalesce(
    (
      p_correlation_status = 'unverified'
      and p_correlated_outbox_id is null
      and p_disposition_status = 'pending_review'
      and p_disposition_code is null
      and p_dispositioned_at is null
      and p_dispositioned_by is null
      and (
        (
          p_processing_status = 'processing'
          and p_error_message is null
        )
        or (
          p_processing_status = 'failed'
          and p_error_message = 'transient_processing_failure'
        )
      )
      and p_processed_at is null
    )
    or (
      p_correlation_status = 'matched_outbox'
      and p_correlated_outbox_id is not null
      and p_disposition_status = 'not_required'
      and p_disposition_code = 'matched_outbox'
      and p_dispositioned_at is null
      and p_dispositioned_by is null
      and p_processing_status = 'processed'
      and p_processed_at is not null
      and p_error_message is null
    )
    or (
      p_correlation_status = 'trusted_untracked'
      and p_correlated_outbox_id is null
      and p_disposition_status = 'not_required'
      and p_disposition_code = 'trusted_account_event'
      and p_dispositioned_at is null
      and p_dispositioned_by is null
      and p_processing_status = 'processed'
      and p_processed_at is not null
      and p_error_message is null
    )
    or (
      p_correlation_status = 'orphaned'
      and p_correlated_outbox_id is null
      and p_processing_status = 'failed'
      and p_error_message is null
      and p_processed_at is null
      and p_dispositioned_at is not null
      and (
        (
          p_disposition_status = 'quarantined'
          and p_disposition_code in (
            'invalid_outbox_tag',
            'tagged_outbox_missing',
            'correlation_mismatch',
            'legacy_correlation_ambiguous'
          )
          and p_dispositioned_by is null
        )
        or (
          p_disposition_status = 'dismissed'
          and p_disposition_code = 'manual_rejected'
          and p_dispositioned_by is not null
        )
      )
    )
    or (
      p_correlation_status = 'legacy_unclassified'
      and p_correlated_outbox_id is null
      and p_disposition_status = 'legacy_unclassified'
      and p_disposition_code = 'legacy_unclassified'
      and p_dispositioned_at is null
      and p_dispositioned_by is null
    ),
    false
  );
$$;

revoke all on function public.is_email_delivery_correlation_status_valid(text)
  from public, anon, authenticated;
revoke all on function public.is_email_delivery_disposition_status_valid(text)
  from public, anon, authenticated;
revoke all on function public.is_email_delivery_disposition_code_valid(text)
  from public, anon, authenticated;
revoke all on function public.is_email_delivery_event_state_valid(uuid,text,text,text,timestamptz,uuid,text,timestamptz,text)
  from public, anon, authenticated;
grant execute on function public.is_email_delivery_correlation_status_valid(text)
  to service_role;
grant execute on function public.is_email_delivery_disposition_status_valid(text)
  to service_role;
grant execute on function public.is_email_delivery_disposition_code_valid(text)
  to service_role;
grant execute on function public.is_email_delivery_event_state_valid(uuid,text,text,text,timestamptz,uuid,text,timestamptz,text)
  to service_role;

alter table public.email_delivery_events
  add column correlated_outbox_id uuid
    references public.email_outbox(id) on delete restrict,
  add column correlation_status text,
  add column disposition_status text,
  add column disposition_code text,
  add column dispositioned_at timestamptz,
  add column dispositioned_by uuid
    references public.profiles(id) on delete restrict;

-- Existing delivery-event rows cannot be independently re-correlated from the
-- stored ledger alone. Preserve them under an explicit legacy state instead of
-- guessing a correlation or disposition.
update public.email_delivery_events
set correlation_status = 'legacy_unclassified',
    disposition_status = 'legacy_unclassified',
    disposition_code = 'legacy_unclassified'
where correlation_status is null;

alter table public.email_delivery_events
  alter column correlation_status set default 'unverified',
  alter column correlation_status set not null,
  alter column disposition_status set default 'pending_review',
  alter column disposition_status set not null,
  add constraint email_delivery_events_correlation_status_check
    check (public.is_email_delivery_correlation_status_valid(
      correlation_status
    )),
  add constraint email_delivery_events_disposition_status_check
    check (public.is_email_delivery_disposition_status_valid(
      disposition_status
    )),
  add constraint email_delivery_events_disposition_code_check
    check (public.is_email_delivery_disposition_code_valid(
      disposition_code
    )),
  add constraint email_delivery_events_fail_closed_correlation_check
    check (public.is_email_delivery_event_state_valid(
      correlated_outbox_id,
      correlation_status,
      disposition_status,
      disposition_code,
      dispositioned_at,
      dispositioned_by,
      processing_status,
      processed_at,
      error_message
    ));

create index email_delivery_events_disposition_review_idx
  on public.email_delivery_events (
    disposition_status,
    correlation_status,
    created_at
  )
  where disposition_status in ('pending_review', 'quarantined');

comment on column public.email_outbox.logical_dedupe_key is
  'Normalized logical message key generated from template_data.dedupe_key. Missing or malformed keys remain null; other payload validity is enforced before send.';
comment on column public.email_outbox.safety_disposition is
  'Terminal pre-send quarantine. It stores no raw validation error and grants no retry or send authority.';
comment on column public.email_outbox.safety_reason_category is
  'Allowlisted non-PII reason for a pre-send quarantine.';
comment on column public.email_delivery_events.correlation_status is
  'Fail-closed outbox correlation state. Orphaned tagged events cannot be marked processed.';
comment on column public.email_delivery_events.disposition_status is
  'Sanitized review state for delivery events; quarantine and dismissal never imply successful webhook processing.';

create or replace function public.get_email_runtime_safety_version()
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_dedupe_deriver_oid oid;
  v_dedupe_deriver_source_digest text;
  v_dedupe_deriver_contract_ready boolean;
  v_claim_oid oid;
  v_claim_definition text;
  v_claim_source_digest text;
  v_claim_contract_ready boolean;
  v_classifier_oid oid;
  v_classifier_definition text;
  v_classifier_source_digest text;
  v_classifier_identity_arguments text;
  v_classifier_result text;
  v_classifier_contract_ready boolean;
  v_generated_expression text;
  v_index_definition text;
  v_nonce_columns_ready boolean;
  v_validator_contracts_ready boolean;
  v_controls_ready boolean;
begin
  select
    procedure_record.oid,
    md5(btrim(pg_catalog.regexp_replace(
      replace(procedure_record.prosrc, chr(13), ''),
      '[[:space:]]+',
      ' ',
      'g'
    ))),
    procedure_record.prorettype = 'text'::regtype
      and not procedure_record.proretset
      and procedure_record.provolatile = 'i'
      and procedure_record.proparallel = 's'
      and not procedure_record.prosecdef
      and not procedure_record.proisstrict
      and procedure_record.proconfig = array['search_path=""']
      and language_record.lanname = 'sql'
      and coalesce(pg_catalog.has_function_privilege(
        'service_role',
        procedure_record.oid,
        'execute'
      ), false)
      and not coalesce(pg_catalog.has_function_privilege(
        'anon',
        procedure_record.oid,
        'execute'
      ), true)
      and not coalesce(pg_catalog.has_function_privilege(
        'authenticated',
        procedure_record.oid,
        'execute'
      ), true)
  into
    v_dedupe_deriver_oid,
    v_dedupe_deriver_source_digest,
    v_dedupe_deriver_contract_ready
  from pg_catalog.pg_proc as procedure_record
  join pg_catalog.pg_language as language_record
    on language_record.oid = procedure_record.prolang
  where procedure_record.oid = pg_catalog.to_regprocedure(
    'public.derive_email_logical_dedupe_key(jsonb)'
  );

  select
    procedure_record.oid,
    lower(pg_catalog.pg_get_functiondef(procedure_record.oid)),
    md5(btrim(pg_catalog.regexp_replace(
      replace(procedure_record.prosrc, chr(13), ''),
      '[[:space:]]+',
      ' ',
      'g'
    ))),
    procedure_record.prorettype = 'public.email_outbox'::regtype
      and procedure_record.proretset
      and procedure_record.provolatile = 'v'
      and procedure_record.proparallel = 'u'
      and procedure_record.prosecdef
      and not procedure_record.proisstrict
      and procedure_record.proconfig = array['search_path=""']
      and language_record.lanname = 'plpgsql'
  into
    v_claim_oid,
    v_claim_definition,
    v_claim_source_digest,
    v_claim_contract_ready
  from pg_catalog.pg_proc as procedure_record
  join pg_catalog.pg_language as language_record
    on language_record.oid = procedure_record.prolang
  where procedure_record.oid = pg_catalog.to_regprocedure(
    'public.claim_transactional_email_job()'
  );

  select
    lower(pg_catalog.pg_get_expr(default_record.adbin, default_record.adrelid))
  into v_generated_expression
  from pg_catalog.pg_attribute as attribute_record
  join pg_catalog.pg_attrdef as default_record
    on default_record.adrelid = attribute_record.attrelid
    and default_record.adnum = attribute_record.attnum
  where attribute_record.attrelid = 'public.email_outbox'::regclass
    and attribute_record.attname = 'logical_dedupe_key'
    and attribute_record.attgenerated = 's'
    and attribute_record.atttypid = 'text'::regtype
    and not attribute_record.attnotnull
    and not attribute_record.attisdropped;

  select lower(pg_catalog.pg_get_indexdef(index_record.indexrelid))
  into v_index_definition
  from pg_catalog.pg_index as index_record
  join pg_catalog.pg_class as class_record
    on class_record.oid = index_record.indexrelid
  join pg_catalog.pg_namespace as namespace_record
    on namespace_record.oid = class_record.relnamespace
  where namespace_record.nspname = 'public'
    and class_record.relname = 'email_outbox_logical_dedupe_key_key'
    and index_record.indrelid = 'public.email_outbox'::regclass
    and index_record.indisunique
    and index_record.indisvalid
    and index_record.indisready
    and index_record.indnkeyatts = 1;

  select
    procedure_record.oid,
    lower(pg_catalog.pg_get_functiondef(procedure_record.oid)),
    md5(btrim(pg_catalog.regexp_replace(
      replace(procedure_record.prosrc, chr(13), ''),
      '[[:space:]]+',
      ' ',
      'g'
    ))),
    lower(pg_catalog.pg_get_function_identity_arguments(procedure_record.oid)),
    lower(pg_catalog.pg_get_function_result(procedure_record.oid)),
    procedure_record.prorettype = 'record'::regtype
      and procedure_record.proretset
      and procedure_record.provolatile = 's'
      and procedure_record.proparallel = 'u'
      and procedure_record.prosecdef
      and not procedure_record.proisstrict
      and procedure_record.proconfig = array['search_path=""']
      and language_record.lanname = 'plpgsql'
  into
    v_classifier_oid,
    v_classifier_definition,
    v_classifier_source_digest,
    v_classifier_identity_arguments,
    v_classifier_result,
    v_classifier_contract_ready
  from pg_catalog.pg_proc as procedure_record
  join pg_catalog.pg_language as language_record
    on language_record.oid = procedure_record.prolang
  where procedure_record.oid = pg_catalog.to_regprocedure(
    'public.classify_email_recipient_account(text)'
  );

  select
    count(*) = 2
    and bool_and(
      not attribute_record.attisdropped
      and attribute_record.attgenerated = ''
      and not attribute_record.attnotnull
      and (
        (
          attribute_record.attname = 'provider_send_attempt_id'
          and attribute_record.atttypid = 'uuid'::regtype
        )
        or (
          attribute_record.attname = 'provider_send_started_at'
          and attribute_record.atttypid = 'timestamp with time zone'::regtype
        )
      )
    )
  into v_nonce_columns_ready
  from pg_catalog.pg_attribute as attribute_record
  where attribute_record.attrelid = 'public.email_outbox'::regclass
    and attribute_record.attname in (
      'provider_send_attempt_id',
      'provider_send_started_at'
    );

  select
    count(*) = 8
    and bool_and(
      procedure_record.oid is not null
      and procedure_record.prorettype = 'boolean'::regtype
      and not procedure_record.proretset
      and procedure_record.provolatile = 'i'
      and procedure_record.proparallel = 's'
      and not procedure_record.prosecdef
      and not procedure_record.proisstrict
      and procedure_record.proconfig = array['search_path=""']
      and language_record.lanname = 'sql'
      and md5(btrim(pg_catalog.regexp_replace(
        replace(procedure_record.prosrc, chr(13), ''),
        '[[:space:]]+',
        ' ',
        'g'
      ))) = expected.source_digest
      and coalesce(pg_catalog.has_function_privilege(
        'service_role',
        procedure_record.oid,
        'execute'
      ), false)
      and not coalesce(pg_catalog.has_function_privilege(
        'anon',
        procedure_record.oid,
        'execute'
      ), true)
      and not coalesce(pg_catalog.has_function_privilege(
        'authenticated',
        procedure_record.oid,
        'execute'
      ), true)
      and constraint_record.oid is not null
      and constraint_record.contype = 'c'
      and constraint_record.convalidated
      and pg_catalog.regexp_replace(
        lower(pg_catalog.pg_get_constraintdef(
          constraint_record.oid,
          false
        )),
        '[[:space:]]+',
        '',
        'g'
      ) in (
        'check(' || expected.constraint_call || ')',
        'check(public.' || expected.constraint_call || ')'
      )
    )
  into v_validator_contracts_ready
  from (
    values
      (
        'public.is_email_outbox_safety_disposition_valid(text)',
        '912d6a808e6eb9983873dcdf0e9c8eea',
        'public.email_outbox',
        'email_outbox_safety_disposition_check',
        'is_email_outbox_safety_disposition_valid(safety_disposition)'
      ),
      (
        'public.is_email_outbox_safety_reason_valid(text)',
        '6e9531a476105c06f0e30f4f5ec49b70',
        'public.email_outbox',
        'email_outbox_safety_reason_category_check',
        'is_email_outbox_safety_reason_valid(safety_reason_category)'
      ),
      (
        'public.is_email_outbox_provider_send_attempt_valid(uuid,timestamp with time zone,integer,text,text)',
        '5d09605a72db71ecb2bbadd804787ea0',
        'public.email_outbox',
        'email_outbox_provider_send_attempt_check',
        'is_email_outbox_provider_send_attempt_valid(provider_send_attempt_id,provider_send_started_at,attempts,status,safety_disposition)'
      ),
      (
        'public.is_email_outbox_safety_quarantine_valid(text,text,timestamp with time zone,text,timestamp with time zone,text,text,text,timestamp with time zone,text,uuid,timestamp with time zone)',
        'acc5f25e390e54ec494d07f04c206efe',
        'public.email_outbox',
        'email_outbox_safety_quarantine_check',
        'is_email_outbox_safety_quarantine_valid(safety_disposition,safety_reason_category,safety_dispositioned_at,status,processed_at,last_error,resend_email_id,delivery_status,delivery_event_at,delivery_detail,provider_send_attempt_id,provider_send_started_at)'
      ),
      (
        'public.is_email_delivery_correlation_status_valid(text)',
        '5b8fcb8bffdbcb75023c9454a03b440c',
        'public.email_delivery_events',
        'email_delivery_events_correlation_status_check',
        'is_email_delivery_correlation_status_valid(correlation_status)'
      ),
      (
        'public.is_email_delivery_disposition_status_valid(text)',
        'afec88d5d67873ace720c53d047fea18',
        'public.email_delivery_events',
        'email_delivery_events_disposition_status_check',
        'is_email_delivery_disposition_status_valid(disposition_status)'
      ),
      (
        'public.is_email_delivery_disposition_code_valid(text)',
        '5c858f5d7f75d318bc20d81e13856113',
        'public.email_delivery_events',
        'email_delivery_events_disposition_code_check',
        'is_email_delivery_disposition_code_valid(disposition_code)'
      ),
      (
        'public.is_email_delivery_event_state_valid(uuid,text,text,text,timestamp with time zone,uuid,text,timestamp with time zone,text)',
        '241fe02b53ce2919de074e152af198ca',
        'public.email_delivery_events',
        'email_delivery_events_fail_closed_correlation_check',
        'is_email_delivery_event_state_valid(correlated_outbox_id,correlation_status,disposition_status,disposition_code,dispositioned_at,dispositioned_by,processing_status,processed_at,error_message)'
      )
  ) as expected(
    function_signature,
    source_digest,
    relation_name,
    constraint_name,
    constraint_call
  )
  left join pg_catalog.pg_proc as procedure_record
    on procedure_record.oid = pg_catalog.to_regprocedure(
      expected.function_signature
    )
  left join pg_catalog.pg_language as language_record
    on language_record.oid = procedure_record.prolang
  left join pg_catalog.pg_constraint as constraint_record
    on constraint_record.conrelid = pg_catalog.to_regclass(
      expected.relation_name
    )
    and constraint_record.conname = expected.constraint_name;

  select
    v_dedupe_deriver_oid is not null
    and v_dedupe_deriver_source_digest = '99e5ab1111e9ffedffb4472f429ef2da'
    and v_dedupe_deriver_contract_ready
    and v_claim_oid is not null
    and v_classifier_oid is not null
    and v_claim_contract_ready
    and v_classifier_contract_ready
    and v_claim_source_digest = '4ebdae2d3064f4e884529e54d000a0be'
    and v_classifier_source_digest = '96415202253897dbb4ff071b9aa52e5d'
    and v_classifier_identity_arguments = 'p_email text'
    and v_classifier_result = 'table(account_exists boolean, is_admin boolean)'
    and v_nonce_columns_ready
    and v_validator_contracts_ready
    and v_generated_expression is not null
    and pg_catalog.regexp_replace(
      lower(v_generated_expression),
      '[[:space:]]+',
      '',
      'g'
    ) in (
      'derive_email_logical_dedupe_key(template_data)',
      'public.derive_email_logical_dedupe_key(template_data)',
      '(derive_email_logical_dedupe_key(template_data))',
      '(public.derive_email_logical_dedupe_key(template_data))'
    )
    and v_index_definition is not null
    and pg_catalog.regexp_replace(
      v_index_definition,
      '[[:space:]]+',
      '',
      'g'
    ) in (
      'createuniqueindexemail_outbox_logical_dedupe_key_keyonpublic.email_outboxusingbtree(logical_dedupe_key)where(logical_dedupe_keyisnotnull)',
      'createuniqueindexemail_outbox_logical_dedupe_key_keyonpublic.email_outboxusingbtree(logical_dedupe_key)wherelogical_dedupe_keyisnotnull'
    )
    and coalesce(pg_catalog.has_function_privilege('service_role', v_claim_oid, 'execute'), false)
    and not coalesce(pg_catalog.has_function_privilege('anon', v_claim_oid, 'execute'), true)
    and not coalesce(pg_catalog.has_function_privilege('authenticated', v_claim_oid, 'execute'), true)
    and coalesce(pg_catalog.has_function_privilege('service_role', v_classifier_oid, 'execute'), false)
    and not coalesce(pg_catalog.has_function_privilege('anon', v_classifier_oid, 'execute'), true)
    and not coalesce(pg_catalog.has_function_privilege('authenticated', v_classifier_oid, 'execute'), true)
    and position('security definer' in v_claim_definition) > 0
    and position('set search_path to ''''' in v_claim_definition) > 0
    and coalesce(position('logical_dedupe_key is not null' in v_claim_definition) > 0, false)
    and coalesce(position('safety_disposition is null' in v_claim_definition) > 0, false)
    and coalesce(position('resend_email_id is null' in v_claim_definition) > 0, false)
    and coalesce(position('processed_at is null' in v_claim_definition) > 0, false)
    and coalesce(position('delivery_status is null' in v_claim_definition) > 0, false)
    and coalesce(position('delivery_event_at is null' in v_claim_definition) > 0, false)
    and coalesce(position('delivery_detail is null' in v_claim_definition) > 0, false)
    and coalesce(position('provider_send_attempt_id is null' in v_claim_definition) > 0, false)
    and coalesce(position('provider_send_started_at is null' in v_claim_definition) > 0, false)
    and coalesce(position('attempts < 5' in v_claim_definition) > 0, false)
    and coalesce(position('for update skip locked' in v_claim_definition) > 0, false)
    and position('security definer' in v_classifier_definition) > 0
    and position('set search_path to ''''' in v_classifier_definition) > 0
    and position('from auth.users' in v_classifier_definition) > 0
    and position('join public.profiles' in v_classifier_definition) > 0
    and position('profile.role = ''admin''' in v_classifier_definition) > 0
  into v_controls_ready;

  if not coalesce(v_controls_ready, false) then
    raise exception 'Email runtime database safety controls are unavailable or drifted'
      using errcode = '55000';
  end if;

  return 'email_runtime_safety_v1';
end;
$$;

revoke all on function public.get_email_runtime_safety_version()
  from public, anon, authenticated;
grant execute on function public.get_email_runtime_safety_version()
  to service_role;

commit;
