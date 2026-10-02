import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { hasCurrentHotelMarketplaceReleaseAuthorization } from "../lib/hotels/marketplace-release-authorization";

const migration = readFileSync(new URL(
  "../supabase/migrations/202609300161_hotel_marketplace_release_authorization.sql",
  import.meta.url,
), "utf8");

describe("hotel marketplace release authorization", () => {
  it("accepts only an explicit current database authorization", async () => {
    const valid = { rpc: vi.fn(async () => ({ data: true, error: null })) };
    const falseResult = { rpc: vi.fn(async () => ({ data: false, error: null })) };
    const failed = { rpc: vi.fn(async () => ({ data: null, error: new Error("unavailable") })) };
    await expect(hasCurrentHotelMarketplaceReleaseAuthorization(valid)).resolves.toBe(true);
    await expect(hasCurrentHotelMarketplaceReleaseAuthorization(falseResult)).resolves.toBe(false);
    await expect(hasCurrentHotelMarketplaceReleaseAuthorization(failed)).resolves.toBe(false);
  });

  it("fails closed when the database call throws", async () => {
    const client = { rpc: vi.fn(() => { throw new Error("missing migration"); }) };
    await expect(hasCurrentHotelMarketplaceReleaseAuthorization(client)).resolves.toBe(false);
  });

  it("defines append-only, expiring, revocable evidence without enabling runtime switches", () => {
    expect(migration).toContain("hotel_marketplace_release_authorizations");
    expect(migration).toContain("hotel_marketplace_release_authorization_revocations");
    expect(migration).toContain("expires_at <= approved_at + interval '7 days'");
    expect(migration).toContain("Hotel marketplace release evidence is append-only");
    expect(migration).toContain("pg_catalog.pg_advisory_xact_lock");
    expect(migration).toContain("has_current_hotel_marketplace_release_authorization");
    expect(migration).not.toMatch(/update public\.properties|HOTEL_PUBLICATION_ENABLED|ENABLE_LIVE_BOOKING_PAYMENTS/);
  });
});
