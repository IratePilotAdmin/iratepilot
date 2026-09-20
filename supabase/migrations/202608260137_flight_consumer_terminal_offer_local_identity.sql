begin;

-- Forward-only identity projection for terminal offer-evidence recovery. The
-- only authority added here is a service-owned read of the durable local offer
-- identity after migration 097 has proved the complete historical evidence,
-- provider-attempt, original-response, and captured-payment chain. No provider
-- or payment dispatch authority is added.
do $flight_consumer_preview_098_dependencies$
declare
  v_loader_source text;
  v_loader_sha256 text;
  v_loader_security_definer boolean;
  v_loader_config text[];
  v_loader_acl aclitem[];
  v_loader_owner oid;
  v_loader_language oid;
  v_loader_kind text;
  v_loader_overload_count integer;
  v_identity_overload_count integer;
  v_postgres_role oid;
  v_service_role oid;
  v_plpgsql_language oid;
  v_vault_owner oid;
  v_vault_kind text;
  v_vault_rls boolean;
  v_vault_force_rls boolean;
  v_vault_acl aclitem[];
begin
  select role.oid into v_postgres_role
    from pg_catalog.pg_roles as role
   where role.rolname = 'postgres';
  select role.oid into v_service_role
    from pg_catalog.pg_roles as role
   where role.rolname = 'service_role';
  select language.oid into v_plpgsql_language
    from pg_catalog.pg_language as language
   where language.lanname = 'plpgsql';
  select count(*)::integer into v_loader_overload_count
    from pg_catalog.pg_proc as routine
    join pg_catalog.pg_namespace as namespace
      on namespace.oid = routine.pronamespace
   where namespace.nspname = 'public'
     and routine.proname =
       'load_flight_offer_evidence_for_terminal_recovery_v1';
  select count(*)::integer into v_identity_overload_count
    from pg_catalog.pg_proc as routine
    join pg_catalog.pg_namespace as namespace
      on namespace.oid = routine.pronamespace
   where namespace.nspname = 'public'
     and routine.proname =
       'get_flight_offer_local_identity_for_terminal_recovery_v1';

  if to_regclass('public.flight_runtime_controls') is null
    or to_regclass('public.flight_offer_evidence_vault') is null
    or v_postgres_role is null
    or v_service_role is null
    or v_plpgsql_language is null
    or v_loader_overload_count <> 1
    or to_regprocedure(
      'public.load_flight_offer_evidence_for_terminal_recovery_v1(uuid,uuid,uuid,text,text)'
    ) is null
    or to_regprocedure('public.load_flight_offer_evidence_v1(text,uuid,text)')
      is null then
    raise exception 'Flight Consumer Preview terminal local identity requires migrations 068 through 097';
  end if;
  if v_identity_overload_count <> 0
    or to_regprocedure(
      'public.get_flight_offer_local_identity_for_terminal_recovery_v1(uuid,uuid,uuid,text,text)'
    ) is not null then
    raise exception 'Flight terminal offer local-identity recovery RPC or sibling overload already exists';
  end if;
  if to_regprocedure('extensions.digest(bytea,text)') is null then
    raise exception 'Flight terminal offer local identity requires reviewed SHA-256 support';
  end if;

  select routine.prosrc, routine.prosecdef, routine.proconfig,
      routine.proacl, routine.proowner, routine.prolang,
      routine.prokind::text
    into v_loader_source, v_loader_security_definer, v_loader_config,
      v_loader_acl, v_loader_owner, v_loader_language, v_loader_kind
    from pg_catalog.pg_proc as routine
   where routine.oid = to_regprocedure(
     'public.load_flight_offer_evidence_for_terminal_recovery_v1(uuid,uuid,uuid,text,text)'
   );
  select relation.relowner, relation.relkind::text,
      relation.relrowsecurity, relation.relforcerowsecurity, relation.relacl
    into v_vault_owner, v_vault_kind, v_vault_rls,
      v_vault_force_rls, v_vault_acl
    from pg_catalog.pg_class as relation
   where relation.oid = 'public.flight_offer_evidence_vault'::regclass;
  v_loader_acl := case
    when coalesce(cardinality(v_loader_acl), 0) = 0
      then acldefault('f', v_loader_owner)
    else v_loader_acl
  end;
  v_vault_acl := case
    when coalesce(cardinality(v_vault_acl), 0) = 0
      then acldefault('r', v_vault_owner)
    else v_vault_acl
  end;
  v_loader_sha256 := encode(
    extensions.digest(
      convert_to(
        replace(v_loader_source, chr(13) || chr(10), chr(10)),
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  );
  if v_loader_source is null
    or v_loader_sha256 <> 'd1165286160c3ae5694950bbebfac75adcbab6a708f5e2343dba4d752e7b8172'
    or not coalesce(v_loader_security_definer, false)
    or v_loader_owner is distinct from v_postgres_role
    or v_loader_language is distinct from v_plpgsql_language
    or v_loader_kind is distinct from 'f'
    or v_loader_config is distinct from
      array['search_path=pg_catalog, public, extensions']::text[]
    or pg_get_function_result(to_regprocedure(
      'public.load_flight_offer_evidence_for_terminal_recovery_v1(uuid,uuid,uuid,text,text)'
    )) is distinct from pg_get_function_result(to_regprocedure(
      'public.load_flight_offer_evidence_v1(text,uuid,text)'
    ))
    or not has_function_privilege(
      'service_role',
      'public.load_flight_offer_evidence_for_terminal_recovery_v1(uuid,uuid,uuid,text,text)',
      'EXECUTE'
    )
    or has_function_privilege(
      'authenticated',
      'public.load_flight_offer_evidence_for_terminal_recovery_v1(uuid,uuid,uuid,text,text)',
      'EXECUTE'
    )
    or has_function_privilege(
      'anon',
      'public.load_flight_offer_evidence_for_terminal_recovery_v1(uuid,uuid,uuid,text,text)',
      'EXECUTE'
    )
    or exists (
      select 1
        from aclexplode(v_loader_acl) as privilege
       where privilege.grantee = 0
         and privilege.privilege_type = 'EXECUTE'
    )
    or (
      select count(*)::integer
        from aclexplode(v_loader_acl) as privilege
       where privilege.grantee = v_service_role
         and privilege.grantor = v_loader_owner
         and privilege.privilege_type = 'EXECUTE'
         and not privilege.is_grantable
    ) <> 1
    or exists (
      select 1
        from aclexplode(v_loader_acl) as privilege
       where privilege.privilege_type <> 'EXECUTE'
          or privilege.grantee not in (v_loader_owner, v_service_role)
          or privilege.grantor <> v_loader_owner
          or (
            privilege.grantee = v_service_role
            and privilege.is_grantable
          )
    )
    or v_vault_owner is distinct from v_postgres_role
    or v_vault_kind is distinct from 'r'
    or not coalesce(v_vault_rls, false)
    or not coalesce(v_vault_force_rls, false)
    or exists (
      select 1
        from aclexplode(v_vault_acl) as privilege
       where privilege.grantee <> v_vault_owner
          or privilege.grantor <> v_vault_owner
    )
    or exists (
      select 1
        from pg_catalog.pg_attribute as attribute
        cross join lateral aclexplode(
          case
            when coalesce(cardinality(attribute.attacl), 0) = 0
              then acldefault('r', v_vault_owner)
            else attribute.attacl
          end
        ) as privilege
       where attribute.attrelid =
         'public.flight_offer_evidence_vault'::regclass
         and not attribute.attisdropped
         and (
           privilege.grantee <> v_vault_owner
           or privilege.grantor <> v_vault_owner
         )
    )
    or has_table_privilege(
      'service_role', 'public.flight_offer_evidence_vault', 'SELECT'
    )
    or has_table_privilege(
      'authenticated', 'public.flight_offer_evidence_vault', 'SELECT'
    )
    or has_table_privilege(
      'anon', 'public.flight_offer_evidence_vault', 'SELECT'
    ) then
    raise exception 'Flight Consumer Preview migration 097 loader or privilege boundary has drifted';
  end if;
end;
$flight_consumer_preview_098_dependencies$;

do $flight_consumer_preview_098_relocked_precondition$
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
    raise exception 'Flight Consumer Preview migration 098 requires relock before repair';
  end if;
end;
$flight_consumer_preview_098_relocked_precondition$;

-- The migration-097 loader is the authorization boundary. Only after that
-- function returns exactly one proven historical evidence row do we resolve
-- the same vault row's durable local identity. The encrypted evidence, payment
-- state, provider references, and any dispatch capability remain unexposed.
create function public.get_flight_offer_local_identity_for_terminal_recovery_v1(
  p_attempt_id uuid,
  p_order_id uuid,
  p_customer_id uuid,
  p_execution_scope_sha256 text,
  p_receipt_sha256 text
)
returns table (local_offer_id text)
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $get_flight_offer_local_identity_for_terminal_recovery$
#variable_conflict error
declare
  v_verified record;
  v_verified_count integer := 0;
  v_evidence_id uuid;
  v_offer_id uuid;
  v_verified_receipt_sha256 text;
  v_local_offer_id text;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Flight terminal offer local identity is service-role only';
  end if;
  if p_attempt_id is null or p_order_id is null or p_customer_id is null
    or p_execution_scope_sha256 is null
    or p_execution_scope_sha256 !~ '^[0-9a-f]{64}$'
    or p_receipt_sha256 is null
    or p_receipt_sha256 !~ '^[0-9a-f]{64}$' then
    raise exception 'Flight terminal offer local identity input is invalid';
  end if;

  for v_verified in
    select evidence.evidence_id, evidence.offer_id, evidence.receipt_sha256
      from public.load_flight_offer_evidence_for_terminal_recovery_v1(
        p_attempt_id,
        p_order_id,
        p_customer_id,
        p_execution_scope_sha256,
        p_receipt_sha256
      ) as evidence
  loop
    v_verified_count := v_verified_count + 1;
    v_evidence_id := v_verified.evidence_id;
    v_offer_id := v_verified.offer_id;
    v_verified_receipt_sha256 := v_verified.receipt_sha256;
  end loop;

  if v_verified_count <> 1
    or v_evidence_id is null
    or v_offer_id is null
    or v_verified_receipt_sha256 is distinct from p_receipt_sha256 then
    raise exception 'Flight terminal offer local identity evidence proof is unavailable';
  end if;

  select evidence.local_offer_id into v_local_offer_id
    from public.flight_offer_evidence_vault as evidence
   where evidence.id = v_evidence_id
     and evidence.offer_id = v_offer_id
     and evidence.receipt_sha256 = v_verified_receipt_sha256
   for share;
  if v_local_offer_id is null
    or v_local_offer_id !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$' then
    raise exception 'Flight terminal offer local identity is unavailable';
  end if;

  return query select v_local_offer_id;
end;
$get_flight_offer_local_identity_for_terminal_recovery$;

alter function public.get_flight_offer_local_identity_for_terminal_recovery_v1(
  uuid, uuid, uuid, text, text
) owner to postgres;

revoke all on function public.get_flight_offer_local_identity_for_terminal_recovery_v1(
  uuid, uuid, uuid, text, text
) from public, anon, authenticated, service_role;
grant execute on function public.get_flight_offer_local_identity_for_terminal_recovery_v1(
  uuid, uuid, uuid, text, text
) to service_role;

comment on function public.get_flight_offer_local_identity_for_terminal_recovery_v1(
  uuid, uuid, uuid, text, text
) is 'Returns exactly one durable local_offer_id only after the migration-097 service-role historical loader proves the exact succeeded Duffel TEST offer-evidence chain; no encrypted evidence, provider/payment identity, or dispatch authority is exposed.';

do $flight_consumer_preview_098_postcondition$
declare
  v_safe_count integer;
  v_loader_source text;
  v_identity_source text;
  v_loader_sha256 text;
  v_identity_sha256 text;
  v_loader_security_definer boolean;
  v_identity_security_definer boolean;
  v_loader_config text[];
  v_identity_config text[];
  v_loader_acl aclitem[];
  v_identity_acl aclitem[];
  v_loader_owner oid;
  v_identity_owner oid;
  v_loader_language oid;
  v_identity_language oid;
  v_loader_kind text;
  v_identity_kind text;
  v_loader_overload_count integer;
  v_identity_overload_count integer;
  v_postgres_role oid;
  v_service_role oid;
  v_plpgsql_language oid;
  v_vault_owner oid;
  v_vault_kind text;
  v_vault_rls boolean;
  v_vault_force_rls boolean;
  v_vault_acl aclitem[];
begin
  select role.oid into v_postgres_role
    from pg_catalog.pg_roles as role
   where role.rolname = 'postgres';
  select role.oid into v_service_role
    from pg_catalog.pg_roles as role
   where role.rolname = 'service_role';
  select language.oid into v_plpgsql_language
    from pg_catalog.pg_language as language
   where language.lanname = 'plpgsql';
  select count(*)::integer into v_loader_overload_count
    from pg_catalog.pg_proc as routine
    join pg_catalog.pg_namespace as namespace
      on namespace.oid = routine.pronamespace
   where namespace.nspname = 'public'
     and routine.proname =
       'load_flight_offer_evidence_for_terminal_recovery_v1';
  select count(*)::integer into v_identity_overload_count
    from pg_catalog.pg_proc as routine
    join pg_catalog.pg_namespace as namespace
      on namespace.oid = routine.pronamespace
   where namespace.nspname = 'public'
     and routine.proname =
       'get_flight_offer_local_identity_for_terminal_recovery_v1';

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

  select routine.prosrc, routine.prosecdef, routine.proconfig,
      routine.proacl, routine.proowner, routine.prolang,
      routine.prokind::text
    into v_loader_source, v_loader_security_definer, v_loader_config,
      v_loader_acl, v_loader_owner, v_loader_language, v_loader_kind
    from pg_catalog.pg_proc as routine
   where routine.oid = to_regprocedure(
     'public.load_flight_offer_evidence_for_terminal_recovery_v1(uuid,uuid,uuid,text,text)'
   );
  v_loader_sha256 := encode(
    extensions.digest(
      convert_to(
        replace(v_loader_source, chr(13) || chr(10), chr(10)),
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  );

  select routine.prosrc, routine.prosecdef, routine.proconfig,
      routine.proacl, routine.proowner, routine.prolang,
      routine.prokind::text
    into v_identity_source, v_identity_security_definer, v_identity_config,
      v_identity_acl, v_identity_owner, v_identity_language, v_identity_kind
    from pg_catalog.pg_proc as routine
   where routine.oid = to_regprocedure(
     'public.get_flight_offer_local_identity_for_terminal_recovery_v1(uuid,uuid,uuid,text,text)'
   );
  select relation.relowner, relation.relkind::text,
      relation.relrowsecurity, relation.relforcerowsecurity, relation.relacl
    into v_vault_owner, v_vault_kind, v_vault_rls,
      v_vault_force_rls, v_vault_acl
    from pg_catalog.pg_class as relation
   where relation.oid = 'public.flight_offer_evidence_vault'::regclass;
  v_loader_acl := case
    when coalesce(cardinality(v_loader_acl), 0) = 0
      then acldefault('f', v_loader_owner)
    else v_loader_acl
  end;
  v_identity_acl := case
    when coalesce(cardinality(v_identity_acl), 0) = 0
      then acldefault('f', v_identity_owner)
    else v_identity_acl
  end;
  v_vault_acl := case
    when coalesce(cardinality(v_vault_acl), 0) = 0
      then acldefault('r', v_vault_owner)
    else v_vault_acl
  end;
  v_identity_sha256 := encode(
    extensions.digest(
      convert_to(
        replace(v_identity_source, chr(13) || chr(10), chr(10)),
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  );

  if v_safe_count <> 1
    or v_postgres_role is null
    or v_service_role is null
    or v_plpgsql_language is null
    or v_loader_overload_count <> 1
    or to_regprocedure(
      'public.load_flight_offer_evidence_for_terminal_recovery_v1(uuid,uuid,uuid,text,text)'
    ) is null
    or v_loader_source is null
    or not coalesce(v_loader_security_definer, false)
    or v_loader_sha256 <> 'd1165286160c3ae5694950bbebfac75adcbab6a708f5e2343dba4d752e7b8172'
    or v_loader_owner is distinct from v_postgres_role
    or v_loader_language is distinct from v_plpgsql_language
    or v_loader_kind is distinct from 'f'
    or v_loader_config is distinct from
      array['search_path=pg_catalog, public, extensions']::text[]
    or pg_get_function_result(to_regprocedure(
      'public.load_flight_offer_evidence_for_terminal_recovery_v1(uuid,uuid,uuid,text,text)'
    )) is distinct from pg_get_function_result(to_regprocedure(
      'public.load_flight_offer_evidence_v1(text,uuid,text)'
    ))
    or not has_function_privilege(
      'service_role',
      'public.load_flight_offer_evidence_for_terminal_recovery_v1(uuid,uuid,uuid,text,text)',
      'EXECUTE'
    )
    or has_function_privilege(
      'authenticated',
      'public.load_flight_offer_evidence_for_terminal_recovery_v1(uuid,uuid,uuid,text,text)',
      'EXECUTE'
    )
    or has_function_privilege(
      'anon',
      'public.load_flight_offer_evidence_for_terminal_recovery_v1(uuid,uuid,uuid,text,text)',
      'EXECUTE'
    )
    or exists (
      select 1
        from aclexplode(v_loader_acl) as privilege
       where privilege.grantee = 0
         and privilege.privilege_type = 'EXECUTE'
    )
    or (
      select count(*)::integer
        from aclexplode(v_loader_acl) as privilege
       where privilege.grantee = v_service_role
         and privilege.grantor = v_loader_owner
         and privilege.privilege_type = 'EXECUTE'
         and not privilege.is_grantable
    ) <> 1
    or exists (
      select 1
        from aclexplode(v_loader_acl) as privilege
       where privilege.privilege_type <> 'EXECUTE'
          or privilege.grantee not in (v_loader_owner, v_service_role)
          or privilege.grantor <> v_loader_owner
          or (
            privilege.grantee = v_service_role
            and privilege.is_grantable
          )
    )
    then
    raise exception 'Flight Consumer Preview migration 098 loader postcondition failed';
  end if;

  if v_identity_overload_count <> 1
    or to_regprocedure(
      'public.get_flight_offer_local_identity_for_terminal_recovery_v1(uuid,uuid,uuid,text,text)'
    ) is null
    or v_identity_source is null
    or not coalesce(v_identity_security_definer, false)
    or v_identity_sha256 <> '5eaf485cadb185b01c861ec1573479dd838bb86738c3610e817a1e77c01cf5dd'
    or v_identity_owner is distinct from v_postgres_role
    or v_identity_language is distinct from v_plpgsql_language
    or v_identity_kind is distinct from 'f'
    or v_identity_config is distinct from
      array['search_path=pg_catalog, public, extensions']::text[]
    or position('#variable_conflict error' in v_identity_source) = 0
    or position(
      'from public.load_flight_offer_evidence_for_terminal_recovery_v1('
      in v_identity_source
    ) = 0
    or position('v_verified_count <> 1' in v_identity_source) = 0
    or position(
      'evidence.id = v_evidence_id' in v_identity_source
    ) = 0
    or position(
      'evidence.receipt_sha256 = v_verified_receipt_sha256'
      in v_identity_source
    ) = 0
    or position('return query select v_local_offer_id' in v_identity_source) = 0
    or pg_get_function_result(to_regprocedure(
      'public.get_flight_offer_local_identity_for_terminal_recovery_v1(uuid,uuid,uuid,text,text)'
    )) is distinct from 'TABLE(local_offer_id text)'
    or not has_function_privilege(
      'service_role',
      'public.get_flight_offer_local_identity_for_terminal_recovery_v1(uuid,uuid,uuid,text,text)',
      'EXECUTE'
    )
    or has_function_privilege(
      'authenticated',
      'public.get_flight_offer_local_identity_for_terminal_recovery_v1(uuid,uuid,uuid,text,text)',
      'EXECUTE'
    )
    or has_function_privilege(
      'anon',
      'public.get_flight_offer_local_identity_for_terminal_recovery_v1(uuid,uuid,uuid,text,text)',
      'EXECUTE'
    )
    or exists (
      select 1
        from aclexplode(v_identity_acl) as privilege
       where privilege.grantee = 0
         and privilege.privilege_type = 'EXECUTE'
    )
    or (
      select count(*)::integer
        from aclexplode(v_identity_acl) as privilege
       where privilege.grantee = v_service_role
         and privilege.grantor = v_identity_owner
         and privilege.privilege_type = 'EXECUTE'
         and not privilege.is_grantable
    ) <> 1
    or exists (
      select 1
        from aclexplode(v_identity_acl) as privilege
       where privilege.privilege_type <> 'EXECUTE'
          or privilege.grantee not in (v_identity_owner, v_service_role)
          or privilege.grantor <> v_identity_owner
          or (
            privilege.grantee = v_service_role
            and privilege.is_grantable
          )
    )
    or v_vault_owner is distinct from v_postgres_role
    or v_vault_kind is distinct from 'r'
    or not coalesce(v_vault_rls, false)
    or not coalesce(v_vault_force_rls, false)
    or exists (
      select 1
        from aclexplode(v_vault_acl) as privilege
       where privilege.grantee <> v_vault_owner
          or privilege.grantor <> v_vault_owner
    )
    or exists (
      select 1
        from pg_catalog.pg_attribute as attribute
        cross join lateral aclexplode(
          case
            when coalesce(cardinality(attribute.attacl), 0) = 0
              then acldefault('r', v_vault_owner)
            else attribute.attacl
          end
        ) as privilege
       where attribute.attrelid =
         'public.flight_offer_evidence_vault'::regclass
         and not attribute.attisdropped
         and (
           privilege.grantee <> v_vault_owner
           or privilege.grantor <> v_vault_owner
         )
    )
    or has_table_privilege(
      'service_role', 'public.flight_offer_evidence_vault', 'SELECT'
    )
    or has_table_privilege(
      'authenticated', 'public.flight_offer_evidence_vault', 'SELECT'
    )
    or has_table_privilege(
      'anon', 'public.flight_offer_evidence_vault', 'SELECT'
    ) then
    raise exception 'Flight Consumer Preview migration 098 identity postcondition failed';
  end if;
end;
$flight_consumer_preview_098_postcondition$;

commit;
