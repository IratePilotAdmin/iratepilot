BEGIN;
-- Stop new financial records, including exact mutation retries. Preserve the
-- actor-scoped receipt reader and explicit nonfinancial request retirement.
REVOKE EXECUTE ON FUNCTION public.irp_pms_pilot_record_security_deposit(uuid,uuid,uuid,uuid,bigint,text,date,text,bigint,text,text,text,uuid,boolean) FROM PUBLIC,anon,authenticated,service_role;
COMMIT;
-- The four read RPCs and retire_security_deposit_request remain available.
-- Retirement may recover an already recorded outcome; otherwise it fences
-- the exact old request without creating a book/event or changing balances.
-- No existing folio, reservation or turnover route is disabled by this stop.
-- Do not delete deposit records or change legacy folio routes as a rollback.
