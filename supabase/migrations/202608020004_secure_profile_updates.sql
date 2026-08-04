begin;

drop policy if exists "Users can update own profile" on public.profiles;

create or replace function public.update_own_profile(
  p_full_name text,
  p_phone text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.profiles;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if p_full_name is null or char_length(trim(p_full_name)) not between 2 and 120 then
    raise exception 'Invalid full name' using errcode = '22023';
  end if;
  if p_phone is not null and char_length(trim(p_phone)) > 30 then
    raise exception 'Invalid phone number' using errcode = '22023';
  end if;

  update public.profiles
  set full_name = trim(p_full_name),
      phone = nullif(trim(p_phone), '')
  where id = auth.uid()
  returning * into v_profile;
  if not found then
    raise exception 'Profile not found' using errcode = 'P0002';
  end if;

  return jsonb_build_object('full_name', v_profile.full_name, 'phone', v_profile.phone);
end;
$$;

revoke all on function public.update_own_profile(text, text) from public;
grant execute on function public.update_own_profile(text, text) to authenticated;

commit;
