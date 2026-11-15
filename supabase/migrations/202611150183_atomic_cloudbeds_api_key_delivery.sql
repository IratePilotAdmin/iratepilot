begin;

create or replace function public.complete_cloudbeds_api_key_delivery(
  p_authorized_property_ids text[],
  p_deliveries jsonb,
  p_validated_at timestamptz
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  delivery jsonb;
  v_connection_id uuid;
  v_property_code text;
  ownership_count integer;
  completed integer := 0;
begin
  if p_authorized_property_ids is null or coalesce(array_length(p_authorized_property_ids, 1), 0) = 0 then
    raise exception 'Cloudbeds authorized property IDs are required';
  end if;
  if p_deliveries is null or jsonb_typeof(p_deliveries) <> 'array'
     or jsonb_array_length(p_deliveries) = 0 or jsonb_array_length(p_deliveries) > 1000 then
    raise exception 'Cloudbeds deliveries are invalid';
  end if;
  if p_validated_at is null then
    raise exception 'Cloudbeds validation time is required';
  end if;

  for delivery in select value from jsonb_array_elements(p_deliveries)
  loop
    v_connection_id := (delivery->>'connection_id')::uuid;
    select connection.external_property_code
      into v_property_code
      from public.property_pms_connections as connection
      join public.properties as property on property.id = connection.property_id
      join public.partners as partner on partner.id = property.partner_id
     where connection.id = v_connection_id
       and connection.provider_id = 'cloudbeds'
       and connection.hotel_authorized
       and partner.status = 'approved'
       and connection.external_property_code = any(p_authorized_property_ids);
    if not found then
      raise exception 'Cloudbeds connection is not approved and authorized';
    end if;

    select count(*)
      into ownership_count
      from public.property_pms_connections as candidate
      join public.properties as property on property.id = candidate.property_id
      join public.partners as partner on partner.id = property.partner_id
     where candidate.provider_id = 'cloudbeds'
       and candidate.external_property_code = v_property_code
       and candidate.hotel_authorized
       and partner.status = 'approved';
    if ownership_count <> 1 then
      raise exception 'Cloudbeds property ownership is ambiguous';
    end if;

    if length(coalesce(delivery->>'ciphertext', '')) <= 20
       or length(coalesce(delivery->>'initialization_vector', '')) <= 10
       or length(coalesce(delivery->>'authentication_tag', '')) <= 10
       or coalesce((delivery->>'key_version')::integer, 0) <= 0 then
      raise exception 'Cloudbeds encrypted credential payload is invalid';
    end if;

    insert into public.property_pms_credentials (
      connection_id, ciphertext, initialization_vector, authentication_tag,
      key_version, configured_by, updated_at
    ) values (
      v_connection_id,
      delivery->>'ciphertext',
      delivery->>'initialization_vector',
      delivery->>'authentication_tag',
      (delivery->>'key_version')::integer,
      null,
      p_validated_at
    )
    on conflict (connection_id) do update set
      ciphertext = excluded.ciphertext,
      initialization_vector = excluded.initialization_vector,
      authentication_tag = excluded.authentication_tag,
      key_version = excluded.key_version,
      configured_by = null,
      updated_at = excluded.updated_at;

    update public.property_pms_connections
       set connection_status = 'sandbox',
           last_validated_at = p_validated_at,
           updated_at = p_validated_at
     where id = v_connection_id and provider_id = 'cloudbeds';

    insert into public.pms_connection_test_events (
      connection_id, validation_mode, result, detail_code, tested_by, created_at
    ) values (
      v_connection_id, 'vendor_sandbox', 'passed',
      'cloudbeds_api_key_delivery_succeeded', null, p_validated_at
    );
    completed := completed + 1;
  end loop;

  return completed;
end;
$$;

revoke all on function public.complete_cloudbeds_api_key_delivery(text[], jsonb, timestamptz)
  from public, anon, authenticated;
grant execute on function public.complete_cloudbeds_api_key_delivery(text[], jsonb, timestamptz)
  to service_role;

commit;
