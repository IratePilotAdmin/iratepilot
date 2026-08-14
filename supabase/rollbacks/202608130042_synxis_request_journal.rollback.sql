do $$
begin
  if to_regclass('public.synxis_request_journal') is not null
    and exists (select 1 from public.synxis_request_journal) then
    raise exception 'Refusing rollback: SynXis request journal receipts exist';
  end if;
end;
$$;

drop function if exists public.complete_synxis_request_attempt(uuid, text, integer);
drop function if exists public.begin_synxis_request_attempt(text, integer, text, text);
drop trigger if exists synxis_request_journal_immutable_trigger
  on public.synxis_request_journal;
drop function if exists public.enforce_synxis_request_journal_immutability();
drop table if exists public.synxis_request_journal;
