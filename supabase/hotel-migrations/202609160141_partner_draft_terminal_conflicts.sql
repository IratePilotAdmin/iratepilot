begin;
set local lock_timeout = '5s';
set local statement_timeout = '20s';

-- Deploy the API that recognizes PT409 first. Application revision conflicts
-- must not use serialization_failure (40001): PostgREST 14 retries it, even
-- though another retry cannot make the caller's old revision current.
-- https://supabase.com/docs/guides/troubleshooting/high-cpu-and-infinite-transaction-retries-when-using-custom-error-codes-in-rpc-functions-77326b
-- Change only the two known raise statements. CREATE OR REPLACE preserves
-- ownership, grants, function attributes, and all existing draft data.
do $terminal_partner_conflicts$
declare
  expected record;
  target oid;
  definition text;
  body text;
begin
  for expected in select * from (values
    ('public.save_partner_onboarding_draft(uuid,integer,jsonb)', 'a17b85f37f00104b65a0ae2601dd1ec4'),
    ('public.submit_partner_onboarding_draft(uuid,integer)', '197cc0980fc63979ba6b8bc432646ae7')
  ) as contract(signature, body_md5)
  loop
    target := to_regprocedure(expected.signature);
    select prosrc into body from pg_proc where oid = target;
    if target is null or md5(btrim(replace(body, E'\r\n', E'\n'), E' \t\r\n')) <> expected.body_md5 then
      raise exception 'Unexpected partner draft function: %', expected.signature;
    end if;
    definition := pg_get_functiondef(target);
    if (length(definition) - length(replace(definition, 'errcode = ''40001''', '')))
      / length('errcode = ''40001''') <> 1 then
      raise exception 'Expected one revision-conflict statement: %', expected.signature;
    end if;
    execute replace(definition, 'errcode = ''40001''', 'errcode = ''PT409''');
  end loop;
end;
$terminal_partner_conflicts$;

commit;
