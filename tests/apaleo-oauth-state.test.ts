import { afterEach, describe, expect, it } from "vitest";
import {
  apaleoOAuthCookieOptions,
  createApaleoOAuthMarker,
  verifyApaleoOAuthMarker,
} from "../lib/integrations/apaleo-oauth-state";

describe("Apaleo OAuth state", () => {
  const previous = process.env.PMS_CREDENTIAL_ENCRYPTION_KEY;

  afterEach(() => {
    process.env.PMS_CREDENTIAL_ENCRYPTION_KEY = previous;
  });

  it("uses a valid root path for the __Host cookie", () => {
    expect(apaleoOAuthCookieOptions).toMatchObject({
      httpOnly: true,
      path: "/",
      secure: true,
    });
  });

  it("binds state to the admin, connection, and short expiry", () => {
    process.env.PMS_CREDENTIAL_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
    const now = Date.UTC(2026, 9, 15);
    const marker = createApaleoOAuthMarker({
      connectionId: "connection-1",
      state: "state-1",
      userId: "admin-1",
    }, now);
    expect(verifyApaleoOAuthMarker(marker, { state: "state-1", userId: "admin-1" }, now + 1_000))
      .toEqual({ connectionId: "connection-1" });
    expect(verifyApaleoOAuthMarker(marker, { state: "wrong", userId: "admin-1" }, now + 1_000)).toBeNull();
    expect(verifyApaleoOAuthMarker(marker, { state: "state-1", userId: "other" }, now + 1_000)).toBeNull();
    expect(verifyApaleoOAuthMarker(marker, { state: "state-1", userId: "admin-1" }, now + 601_000)).toBeNull();
  });
});
