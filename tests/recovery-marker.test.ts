import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createRecoveryMarker,
  isPasswordRecoveryExchange,
  recoveryMarkerMaxAge,
  verifyRecoveryMarker,
} from "../lib/auth/recovery-marker";

describe("password recovery marker", () => {
  const userId = "59bcabae-1c9b-47a1-8581-8455c5d84917";
  const now = Date.UTC(2026, 7, 16, 1, 45, 0);

  beforeEach(() => {
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test-only-recovery-signing-secret");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("accepts a signed marker only for its verified user", () => {
    const marker = createRecoveryMarker(userId, now);
    expect(verifyRecoveryMarker(marker, userId, now)).toBe(true);
    expect(verifyRecoveryMarker(marker, "another-user", now)).toBe(false);
  });

  it("rejects tampered and expired markers", () => {
    const marker = createRecoveryMarker(userId, now);
    const replacement = marker.endsWith("A") ? "B" : "A";
    const tampered = `${marker.slice(0, -1)}${replacement}`;

    expect(verifyRecoveryMarker(tampered, userId, now)).toBe(false);
    expect(verifyRecoveryMarker(
      marker,
      userId,
      now + recoveryMarkerMaxAge * 1000,
    )).toBe(false);
  });

  it("fails closed when server signing configuration is unavailable", () => {
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
    expect(() => createRecoveryMarker(userId, now)).toThrow(
      "Password recovery signing configuration is missing.",
    );
    expect(verifyRecoveryMarker("marker.signature", userId, now)).toBe(false);
  });

  it("accepts only PKCE exchanges explicitly identified as password recovery", () => {
    expect(isPasswordRecoveryExchange({ redirectType: "recovery" })).toBe(true);
    expect(isPasswordRecoveryExchange({ redirectType: "signup" })).toBe(false);
    expect(isPasswordRecoveryExchange({})).toBe(false);
    expect(isPasswordRecoveryExchange(null)).toBe(false);
  });
});

