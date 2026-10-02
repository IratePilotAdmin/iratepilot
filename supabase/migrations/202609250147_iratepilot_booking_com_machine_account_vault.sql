BEGIN;

-- Booking.com machine accounts are deliberately test-only and disabled until
-- partner approval is recorded. Only encrypted credential envelopes are stored.
CREATE TABLE public.irp_ota_machine_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  provider text NOT NULL DEFAULT 'booking_com' CHECK (provider = 'booking_com'),
  environment text NOT NULL DEFAULT 'test' CHECK (environment = 'test'),
  credentials_ciphertext text NOT NULL CHECK (length(credentials_ciphertext) BETWEEN 1 AND 22000),
  credentials_initialization_vector text NOT NULL CHECK (credentials_initialization_vector ~ '^[A-Za-z0-9+/]{16}$'),
  credentials_authentication_tag text NOT NULL CHECK (credentials_authentication_tag ~ '^[A-Za-z0-9+/]{22}==$'),
  credentials_key_version integer NOT NULL CHECK (credentials_key_version > 0),
  enabled boolean NOT NULL DEFAULT false,
  partner_approved boolean NOT NULL DEFAULT false,
  approved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, property_id),
  CHECK (NOT partner_approved OR approved_at IS NOT NULL)
);

ALTER TABLE public.irp_ota_channel_connections
  ADD COLUMN machine_account_id uuid;
ALTER TABLE public.irp_ota_channel_connections
  ADD CONSTRAINT irp_ota_channel_machine_account_fk
  FOREIGN KEY (machine_account_id, property_id)
  REFERENCES public.irp_ota_machine_accounts(id, property_id)
  ON DELETE RESTRICT;

CREATE FUNCTION public.irp_ota_validate_machine_account_link()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NEW.machine_account_id IS NOT NULL AND (NEW.provider <> 'booking_com' OR NEW.environment <> 'test') THEN
    RAISE EXCEPTION 'Machine accounts are restricted to Booking.com test connections' USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END
$$;
CREATE TRIGGER irp_ota_validate_machine_account_link_trigger
  BEFORE INSERT OR UPDATE OF machine_account_id, provider, environment
  ON public.irp_ota_channel_connections
  FOR EACH ROW EXECUTE FUNCTION public.irp_ota_validate_machine_account_link();

-- The ledger is serialized by locking the account row, so parallel app
-- instances cannot exceed Booking.com's 30-token/hour account limit.
CREATE TABLE public.irp_ota_machine_account_token_attempts (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  machine_account_id uuid NOT NULL REFERENCES public.irp_ota_machine_accounts(id) ON DELETE CASCADE,
  requested_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX irp_ota_machine_account_token_attempts_window_idx
  ON public.irp_ota_machine_account_token_attempts(machine_account_id, requested_at DESC);

CREATE FUNCTION public.irp_ota_reserve_booking_com_token_exchange(p_machine_account_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  a public.irp_ota_machine_accounts%rowtype;
  recent_attempts integer;
  request_time timestamptz := clock_timestamp();
BEGIN
  IF p_machine_account_id IS NULL THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'account_unavailable');
  END IF;

  SELECT * INTO a
    FROM public.irp_ota_machine_accounts
    WHERE id = p_machine_account_id
    FOR UPDATE;
  IF NOT FOUND OR a.provider <> 'booking_com' OR a.environment <> 'test'
     OR NOT a.enabled OR NOT a.partner_approved OR a.approved_at IS NULL
     OR NOT EXISTS (
       SELECT 1
       FROM public.irp_ota_channel_connections c
       JOIN public.properties p ON p.id = c.property_id AND p.active
       JOIN public.partners partner ON partner.id = p.partner_id AND partner.status = 'approved'
       WHERE c.machine_account_id = a.id AND c.property_id = a.property_id
         AND c.provider = 'booking_com' AND c.environment = 'test'
         AND c.enabled AND c.partner_approved
     ) THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'account_unavailable');
  END IF;

  SELECT count(*)::integer INTO recent_attempts
    FROM public.irp_ota_machine_account_token_attempts
    WHERE machine_account_id = a.id AND requested_at > request_time - interval '1 hour';
  IF recent_attempts >= 30 THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'rate_limited');
  END IF;

  INSERT INTO public.irp_ota_machine_account_token_attempts(machine_account_id, requested_at)
    VALUES (a.id, request_time);
  RETURN jsonb_build_object('allowed', true, 'attemptsRemaining', 29 - recent_attempts);
END
$$;

ALTER TABLE public.irp_ota_machine_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.irp_ota_machine_account_token_attempts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.irp_ota_machine_accounts, public.irp_ota_machine_account_token_attempts
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.irp_ota_reserve_booking_com_token_exchange(uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.irp_ota_validate_machine_account_link()
  FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.irp_ota_machine_accounts TO service_role;
GRANT SELECT, INSERT, DELETE ON public.irp_ota_machine_account_token_attempts TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.irp_ota_machine_account_token_attempts_id_seq TO service_role;
GRANT EXECUTE ON FUNCTION public.irp_ota_reserve_booking_com_token_exchange(uuid) TO service_role;

COMMIT;
