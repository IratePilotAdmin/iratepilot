begin;

-- Duffel's ticket document `unique_identifier` is an opaque identifier within
-- an order. In TEST it may be reused by separate orders (including the
-- documented one-character fixture). The foundation constraint accidentally
-- treated the encrypted-reference digest as globally unique across an entire
-- execution scope, so a later valid TEST order could fail while its ticket was
-- promoted from pending to issued. Preserve duplicate protection at the
-- provider-order boundary instead.
do $flight_ticket_document_identity_scope_138_dependencies$
declare
  v_old_constraint pg_catalog.pg_constraint;
  v_old_columns text[];
  v_new_constraint_count integer;
begin
  if pg_catalog.to_regclass('public.flight_runtime_controls') is null
    or pg_catalog.to_regclass('public.flight_ticket_documents') is null then
    raise exception 'Flight ticket document identity-scope repair requires migration 068';
  end if;

  select constraint_row.* into v_old_constraint
    from pg_catalog.pg_constraint as constraint_row
   where constraint_row.conrelid =
       'public.flight_ticket_documents'::pg_catalog.regclass
     and constraint_row.conname =
       'flight_ticket_documents_execution_scope_sha256_execution_mo_key'
     and constraint_row.contype = 'u';

  if v_old_constraint.oid is null
    or not v_old_constraint.convalidated
    or v_old_constraint.condeferrable then
    raise exception 'Flight ticket document legacy uniqueness contract is missing or altered';
  end if;

  select pg_catalog.array_agg(attribute.attname order by key_column.ordinality)
    into v_old_columns
    from pg_catalog.unnest(v_old_constraint.conkey)
      with ordinality as key_column(attnum, ordinality)
    join pg_catalog.pg_attribute as attribute
      on attribute.attrelid = v_old_constraint.conrelid
     and attribute.attnum = key_column.attnum;

  if v_old_columns is distinct from array[
    'execution_scope_sha256', 'execution_mode', 'document_ref_sha256'
  ]::text[] then
    raise exception 'Flight ticket document legacy uniqueness columns are altered';
  end if;

  select count(*)::integer into v_new_constraint_count
    from pg_catalog.pg_constraint as constraint_row
   where constraint_row.conrelid =
       'public.flight_ticket_documents'::pg_catalog.regclass
     and constraint_row.conname =
       'flight_ticket_documents_order_id_document_ref_sha256_key';
  if v_new_constraint_count <> 0 then
    raise exception 'Flight ticket document order-scoped uniqueness already exists';
  end if;

  if exists (
    select 1
      from public.flight_ticket_documents as document
     where document.document_ref_sha256 is not null
     group by document.order_id, document.document_ref_sha256
    having count(*) > 1
  ) then
    raise exception 'Flight ticket document order-scoped identities already collide';
  end if;
end;
$flight_ticket_document_identity_scope_138_dependencies$;

-- Install only while every Preview execution capability is relocked. The DDL
-- itself is transactional, but this precondition also prevents a canary from
-- entering ticket issuance immediately before the table lock is acquired.
do $flight_ticket_document_identity_scope_138_relocked_precondition$
declare
  v_safe_count integer;
begin
  select count(*)::integer into v_safe_count
    from public.flight_runtime_controls as control
   where control.control_key = 'global'
     and control.execution_kill_switch_engaged
     and not control.synthetic_execution_enabled
     and not control.provider_sandbox_traffic_enabled
     and not control.provider_live_traffic_enabled
     and not control.shopping_enabled
     and not control.order_enabled
     and not control.payment_enabled
     and not control.ticketing_enabled
     and not control.servicing_enabled
     and not control.provider_events_enabled
     and not control.production_release_enabled;
  if v_safe_count <> 1 then
    raise exception 'Flight ticket document identity-scope migration 138 requires relock before repair';
  end if;
end;
$flight_ticket_document_identity_scope_138_relocked_precondition$;

alter table public.flight_ticket_documents
  drop constraint
    flight_ticket_documents_execution_scope_sha256_execution_mo_key;

alter table public.flight_ticket_documents
  add constraint flight_ticket_documents_order_id_document_ref_sha256_key
  unique (order_id, document_ref_sha256);

do $flight_ticket_document_identity_scope_138_verify$
declare
  v_columns text[];
  v_constraint_count integer;
begin
  if exists (
    select 1 from pg_catalog.pg_constraint as constraint_row
     where constraint_row.conrelid =
         'public.flight_ticket_documents'::pg_catalog.regclass
       and constraint_row.conname =
         'flight_ticket_documents_execution_scope_sha256_execution_mo_key'
  ) then
    raise exception 'Flight ticket document legacy uniqueness was not removed';
  end if;

  select count(*)::integer into v_constraint_count
    from pg_catalog.pg_constraint as constraint_row
   where constraint_row.conrelid =
       'public.flight_ticket_documents'::pg_catalog.regclass
     and constraint_row.conname =
       'flight_ticket_documents_order_id_document_ref_sha256_key'
     and constraint_row.contype = 'u'
     and constraint_row.convalidated
     and not constraint_row.condeferrable;

  select pg_catalog.array_agg(
      attribute.attname order by key_column.ordinality
    ) into v_columns
    from pg_catalog.pg_constraint as constraint_row
    cross join lateral pg_catalog.unnest(constraint_row.conkey)
      with ordinality as key_column(attnum, ordinality)
    join pg_catalog.pg_attribute as attribute
      on attribute.attrelid = constraint_row.conrelid
     and attribute.attnum = key_column.attnum
   where constraint_row.conrelid =
       'public.flight_ticket_documents'::pg_catalog.regclass
     and constraint_row.conname =
       'flight_ticket_documents_order_id_document_ref_sha256_key'
     and constraint_row.contype = 'u'
     and constraint_row.convalidated
     and not constraint_row.condeferrable;

  if v_constraint_count <> 1
    or v_columns is distinct from
      array['order_id', 'document_ref_sha256']::text[] then
    raise exception 'Flight ticket document order-scoped uniqueness verification failed';
  end if;
end;
$flight_ticket_document_identity_scope_138_verify$;

commit;
