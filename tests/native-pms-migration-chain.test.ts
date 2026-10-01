import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";

const migrationFiles = [
  "202609070139_iratepilot_pms_transactional_outbox.sql",
  "202609070140_iratepilot_pms_baseline_activation.sql",
  "202609070141_iratepilot_pms_delivery_control.sql",
  "202609070157_iratepilot_pms_scoped_source_claim.sql",
  "202609070158_iratepilot_pms_scoped_source_claim_identity.sql",
  "202609230139_iratepilot_pms_guest_name_snapshot.sql",
  "202609230140_iratepilot_pms_native_ari_receiver.sql",
  "202609230141_iratepilot_pms_delivery_connection_registry.sql",
  "202609230142_iratepilot_pms_reservation_connection_setup.sql",
  "202609240143_iratepilot_pms_baseline_review_control.sql",
  "202609240144_iratepilot_pms_atomic_connection_setup.sql",
  "202609240145_iratepilot_pms_revenue_recommendation_generation.sql",
  "202609240146_iratepilot_pms_ota_reservation_inbox.sql",
  "202609250147_iratepilot_booking_com_machine_account_vault.sql",
  "202609250148_iratepilot_booking_com_ari_outbox.sql",
  "202609250149_iratepilot_booking_com_inbox_provider_guard.sql",
  "202609250150_iratepilot_booking_com_reservation_inbox_lifecycle.sql",
  "202609250151_iratepilot_booking_com_reservation_source_order.sql",
  "202609250152_iratepilot_booking_com_token_refresh_lease.sql",
  "202609250153_iratepilot_booking_com_credential_rotation.sql",
  "202609250154_iratepilot_booking_com_reservation_pii_retention.sql",
];
const migrations = await Promise.all(migrationFiles.map((name) =>
  readFile(new URL(`../supabase/migrations/${name}`, import.meta.url), "utf8"),
));
const db = new PGlite();
const propertyId = "11111111-1111-4111-8111-111111111111";
const partnerId = "22222222-2222-4222-8222-222222222222";
const roomId = "33333333-3333-4333-8333-333333333333";
const actorId = "44444444-4444-4444-8444-444444444444";

async function sqlCode(operation: () => Promise<unknown>, expectedCode: string) {
  await expect(operation()).rejects.toMatchObject({ code: expectedCode });
}

