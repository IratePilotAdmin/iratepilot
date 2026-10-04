-- TARGET: PMS Supabase eiqmdldjnedqgbtoozqa, not the OTA database.
-- Prospective calendar-night forecasts for the private Red Roof pilot only.
CREATE TABLE irp_pms.revenue_forecast_records (
 tenant_id uuid NOT NULL, property_id uuid NOT NULL, room_type_id uuid NOT NULL,
 stay_date date NOT NULL, issued_at timestamptz NOT NULL,
 stay_start_at timestamptz NOT NULL, stay_end_at timestamptz NOT NULL,
 source_captured_at timestamptz NOT NULL, baseline_captured_at timestamptz,
 model_version text NOT NULL CHECK (model_version IN ('on-books-v1','seven-day-pace-v1')),
 currency text NOT NULL, source_basis text NOT NULL,
 capacity integer NOT NULL CHECK (capacity > 0),
 on_books_rooms integer NOT NULL CHECK (on_books_rooms >= 0),
 predicted_rooms integer, evidence_state text NOT NULL CHECK (evidence_state IN ('recorded','insufficient_history')),
 PRIMARY KEY (tenant_id,property_id,room_type_id,stay_date,source_captured_at,model_version),
 CHECK (on_books_rooms <= capacity), CHECK (predicted_rooms BETWEEN 0 AND capacity),
 CHECK ((evidence_state='recorded' AND predicted_rooms IS NOT NULL) OR (evidence_state='insufficient_history' AND predicted_rooms IS NULL)),
 CHECK (source_captured_at <= issued_at AND issued_at < stay_start_at AND stay_start_at < stay_end_at),
 CHECK (baseline_captured_at IS NULL OR baseline_captured_at < source_captured_at)
);
ALTER TABLE irp_pms.revenue_forecast_records ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON irp_pms.revenue_forecast_records FROM PUBLIC, anon, authenticated, service_role;
COMMENT ON TABLE irp_pms.revenue_forecast_records IS 'Immutable prospective pilot forecasts. Calendar-night boundaries are not guest check-in/out times. No live-pricing certification or writeback.';
CREATE FUNCTION irp_pms.capture_revenue_forecast_pilot() RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE v_now timestamptz := clock_timestamp(); v_count integer;
BEGIN
 WITH latest AS (
  SELECT DISTINCT ON (s.room_type_id,s.stay_date) s.*, p.time_zone,
   (s.stay_date::timestamp AT TIME ZONE p.time_zone) AS night_start,
   ((s.stay_date+1)::timestamp AT TIME ZONE p.time_zone) AS night_end,
   (s.stay_date - (v_now AT TIME ZONE p.time_zone)::date) AS lead_days
  FROM irp_pms.revenue_shadow_snapshots s
  JOIN irp_pms.properties p ON p.tenant_id=s.tenant_id AND p.id=s.property_id
  WHERE s.tenant_id='faa76112-c793-43db-92bd-f9faecd8d93a'::uuid
   AND s.property_id='7d9add80-216e-435c-86e9-58e17cdcbb6d'::uuid
   AND s.captured_at BETWEEN v_now-interval '7 hours' AND v_now
   AND s.stay_date > (v_now AT TIME ZONE p.time_zone)::date
   AND s.stay_date <= (v_now AT TIME ZONE p.time_zone)::date+30
  ORDER BY s.room_type_id,s.stay_date,s.captured_at DESC
 ), eligible AS (
  SELECT s.*, b.captured_at AS baseline_at, b.booked_room_nights AS baseline_rooms
  FROM latest s LEFT JOIN LATERAL (
   SELECT h.captured_at,h.booked_room_nights FROM irp_pms.revenue_shadow_snapshots h
   WHERE h.tenant_id=s.tenant_id AND h.property_id=s.property_id
    AND h.room_type_id=s.room_type_id AND h.stay_date=s.stay_date
    AND h.captured_at BETWEEN s.captured_at-interval '7 days 3 hours' AND s.captured_at-interval '6 days 21 hours'
    AND h.currency=s.currency AND h.basis=s.basis
    AND h.sellable_room_nights=s.sellable_room_nights
    AND h.booked_room_nights BETWEEN 0 AND h.sellable_room_nights
   ORDER BY abs(extract(epoch FROM (h.captured_at-(s.captured_at-interval '7 days')))),h.captured_at DESC LIMIT 1
  ) b ON true
  WHERE s.sellable_room_nights > 0 AND s.booked_room_nights BETWEEN 0 AND s.sellable_room_nights
 ), inserted AS (
  INSERT INTO irp_pms.revenue_forecast_records
   (tenant_id,property_id,room_type_id,stay_date,issued_at,stay_start_at,stay_end_at,source_captured_at,baseline_captured_at,model_version,currency,source_basis,capacity,on_books_rooms,predicted_rooms,evidence_state)
  SELECT s.tenant_id,s.property_id,s.room_type_id,s.stay_date,v_now,s.night_start,s.night_end,s.captured_at,
   CASE WHEN m.model='seven-day-pace-v1' THEN s.baseline_at END,m.model,s.currency,s.basis,
   s.sellable_room_nights,s.booked_room_nights,
   CASE WHEN m.model='on-books-v1' THEN s.booked_room_nights
    WHEN s.baseline_at IS NOT NULL THEN least(s.sellable_room_nights,round(s.booked_room_nights+greatest(0,s.booked_room_nights-s.baseline_rooms)*s.lead_days/7.0)::integer) END,
   CASE WHEN m.model='on-books-v1' OR s.baseline_at IS NOT NULL THEN 'recorded' ELSE 'insufficient_history' END
  FROM eligible s CROSS JOIN (VALUES ('on-books-v1'),('seven-day-pace-v1')) m(model)
  ON CONFLICT DO NOTHING RETURNING 1
 ) SELECT count(*) INTO v_count FROM inserted;
 RETURN v_count;
END $fn$;
REVOKE ALL ON FUNCTION irp_pms.capture_revenue_forecast_pilot() FROM PUBLIC,anon,authenticated,service_role;
-- Retain the existing cadence; capture source snapshots before recording forecasts.
SELECT cron.schedule('irp-pms-red-roof-revenue-shadow','17 */6 * * *',
 'SELECT irp_pms.capture_revenue_shadow_pilot(); SELECT irp_pms.capture_revenue_forecast_pilot();');
SELECT irp_pms.capture_revenue_forecast_pilot();
