-- Read-only rehearsal gate. Run against the isolated project before trying to
-- publish a synthetic hotel or turn on Stripe TEST checkout/webhooks.
with checks as (
  select 'intake review has inactive-draft evidence field' as gate,
    exists (
      select 1 from information_schema.columns
      where table_schema = 'public'
        and table_name = 'partner_application_review_evidence'
        and column_name = 'inactive_draft_scope_confirmed'
    ) as passed
  union all
  select 'admin review accepts inactive-draft evidence',
    to_regprocedure(
      'public.review_partner_application(uuid,text,boolean,boolean,boolean,boolean,boolean,text)'
    ) is not null
  union all
  select 'controlled publication action exists',
    to_regprocedure('public.set_property_publication_state(uuid,boolean)') is not null
  union all
  select 'marketplace approval function exists',
    to_regprocedure('public.is_approved_marketplace_property(uuid)') is not null
)
select gate, passed
from checks
order by gate;
