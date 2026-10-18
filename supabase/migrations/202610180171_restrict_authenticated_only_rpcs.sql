-- These functions inspect auth.uid() and serve signed-in travelers or partners.
-- The October 18 live catalog still grants anon EXECUTE directly, even where
-- earlier migrations revoked the PUBLIC grant. Keep the two signed OTA gateways
-- callable by anon; they authenticate their own HMAC requests.
REVOKE ALL ON FUNCTION public.cancel_pending_booking(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.request_booking_cancellation(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.review_revenue_recommendation(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.send_booking_message(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.update_own_profile(text, text) FROM PUBLIC, anon;

DO $check$
DECLARE
  function_name text;
  function_oid oid;
BEGIN
  FOREACH function_name IN ARRAY ARRAY[
    'public.cancel_pending_booking(uuid,text)',
    'public.request_booking_cancellation(uuid,text)',
    'public.review_revenue_recommendation(uuid,text)',
    'public.send_booking_message(uuid,text)',
    'public.update_own_profile(text,text)'
  ] LOOP
    function_oid := to_regprocedure(function_name);
    IF function_oid IS NULL
       OR has_function_privilege('anon', function_oid, 'EXECUTE')
       OR NOT has_function_privilege('authenticated', function_oid, 'EXECUTE')
       OR NOT has_function_privilege('service_role', function_oid, 'EXECUTE') THEN
      RAISE EXCEPTION 'Unexpected execute grants for %', function_name;
    END IF;
  END LOOP;
END;
$check$;
