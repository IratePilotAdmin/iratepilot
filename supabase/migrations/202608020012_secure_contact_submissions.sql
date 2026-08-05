begin;

drop policy if exists "Public can submit contact messages"
  on public.contact_messages;

commit;