describe("native OTA ordered migration chain", () => {
  beforeAll(async () => {
    await db.exec(`
      CREATE ROLE anon;
      CREATE ROLE authenticated;
      CREATE ROLE service_role;
      CREATE SCHEMA auth;
      CREATE TABLE auth.users(id uuid PRIMARY KEY);
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULL::uuid $$;
      CREATE TABLE public.partners(id uuid PRIMARY KEY, status text NOT NULL, owner_id uuid);
      CREATE TABLE public.properties(
        id uuid PRIMARY KEY,
        partner_id uuid NOT NULL REFERENCES public.partners(id),
        active boolean NOT NULL
      );
      CREATE TABLE public.rooms(
        id uuid PRIMARY KEY,
        property_id uuid NOT NULL REFERENCES public.properties(id),
        active boolean NOT NULL
      );
      CREATE TABLE public.inventory(
        room_id uuid NOT NULL REFERENCES public.rooms(id),
        stay_date date NOT NULL,
        available_units integer NOT NULL,
        rate numeric NOT NULL,
        PRIMARY KEY(room_id, stay_date)
      );
      CREATE TABLE public.bookings(
        id uuid PRIMARY KEY,
        confirmation_code text NOT NULL,
        customer_id uuid NOT NULL,
        property_id uuid NOT NULL REFERENCES public.properties(id),
        room_id uuid NOT NULL,
        check_in date NOT NULL,
        check_out date NOT NULL,
        guests integer NOT NULL,
        subtotal numeric NOT NULL,
        taxes numeric NOT NULL,
        fees numeric NOT NULL,
        total numeric NOT NULL,
        status text NOT NULL
      );
      CREATE TABLE public.profiles(id uuid PRIMARY KEY, full_name text, role text);
      CREATE TABLE public.revenue_daily_inputs(
        property_id uuid NOT NULL,
        room_id uuid NOT NULL,
        stay_date date NOT NULL,
        rooms_available integer NOT NULL,
        rooms_sold integer NOT NULL,
        current_rate numeric NOT NULL,
        competitor_rate numeric,
        event_name text,
        last_year_occupancy numeric
      );
      CREATE TABLE public.revenue_recommendations(
        property_id uuid NOT NULL,
        room_id uuid NOT NULL,
        stay_date date NOT NULL,
        current_rate numeric NOT NULL,
        recommended_rate numeric NOT NULL,
        occupancy_forecast numeric NOT NULL,
        estimated_revenue_impact numeric NOT NULL,
        reason text NOT NULL,
        status text NOT NULL
      );
      CREATE TABLE public.revenue_audit_log(
        property_id uuid NOT NULL,
        actor_id uuid NOT NULL,
        action text NOT NULL,
        details jsonb NOT NULL
      );
      INSERT INTO auth.users(id) VALUES ('${actorId}');
      INSERT INTO public.partners(id, status, owner_id) VALUES ('${partnerId}', 'approved', '${actorId}');
      INSERT INTO public.properties(id, partner_id, active) VALUES ('${propertyId}', '${partnerId}', true);
      INSERT INTO public.rooms(id, property_id, active) VALUES ('${roomId}', '${propertyId}', true);
    `);

    for (const migration of migrations) await db.exec(migration);
  });

  afterAll(async () => { await db.close(); });

  it("applies the chain, configures the OTA mapping, and keeps every sync switch disabled", async () => {
    const contracts = await db.query<{ connection_setup: boolean; ari_apply: boolean; outbox_claim: boolean; baseline_review: boolean; ota_reservation_stage: boolean; ota_reservation_claim: boolean; ota_reservation_finish: boolean }>(`
      SELECT
        to_regprocedure('public.irp_pms_configure_native_connection(uuid,uuid,uuid,text,uuid,uuid,text,text,text,integer,jsonb)') IS NOT NULL AS connection_setup,
        to_regprocedure('public.irp_pms_apply_native_ari(text,text,bigint,text,timestamptz,jsonb)') IS NOT NULL AS ari_apply,
        to_regprocedure('public.irp_pms_claim_configured_event(jsonb)') IS NOT NULL AS outbox_claim,
        to_regprocedure('public.irp_pms_capture_reviewed_baseline(uuid,uuid,uuid,date,integer,text)') IS NOT NULL AS baseline_review,
        to_regprocedure('public.irp_ota_stage_reservation(text,uuid,text,text,text,text,text,text,text,integer,jsonb)') IS NOT NULL AS ota_reservation_stage,
        to_regprocedure('public.irp_ota_claim_booking_com_reservation(integer)') IS NOT NULL AS ota_reservation_claim,
        to_regprocedure('public.irp_ota_finish_booking_com_reservation(uuid,uuid,text,text)') IS NOT NULL AS ota_reservation_finish
    `);
    expect(contracts.rows[0]).toEqual({ connection_setup: true, ari_apply: true, outbox_claim: true, baseline_review: true, ota_reservation_stage: true, ota_reservation_claim: true, ota_reservation_finish: true });

    const configured = await db.query<{ result: Record<string, unknown> }>(`
      SELECT public.irp_pms_configure_native_connection(
        $1::uuid,$2::uuid,$3::uuid,$4,$5::uuid,$6::uuid,$7,$8,$9,$10::integer,$11::jsonb
      ) AS result
    `, [
      "55555555-5555-4555-8555-555555555555", actorId, propertyId, "redroof-ridgeland-test",
      "66666666-6666-4666-8666-666666666666", propertyId,
      "c".repeat(64), "i".repeat(16), "t".repeat(16), 1,
      JSON.stringify([{ roomTypeId: "NDQ2", ratePlanId: "BAR", otaRoomId: roomId }]),
    ]);
    expect(configured.rows[0].result).toMatchObject({
      captureEnabled: false,
      deliveryEnabled: false,
      environment: "sandbox",
      reservationConnection: { captureEnabled: false, deliveryEnabled: false, outcome: "created" },
      ariConnection: { enabled: false, mappingCount: 1 },
    });

    const switches = await db.query<{ reservation_capture: boolean; reservation_delivery: boolean; ari_enabled: boolean; mapping_count: string }>(`
      SELECT
        c.enabled AS reservation_capture,
        c.delivery_enabled AS reservation_delivery,
        a.enabled AS ari_enabled,
        (SELECT count(*)::text FROM public.irp_pms_native_ari_mappings) AS mapping_count
      FROM public.irp_pms_outbox_connections c
      JOIN public.irp_pms_native_ari_connections a USING (property_id, connection_id)
      WHERE c.property_id = $1::uuid
    `, [propertyId]);
    expect(switches.rows[0]).toEqual({
      reservation_capture: false,
      reservation_delivery: false,
      ari_enabled: false,
      mapping_count: "1",
    });

    const baseline = await db.query<{ result: { eligibleForCapture: boolean; reservationCount: number } }>(
      "SELECT public.irp_pms_preview_reservation_baseline($1::uuid,$2::date) AS result",
      [propertyId, "2026-09-25"],
    );
    expect(baseline.rows[0].result).toMatchObject({ eligibleForCapture: true, reservationCount: 0 });

    const capture = await db.query<{ result: { replayed: boolean } }>(`
      SELECT public.irp_pms_capture_reviewed_baseline(
        $1::uuid,$2::uuid,$3::uuid,$4::date,0,$5
      ) AS result
    `, ["77777777-7777-4777-8777-777777777777", actorId, propertyId, "2026-09-25", "local-chain-capture"]);
    expect(capture.rows[0].result.replayed).toBe(false);

    const released = await db.query<{ result: { released: boolean; replayed: boolean } }>(`
      SELECT public.irp_pms_release_reviewed_baseline(
        $1::uuid,$2::uuid,$3::uuid,$4::date,0,$5
      ) AS result
    `, ["88888888-8888-4888-8888-888888888888", actorId, propertyId, "2026-09-25", "local-chain-roundtrip"]);
    expect(released.rows[0].result).toEqual({ released: true, replayed: false });

    const ariEnabled = await db.query<{ result: { enabled: boolean; outcome: string } }>(`
      SELECT public.irp_pms_set_native_ari_enabled(
        $1::uuid,$2,true,$3::uuid,$4
      ) AS result
    `, ["99999999-9999-4999-8999-999999999999", "redroof-ridgeland-test", actorId, "local-chain-roundtrip"]);
    expect(ariEnabled.rows[0].result).toEqual({ connectionId: "redroof-ridgeland-test", enabled: true, outcome: "updated" });

    const dateResult = await db.query<{ stay_date: string }>("SELECT (current_date + 2)::text AS stay_date");
    const stayDate = dateResult.rows[0].stay_date;
    const nextDate = await db.query<{ stay_date: string }>("SELECT ($1::date + 1)::text AS stay_date", [stayDate]);
    const ariUpdate = [{
      date: stayDate,
      roomTypeId: "NDQ2",
      ratePlanId: "BAR",
      available: 3,
      rateMinor: 10900,
      currency: "USD",
      minimumStay: 1,
      maximumStay: null,
      restrictions: [],
    }];
    const firstAri = await db.query<{ result: { outcome: string } }>(`
      SELECT public.irp_pms_apply_native_ari($1,$2,1,$3,$4::timestamptz,$5::jsonb) AS result
    `, ["redroof-ridgeland-test", "ari-chain-1", "a".repeat(64), new Date().toISOString(), JSON.stringify(ariUpdate)]);
    expect(firstAri.rows[0].result).toEqual({ outcome: "applied" });

    await db.query("INSERT INTO public.profiles(id,full_name,role) VALUES ($1::uuid,'Test Guest','guest')", [actorId]);
    await db.query(`
      INSERT INTO public.bookings(
        id,confirmation_code,customer_id,property_id,room_id,check_in,check_out,
        guests,subtotal,taxes,fees,total,status
      ) VALUES ($1::uuid,'RP-CHAIN-1',$2::uuid,$3::uuid,$4::uuid,$5::date,$6::date,2,100,10,5,115,'confirmed')
    `, ["aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", actorId, propertyId, roomId, stayDate, nextDate.rows[0].stay_date]);

    const secondAri = await db.query<{ result: { outcome: string } }>(`
      SELECT public.irp_pms_apply_native_ari($1,$2,2,$3,$4::timestamptz,$5::jsonb) AS result
    `, ["redroof-ridgeland-test", "ari-chain-2", "b".repeat(64), new Date().toISOString(), JSON.stringify(ariUpdate)]);
    expect(secondAri.rows[0].result).toEqual({ outcome: "applied" });

    const roundTrip = await db.query<{ available_units: number; rate: string; source_version: string; guest_name: string }>(`
      SELECT i.available_units, i.rate::text, o.source_version::text,
        o.event_payload #>> '{booking,guest_name}' AS guest_name
      FROM public.inventory i
      JOIN public.irp_pms_outbox o ON o.property_id = $1::uuid
      WHERE i.room_id = $2::uuid AND i.stay_date = $3::date
    `, [propertyId, roomId, stayDate]);
    expect(roundTrip.rows).toHaveLength(1);
    expect(roundTrip.rows[0]).toMatchObject({ available_units: 2, source_version: "1", guest_name: "Test Guest" });
    expect(Number(roundTrip.rows[0].rate)).toBe(109);
  });

  it("retains the migration filenames in strictly increasing order", () => {
    const versions = migrationFiles.map((name) => name.slice(0, 12));
    expect(versions).toEqual([...versions].sort());
    expect(new Set(versions).size).toBe(versions.length);
  });

  it("keeps Booking.com account credentials server-only, disabled by default, and within the shared token limit", async () => {
    const accountId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
    const connectionId = "booking-com-vault-test";
    const credentialEnvelope = {
      ciphertext: Buffer.from("encrypted envelope only").toString("base64"),
      iv: Buffer.alloc(12, 3).toString("base64"),
      tag: Buffer.alloc(16, 4).toString("base64"),
    };
    await db.query(`
      INSERT INTO public.irp_ota_machine_accounts(
        id,property_id,credentials_ciphertext,credentials_initialization_vector,
        credentials_authentication_tag,credentials_key_version
      ) VALUES ($1::uuid,$2::uuid,$3,$4,$5,1)
    `, [accountId, propertyId, credentialEnvelope.ciphertext, credentialEnvelope.iv, credentialEnvelope.tag]);

    const defaults = await db.query<{ enabled: boolean; partner_approved: boolean }>(
      "SELECT enabled,partner_approved FROM public.irp_ota_machine_accounts WHERE id=$1::uuid", [accountId],
    );
    expect(defaults.rows[0]).toEqual({ enabled: false, partner_approved: false });

    await db.query(`
      INSERT INTO public.irp_ota_channel_connections(
        connection_id,property_id,provider,provider_property_id,machine_account_id,enabled,partner_approved
      ) VALUES ($1,$2::uuid,'booking_com','partner-test-property',$3::uuid,true,true)
    `, [connectionId, propertyId, accountId]);
    const disabled = await db.query<{ result: { allowed: boolean; reason: string } }>(
      "SELECT public.irp_ota_reserve_booking_com_token_exchange($1::uuid) AS result", [accountId],
    );
    expect(disabled.rows[0].result).toEqual({ allowed: false, reason: "account_unavailable" });

    await db.query(`UPDATE public.irp_ota_machine_accounts
      SET enabled=true,partner_approved=true,approved_at=now() WHERE id=$1::uuid`, [accountId]);
    for (let attempt = 0; attempt < 30; attempt += 1) {
      const reserved = await db.query<{ result: { allowed: boolean; attemptsRemaining: number } }>(
        "SELECT public.irp_ota_reserve_booking_com_token_exchange($1::uuid) AS result", [accountId],
      );
      expect(reserved.rows[0].result.allowed).toBe(true);
    }
    const limited = await db.query<{ result: { allowed: boolean; reason: string } }>(
      "SELECT public.irp_ota_reserve_booking_com_token_exchange($1::uuid) AS result", [accountId],
    );
    expect(limited.rows[0].result).toEqual({ allowed: false, reason: "rate_limited" });

    await db.query(`UPDATE public.irp_ota_machine_account_token_attempts
      SET requested_at=clock_timestamp()-interval '61 minutes' WHERE machine_account_id=$1::uuid`, [accountId]);
    const afterWindow = await db.query<{ result: { allowed: boolean; attemptsRemaining: number } }>(
      "SELECT public.irp_ota_reserve_booking_com_token_exchange($1::uuid) AS result", [accountId],
    );
    expect(afterWindow.rows[0].result).toMatchObject({ allowed: true, attemptsRemaining: 29 });

    const privileges = await db.query<{ anon_select: boolean; authenticated_select: boolean; service_select: boolean; anon_execute: boolean; service_execute: boolean }>(`
      SELECT has_table_privilege('anon','public.irp_ota_machine_accounts','SELECT') AS anon_select,
        has_table_privilege('authenticated','public.irp_ota_machine_accounts','SELECT') AS authenticated_select,
        has_table_privilege('service_role','public.irp_ota_machine_accounts','SELECT') AS service_select,
        has_function_privilege('anon','public.irp_ota_reserve_booking_com_token_exchange(uuid)','EXECUTE') AS anon_execute,
        has_function_privilege('service_role','public.irp_ota_reserve_booking_com_token_exchange(uuid)','EXECUTE') AS service_execute
    `);
    expect(privileges.rows[0]).toEqual({ anon_select: false, authenticated_select: false, service_select: true, anon_execute: false, service_execute: true });
  });

  it("serializes machine-account refreshes, preserves the hourly limit, and allows expired-lease recovery", async () => {
    const accountId = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
    const connectionId = "booking-refresh-lease-test";
    await db.query(`
      INSERT INTO public.irp_ota_machine_accounts(
        id,property_id,credentials_ciphertext,credentials_initialization_vector,
        credentials_authentication_tag,credentials_key_version,enabled,partner_approved,approved_at
      ) VALUES ($1::uuid,$2::uuid,'ciphertext','AAAAAAAAAAAAAAAA','AAAAAAAAAAAAAAAAAAAAAA==',1,true,true,now())
    `, [accountId, propertyId]);
    await db.query(`INSERT INTO public.irp_ota_channel_connections(
      connection_id,property_id,provider,provider_property_id,machine_account_id,enabled,partner_approved
    ) VALUES ($1,$2::uuid,'booking_com','partner-refresh-property',$3::uuid,true,true)`, [connectionId, propertyId, accountId]);

    const firstLease = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
    const secondLease = "ffffffff-ffff-4fff-8fff-ffffffffffff";
    const acquire = (lease: string) => db.query<{ result: { allowed: boolean; reason: string; attemptsRemaining?: number } }>(
      "SELECT public.irp_ota_acquire_booking_com_token_refresh_lease($1::uuid,$2::uuid) AS result",
      [accountId, lease],
    );
    const first = await acquire(firstLease);
    expect(first.rows[0].result).toMatchObject({ allowed: true, reason: "acquired", attemptsRemaining: 29 });
    expect((await acquire(secondLease)).rows[0].result).toEqual({ allowed: false, reason: "refresh_in_progress" });
    const attemptCount = await db.query<{ count: number }>(
      "SELECT count(*)::int AS count FROM public.irp_ota_machine_account_token_attempts WHERE machine_account_id=$1::uuid", [accountId],
    );
    expect(attemptCount.rows[0].count).toBe(1);

    const wrongRelease = await db.query<{ result: boolean }>(
      "SELECT public.irp_ota_release_booking_com_token_refresh_lease($1::uuid,$2::uuid) AS result", [accountId, secondLease],
    );
    expect(wrongRelease.rows[0].result).toBe(false);
    const commit = (lease: string) => db.query<{ result: boolean }>(`
      SELECT public.irp_ota_commit_booking_com_token_refresh(
        $1::uuid,'ciphertext',$2::uuid,'new-encrypted-envelope','BBBBBBBBBBBBBBBB','BBBBBBBBBBBBBBBBBBBBBB==',1
      ) AS result
    `, [accountId, lease]);
    expect((await commit(secondLease)).rows[0].result).toBe(false);
    expect((await commit(firstLease)).rows[0].result).toBe(true);
    const cached = await db.query<{ ciphertext: string; lease: string | null; expires_at: string | null }>(`
      SELECT credentials_ciphertext AS ciphertext,token_refresh_lease::text AS lease,
        token_refresh_lease_expires_at::text AS expires_at
      FROM public.irp_ota_machine_accounts WHERE id=$1::uuid
    `, [accountId]);
    expect(cached.rows[0]).toEqual({ ciphertext: "new-encrypted-envelope", lease: null, expires_at: null });
    expect((await acquire(secondLease)).rows[0].result).toMatchObject({ allowed: true, reason: "acquired", attemptsRemaining: 28 });

    await db.query(`UPDATE public.irp_ota_machine_accounts
      SET token_refresh_lease_expires_at=clock_timestamp()-interval '1 second' WHERE id=$1::uuid`, [accountId]);
    expect((await acquire(firstLease)).rows[0].result).toMatchObject({ allowed: true, reason: "acquired", attemptsRemaining: 27 });

    const privileges = await db.query<{ anon_execute: boolean; authenticated_execute: boolean; service_execute: boolean; commit_anon_execute: boolean; commit_service_execute: boolean }>(`
      SELECT has_function_privilege('anon','public.irp_ota_acquire_booking_com_token_refresh_lease(uuid,uuid)','EXECUTE') AS anon_execute,
        has_function_privilege('authenticated','public.irp_ota_release_booking_com_token_refresh_lease(uuid,uuid)','EXECUTE') AS authenticated_execute,
        has_function_privilege('service_role','public.irp_ota_acquire_booking_com_token_refresh_lease(uuid,uuid)','EXECUTE') AS service_execute,
        has_function_privilege('anon','public.irp_ota_commit_booking_com_token_refresh(uuid,text,uuid,text,text,text,integer)','EXECUTE') AS commit_anon_execute,
        has_function_privilege('service_role','public.irp_ota_commit_booking_com_token_refresh(uuid,text,uuid,text,text,text,integer)','EXECUTE') AS commit_service_execute
    `);
    expect(privileges.rows[0]).toEqual({ anon_execute: false, authenticated_execute: false, service_execute: true, commit_anon_execute: false, commit_service_execute: true });
  });

  it("requires certification gates, queues ARI idempotently, and leases bounded retries", async () => {
    const connectionId = "booking-com-vault-test";
    const accountId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
    const gates = await db.query<{ ari_approved: boolean; certified: boolean }>(`
      SELECT ari_endpoint_approved AS ari_approved, certification_complete AS certified
        FROM public.irp_ota_channel_connections WHERE connection_id=$1
    `, [connectionId]);
    expect(gates.rows[0]).toEqual({ ari_approved: false, certified: false });

    const syncId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
    const xml = `<?xml version="1.0" encoding="UTF-8"?><OTA_HotelAvailNotifRQ><AvailStatusMessages/></OTA_HotelAvailNotifRQ>`;
    const sha = "a".repeat(64);
    const args = [connectionId, syncId, 0, "availability", "partner-test-property", "https://supply-xml.booking.com/hotels/ota/OTA_HotelAvailNotif", xml, sha];
    await sqlCode(() => db.query(`
      SELECT public.irp_ota_enqueue_booking_com_ari($1,$2::uuid,$3::integer,$4,$5,$6,$7,$8)
    `, args), "42501");

    await db.query(`UPDATE public.irp_ota_channel_connections
      SET ari_endpoint_approved=true,certification_complete=true WHERE connection_id=$1`, [connectionId]);
    const first = await db.query<{ result: { outcome: string; jobId: string } }>(`
      SELECT public.irp_ota_enqueue_booking_com_ari($1,$2::uuid,$3::integer,$4,$5,$6,$7,$8) AS result
    `, args);
    expect(first.rows[0].result.outcome).toBe("queued");
    const duplicate = await db.query<{ result: { outcome: string; jobId: string } }>(`
      SELECT public.irp_ota_enqueue_booking_com_ari($1,$2::uuid,$3::integer,$4,$5,$6,$7,$8) AS result
    `, args);
    expect(duplicate.rows[0].result).toEqual({ outcome: "duplicate", jobId: first.rows[0].result.jobId, status: "queued" });
    await sqlCode(() => db.query(`
      SELECT public.irp_ota_enqueue_booking_com_ari($1,$2::uuid,$3::integer,$4,$5,$6,$7,$8)
    `, [...args.slice(0, 7), "b".repeat(64)]), "23505");

    const claim = await db.query<{ claim: Record<string, unknown> }>(
      "SELECT public.irp_ota_claim_booking_com_ari(1) AS claim",
    );
    expect(claim.rows[0].claim).toMatchObject({
      jobId: first.rows[0].result.jobId, connectionId, propertyId,
      machineAccountId: accountId, providerPropertyId: "partner-test-property",
      kind: "availability", endpoint: args[5], requestXml: xml, attempt: 1,
    });
    const lease = String(claim.rows[0].claim.leaseToken);
    expect(await db.query("SELECT * FROM public.irp_ota_claim_booking_com_ari(1)")).toMatchObject({ rows: [] });

    const retried = await db.query<{ result: { outcome: string; attempt: number } }>(`
      SELECT public.irp_ota_finish_booking_com_ari($1::uuid,$2::uuid,'retry',503,'{"code":"http_503"}'::jsonb) AS result
    `, [first.rows[0].result.jobId, lease]);
    expect(retried.rows[0].result).toMatchObject({ outcome: "retry", attempt: 1 });
    const savedRetry = await db.query<{ status: string; attempt_count: number }>(
      "SELECT status,attempt_count FROM public.irp_ota_ari_outbox WHERE id=$1::uuid", [first.rows[0].result.jobId],
    );
    expect(savedRetry.rows[0]).toEqual({ status: "retry", attempt_count: 1 });
    await db.query("UPDATE public.irp_ota_ari_outbox SET available_at=now()-interval '1 minute' WHERE id=$1::uuid", [first.rows[0].result.jobId]);
    const reclaimed = await db.query<{ claim: Record<string, unknown> }>(
      "SELECT public.irp_ota_claim_booking_com_ari(1) AS claim",
    );
    expect(reclaimed.rows[0].claim.attempt).toBe(2);
    const sent = await db.query<{ result: { outcome: string } }>(`
      SELECT public.irp_ota_finish_booking_com_ari($1::uuid,$2::uuid,'sent',200,'{"outcome":"accepted"}'::jsonb) AS result
    `, [first.rows[0].result.jobId, reclaimed.rows[0].claim.leaseToken]);
    expect(sent.rows[0].result.outcome).toBe("sent");
    const finalStatus = await db.query<{ status: string; last_http_status: number; last_result: { outcome: string } }>(
      "SELECT status,last_http_status,last_result FROM public.irp_ota_ari_outbox WHERE id=$1::uuid", [first.rows[0].result.jobId],
    );
    expect(finalStatus.rows[0]).toEqual({ status: "sent", last_http_status: 200, last_result: { outcome: "accepted" } });

    const privileges = await db.query<{ anon_select: boolean; service_select: boolean; anon_enqueue: boolean; service_enqueue: boolean }>(`
      SELECT has_table_privilege('anon','public.irp_ota_ari_outbox','SELECT') AS anon_select,
        has_table_privilege('service_role','public.irp_ota_ari_outbox','SELECT') AS service_select,
        has_function_privilege('anon','public.irp_ota_enqueue_booking_com_ari(text,uuid,integer,text,text,text,text,text)','EXECUTE') AS anon_enqueue,
        has_function_privilege('service_role','public.irp_ota_enqueue_booking_com_ari(text,uuid,integer,text,text,text,text,text)','EXECUTE') AS service_enqueue
    `);
    expect(privileges.rows[0]).toEqual({ anon_select: false, service_select: true, anon_enqueue: false, service_enqueue: true });
  });

  it("rejects non-Booking.com providers from the shared encrypted reservation inbox", async () => {
    const bookingConnectionId = "booking-com-inbox-guard-test";
    await db.query(`
      INSERT INTO public.irp_ota_channel_connections(
        connection_id,property_id,provider,provider_property_id
      ) VALUES ($1,$2::uuid,'booking_com','booking-inbox-test-property')
    `, [bookingConnectionId, propertyId]);
    const accepted = await db.query<{ id: string }>(`
      INSERT INTO public.irp_ota_reservation_inbox(
        connection_id,property_id,provider_reservation_id_sha256,payload_sha256,event_kind,
        pii_ciphertext,pii_initialization_vector,pii_authentication_tag,pii_key_version
      ) VALUES ($1,$2::uuid,$3,$4,'new','ZW5jcnlwdGVk','AAAAAAAAAAAAAAAA','AAAAAAAAAAAAAAAAAAAAAA==',1)
      RETURNING id
    `, [bookingConnectionId, propertyId, "c".repeat(64), "d".repeat(64)]);
    expect(accepted.rows).toHaveLength(1);

    const disabledClaim = await db.query("SELECT * FROM public.irp_ota_claim_booking_com_reservation(1)");
    expect(disabledClaim.rows).toHaveLength(0);
    await db.query(`UPDATE public.irp_ota_channel_connections
      SET enabled=true,partner_approved=true,pii_compliance_approved=true WHERE connection_id=$1`, [bookingConnectionId]);
    const firstClaim = await db.query<{ id: string; status: string; attempt_count: number; lease_token: string }>(
      "SELECT id,status,attempt_count,lease_token FROM public.irp_ota_claim_booking_com_reservation(1)",
    );
    expect(firstClaim.rows[0]).toMatchObject({ id: accepted.rows[0].id, status: "leased", attempt_count: 1 });
    const firstLease = firstClaim.rows[0].lease_token;
    const retry = await db.query<{ saved: boolean }>(`
      SELECT public.irp_ota_finish_booking_com_reservation($1::uuid,$2::uuid,'retry','temporary_failure') AS saved
    `, [accepted.rows[0].id, firstLease]);
    expect(retry.rows[0].saved).toBe(true);
    await db.query("UPDATE public.irp_ota_reservation_inbox SET available_at=now()-interval '1 second' WHERE id=$1::uuid", [accepted.rows[0].id]);
    const reclaimed = await db.query<{ id: string; attempt_count: number; lease_token: string }>(
      "SELECT id,attempt_count,lease_token FROM public.irp_ota_claim_booking_com_reservation(1)",
    );
    expect(reclaimed.rows[0]).toMatchObject({ id: accepted.rows[0].id, attempt_count: 2 });
    const applied = await db.query<{ saved: boolean }>(`
      SELECT public.irp_ota_finish_booking_com_reservation($1::uuid,$2::uuid,'imported','pms_persisted') AS saved
    `, [accepted.rows[0].id, reclaimed.rows[0].lease_token]);
    expect(applied.rows[0].saved).toBe(true);
    const imported = await db.query<{ status: string; attempt_count: number; result_code: string }>(
      "SELECT status,attempt_count,result_code FROM public.irp_ota_reservation_inbox WHERE id=$1::uuid", [accepted.rows[0].id],
    );
    expect(imported.rows[0]).toEqual({ status: "imported", attempt_count: 2, result_code: "pms_persisted" });
    const leaseLost = await db.query<{ saved: boolean }>(`
      SELECT public.irp_ota_finish_booking_com_reservation($1::uuid,$2::uuid,'imported','pms_persisted') AS saved
    `, [accepted.rows[0].id, reclaimed.rows[0].lease_token]);
    expect(leaseLost.rows[0].saved).toBe(false);

    const lifecyclePrivileges = await db.query<{ anon_execute: boolean; authenticated_execute: boolean; service_execute: boolean }>(`
      SELECT has_function_privilege('anon','public.irp_ota_claim_booking_com_reservation(integer)','EXECUTE') AS anon_execute,
        has_function_privilege('authenticated','public.irp_ota_finish_booking_com_reservation(uuid,uuid,text,text)','EXECUTE') AS authenticated_execute,
        has_function_privilege('service_role','public.irp_ota_claim_booking_com_reservation(integer)','EXECUTE') AS service_execute
    `);
    expect(lifecyclePrivileges.rows[0]).toEqual({ anon_execute: false, authenticated_execute: false, service_execute: true });

    const connectionId = "unsupported-expedia-test";
    await db.query(`
      INSERT INTO public.irp_ota_channel_connections(
        connection_id,property_id,provider,provider_property_id,enabled,partner_approved,pii_compliance_approved
      ) VALUES ($1,$2::uuid,'expedia','expedia-test-property',true,true,true)
    `, [connectionId, propertyId]);
    await db.query(`
      INSERT INTO public.irp_ota_channel_room_mappings(
        connection_id,provider_room_type_id,provider_rate_plan_id,local_room_id
      ) VALUES ($1,'exp-room','exp-rate',$2::uuid)
    `, [connectionId, roomId]);

    await sqlCode(() => db.query(`
      SELECT public.irp_ota_stage_reservation(
        $1,$2::uuid,$3,$4,$5,'new',$6,$7,$8,1,$9::jsonb
      )
    `, [
      connectionId, propertyId, "expedia-test-property", "a".repeat(64), "b".repeat(64),
      Buffer.from("encrypted").toString("base64"), Buffer.alloc(12).toString("base64"),
      Buffer.alloc(16).toString("base64"), JSON.stringify([{ roomTypeId: "exp-room", ratePlanId: "exp-rate" }]),
    ]), "42501");

    const persisted = await db.query<{ count: number }>(
      "SELECT count(*)::int AS count FROM public.irp_ota_reservation_inbox WHERE connection_id=$1",
      [connectionId],
    );
    expect(persisted.rows[0].count).toBe(0);
  });

  it("keeps Booking.com retries and updates ordered by a stable per-reservation source version", async () => {
    const connectionId = "booking-source-order-test";
    await db.query(`INSERT INTO public.irp_ota_channel_connections(
      connection_id,property_id,provider,provider_property_id,enabled,partner_approved,pii_compliance_approved
    ) VALUES ($1,$2::uuid,'booking_com','booking-order-property',true,true,true)`, [connectionId, propertyId]);
    await db.query(`INSERT INTO public.irp_ota_channel_room_mappings(
      connection_id,provider_room_type_id,provider_rate_plan_id,local_room_id
    ) VALUES ($1,'order-room','order-rate',$2::uuid)`, [connectionId, roomId]);

    const stage = (payloadDigest: string, kind: "new" | "modified" | "cancelled") => db.query<{ outcome: string; source_version: number }>(`
      SELECT result->>'outcome' AS outcome,(result->>'sourceVersion')::int AS source_version
      FROM (SELECT public.irp_ota_stage_reservation(
        $1,$2::uuid,'booking-order-property',$3,$4,$5,'ZW5jcnlwdGVk','AAAAAAAAAAAAAAAA','AAAAAAAAAAAAAAAAAAAAAA==',1,
        '[{"roomTypeId":"order-room","ratePlanId":"order-rate"}]'::jsonb
      ) AS result) staged
    `, [connectionId, propertyId, "e".repeat(64), payloadDigest, kind]);
    const created = await stage("a".repeat(64), "new");
    const replay = await stage("a".repeat(64), "new");
    const modified = await stage("b".repeat(64), "modified");
    const cancelled = await stage("c".repeat(64), "cancelled");
    expect(created.rows[0]).toEqual({ outcome: "received", source_version: 1 });
    expect(replay.rows[0]).toEqual({ outcome: "duplicate", source_version: 1 });
    expect(modified.rows[0]).toEqual({ outcome: "received", source_version: 2 });
    expect(cancelled.rows[0]).toEqual({ outcome: "received", source_version: 3 });

    const first = await db.query<{ id: string; source_version: number; lease_token: string }>(
      "SELECT id,source_version,lease_token FROM public.irp_ota_claim_booking_com_reservation(10)",
    );
    expect(first.rows).toHaveLength(1);
    expect(first.rows[0].source_version).toBe(1);
    await db.query("SELECT public.irp_ota_finish_booking_com_reservation($1::uuid,$2::uuid,'retry','temporary_failure')", [first.rows[0].id, first.rows[0].lease_token]);
    await db.query("UPDATE public.irp_ota_reservation_inbox SET available_at=now()-interval '1 second' WHERE id=$1::uuid", [first.rows[0].id]);
    const retry = await db.query<{ id: string; source_version: number; lease_token: string }>(
      "SELECT id,source_version,lease_token FROM public.irp_ota_claim_booking_com_reservation(10)",
    );
    expect(retry.rows).toHaveLength(1);
    expect(retry.rows[0]).toMatchObject({ id: first.rows[0].id, source_version: 1 });
    await db.query("SELECT public.irp_ota_finish_booking_com_reservation($1::uuid,$2::uuid,'imported','pms_persisted')", [retry.rows[0].id, retry.rows[0].lease_token]);

    const second = await db.query<{ id: string; source_version: number; lease_token: string }>(
      "SELECT id,source_version,lease_token FROM public.irp_ota_claim_booking_com_reservation(10)",
    );
    expect(second.rows).toHaveLength(1);
    expect(second.rows[0].source_version).toBe(2);
    await db.query("SELECT public.irp_ota_finish_booking_com_reservation($1::uuid,$2::uuid,'review','manual_review_required')", [second.rows[0].id, second.rows[0].lease_token]);
    const blocked = await db.query("SELECT * FROM public.irp_ota_claim_booking_com_reservation(10)");
    expect(blocked.rows).toHaveLength(0);
  });

  it("claims credential rotation only for the service role and commits only the exact leased envelope", async () => {
    const accountId = "99999999-9999-4999-8999-999999999999";
    await db.query("UPDATE public.irp_ota_machine_accounts SET credentials_key_version=2");
    await db.query(`INSERT INTO public.irp_ota_machine_accounts(
      id,property_id,credentials_ciphertext,credentials_initialization_vector,
      credentials_authentication_tag,credentials_key_version
    ) VALUES ($1::uuid,$2::uuid,'old-ciphertext','AAAAAAAAAAAAAAAA','AAAAAAAAAAAAAAAAAAAAAA==',1)`, [accountId, propertyId]);

    const privileges = await db.query<{ anon_execute: boolean; authenticated_execute: boolean; service_execute: boolean }>(`
      SELECT has_function_privilege('anon','public.irp_ota_claim_booking_com_credential_rotation(integer,integer)','EXECUTE') AS anon_execute,
        has_function_privilege('authenticated','public.irp_ota_claim_booking_com_credential_rotation(integer,integer)','EXECUTE') AS authenticated_execute,
        has_function_privilege('service_role','public.irp_ota_claim_booking_com_credential_rotation(integer,integer)','EXECUTE') AS service_execute
    `);
    expect(privileges.rows[0]).toEqual({ anon_execute: false, authenticated_execute: false, service_execute: true });

    const claim = () => db.query<{ id: string; credentials_ciphertext: string; credentials_key_version: number; lease_token: string }>(
      "SELECT * FROM public.irp_ota_claim_booking_com_credential_rotation(2,1)",
    );
    const first = await claim();
    expect(first.rows).toHaveLength(1);
    expect(first.rows[0]).toMatchObject({ id: accountId, credentials_ciphertext: "old-ciphertext", credentials_key_version: 1 });
    expect(first.rows[0].lease_token).toMatch(/^[0-9a-f-]{36}$/i);
    expect((await claim()).rows).toHaveLength(0);

    const commit = (expectedCiphertext: string) => db.query<{ result: boolean }>(`
      SELECT public.irp_ota_commit_booking_com_credential_rotation(
        $1::uuid,$2::uuid,$3,'AAAAAAAAAAAAAAAA','AAAAAAAAAAAAAAAAAAAAAA==',1,
        'new-ciphertext','BBBBBBBBBBBBBBBB','BBBBBBBBBBBBBBBBBBBBBB==',2
      ) AS result
    `, [accountId, first.rows[0].lease_token, expectedCiphertext]);
    expect((await commit("different-ciphertext")).rows[0].result).toBe(false);
    expect((await commit("old-ciphertext")).rows[0].result).toBe(true);
    const saved = await db.query<{ ciphertext: string; key_version: number; lease: string | null }>(`
      SELECT credentials_ciphertext AS ciphertext,credentials_key_version AS key_version,
        credential_rotation_lease::text AS lease FROM public.irp_ota_machine_accounts WHERE id=$1::uuid
    `, [accountId]);
    expect(saved.rows[0]).toEqual({ ciphertext: "new-ciphertext", key_version: 2, lease: null });
  });

  it("purges only imported reservation PII older than 30 days and keeps its non-PII receipt", async () => {
    const connectionId = "booking-retention-test";
    const importedId = "88888888-8888-4888-8888-888888888888";
    const reviewId = "77777777-7777-4777-8777-777777777777";
    await db.query(`INSERT INTO public.irp_ota_channel_connections(
      connection_id,property_id,provider,provider_property_id,enabled,partner_approved,pii_compliance_approved
    ) VALUES ($1,$2::uuid,'booking_com','retention-property',true,true,true)`, [connectionId, propertyId]);
    const insertInbox = (id: string, status: "imported" | "review", age: string) => db.query(`
      INSERT INTO public.irp_ota_reservation_inbox(
        id,connection_id,property_id,provider_reservation_id_sha256,payload_sha256,event_kind,
        pii_ciphertext,pii_initialization_vector,pii_authentication_tag,pii_key_version,status,received_at
      ) VALUES ($1::uuid,$2,$3::uuid,$4,$5,'new','ZW5jcnlwdGVk','AAAAAAAAAAAAAAAA','AAAAAAAAAAAAAAAAAAAAAA==',1,$6,clock_timestamp()-$7::interval)
    `, [id, connectionId, propertyId, id.replaceAll("-", "").padStart(64, "a"), "b".repeat(64), status, age]);
    await insertInbox(importedId, "imported", "31 days");
    await insertInbox(reviewId, "review", "365 days");

    const purged = await db.query<{ count: number }>(
      "SELECT public.irp_ota_purge_booking_com_reservation_pii(10) AS count",
    );
    expect(purged.rows[0].count).toBe(1);
    const rows = await db.query<{ id: string; status: string; ciphertext: string | null; purged_at: string | null }>(`
      SELECT id::text,status,pii_ciphertext AS ciphertext,pii_purged_at::text AS purged_at
      FROM public.irp_ota_reservation_inbox WHERE id IN ($1::uuid,$2::uuid) ORDER BY id
    `, [importedId, reviewId]);
    expect(rows.rows).toEqual(expect.arrayContaining([
      { id: importedId, status: "imported", ciphertext: null, purged_at: expect.any(String) },
      { id: reviewId, status: "review", ciphertext: "ZW5jcnlwdGVk", purged_at: null },
    ]));
    await sqlCode(() => db.query("SELECT public.irp_ota_purge_booking_com_reservation_pii(101)"), "22023");
  });
});
