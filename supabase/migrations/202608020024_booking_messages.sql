begin;

create table if not exists public.booking_messages (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  sender_id uuid not null references public.profiles(id),
  body text not null check (char_length(btrim(body)) between 1 and 2000),
  created_at timestamptz not null default now()
);

create index if not exists booking_messages_thread_idx
  on public.booking_messages (booking_id, created_at);

alter table public.booking_messages enable row level security;

create policy "Customers can view own booking messages"
  on public.booking_messages for select
  using (exists (
    select 1 from public.bookings
    where bookings.id = booking_messages.booking_id
      and bookings.customer_id = auth.uid()
  ));

create policy "Approved partners can view own booking messages"
  on public.booking_messages for select
  using (exists (
    select 1
    from public.bookings
    join public.properties on properties.id = bookings.property_id
    join public.partners on partners.id = properties.partner_id
    where bookings.id = booking_messages.booking_id
      and partners.owner_id = auth.uid()
      and partners.status = 'approved'
  ));

create policy "Admins can view booking messages"
  on public.booking_messages for select
  using (exists (
    select 1 from public.profiles
    where profiles.id = auth.uid() and profiles.role = 'admin'
  ));

revoke insert, update, delete on public.booking_messages from anon, authenticated;
grant select on public.booking_messages to authenticated;

create or replace function public.send_booking_message(
  p_booking_id uuid,
  p_body text
) returns public.booking_messages
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking public.bookings;
  v_partner_owner uuid;
  v_partner_status text;
  v_is_admin boolean;
  v_message public.booking_messages;
  v_recipient uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if char_length(btrim(coalesce(p_body, ''))) not between 1 and 2000 then
    raise exception 'Message must contain between 1 and 2000 characters';
  end if;

  select b.* into v_booking
  from public.bookings b
  where b.id = p_booking_id;
  if not found then raise exception 'Booking not found'; end if;
  select pa.owner_id, pa.status into v_partner_owner, v_partner_status
  from public.properties p
  join public.partners pa on pa.id = p.partner_id
  where p.id = v_booking.property_id;

  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  ) into v_is_admin;
  if auth.uid() is distinct from v_booking.customer_id
    and not (auth.uid() = v_partner_owner and v_partner_status = 'approved')
    and not v_is_admin then
    raise exception 'Not authorized';
  end if;

  insert into public.booking_messages (booking_id, sender_id, body)
  values (p_booking_id, auth.uid(), btrim(p_body))
  returning * into v_message;

  v_recipient := case when auth.uid() = v_booking.customer_id then v_partner_owner else v_booking.customer_id end;
  if v_recipient is not null and v_recipient <> auth.uid() then
    insert into public.notifications (user_id, title, body)
    values (v_recipient, 'New booking message', 'A new message was posted for ' || v_booking.confirmation_code || '.');
  end if;
  return v_message;
end;
$$;

revoke all on function public.send_booking_message(uuid, text) from public;
grant execute on function public.send_booking_message(uuid, text) to authenticated;

commit;
