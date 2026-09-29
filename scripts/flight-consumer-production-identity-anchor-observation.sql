-- Bounded read-only observation of Production identity-anchor prerequisites.
-- This query does not create, alter, delete, grant, revoke, or ledger anything.

begin;
set transaction read only;

select jsonb_build_object(
  'project_ref', 'allliumarkejinplrggl',
  'profiles_relation', to_regclass('public.profiles')::text,
  'profiles_id_type', format_type(a.atttypid, a.atttypmod),
  'profiles_id_not_null', a.attnotnull,
  'profiles_id_unique_constraint', exists (
    select 1
    from pg_catalog.pg_constraint c
    where c.conrelid = 'public.profiles'::regclass
      and c.contype in ('p', 'u')
      and c.conkey = array[a.attnum]::smallint[]
  ),
  'writes_performed', false
) as receipt
from pg_catalog.pg_attribute a
where a.attrelid = 'public.profiles'::regclass
  and a.attname = 'id'
  and a.attnum > 0
  and not a.attisdropped;

commit;
