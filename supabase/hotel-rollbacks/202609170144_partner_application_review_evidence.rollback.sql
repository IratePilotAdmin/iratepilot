begin;
set local lock_timeout = '5s';
set local statement_timeout = '20s';

do $partner_review_rollback_guard$
begin
  if exists (select 1 from public.partner_application_review_evidence) then
    raise exception 'Refusing rollback: partner application review evidence exists';
  end if;
end;
$partner_review_rollback_guard$;

grant execute on function public.review_partner_application(uuid, text)
  to authenticated;
drop function if exists public.review_partner_application(
  uuid, text, boolean, boolean, boolean, boolean, boolean, text
);
drop trigger if exists partner_application_review_evidence_append_only
  on public.partner_application_review_evidence;
drop function if exists public.prevent_partner_application_review_evidence_mutation();
drop table if exists public.partner_application_review_evidence;

commit;
