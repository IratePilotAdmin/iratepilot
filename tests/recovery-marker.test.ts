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
    vi.stubEnv("AUTH_RECOVERY_SIGNING_SECRET", "");
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

  it("supports a dedicated signing key without a database administrator credential", () => {
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
    vi.stubEnv("AUTH_RECOVERY_SIGNING_SECRET", "test-only-dedicated-recovery-secret-at-least-32-characters");
    const marker = createRecoveryMarker(userId, now);
    expect(verifyRecoveryMarker(marker, userId, now)).toBe(true);
    expect(verifyRecoveryMarker(marker, "another-user", now)).toBe(false);
    vi.stubEnv("AUTH_RECOVERY_SIGNING_SECRET", "different-test-only-secret-at-least-32-characters");
    expect(verifyRecoveryMarker(marker, userId, now)).toBe(false);
  });

  it("does not fall back to the legacy credential when a dedicated key is too short", () => {
    vi.stubEnv("AUTH_RECOVERY_SIGNING_SECRET", "short");
    expect(() => createRecoveryMarker(userId, now)).toThrow("Password recovery signing configuration is missing.");
    expect(verifyRecoveryMarker("marker.signature", userId, now)).toBe(false);
  });

  it("uses the dedicated key in preference to the legacy credential", () => {
    vi.stubEnv("AUTH_RECOVERY_SIGNING_SECRET", "test-only-dedicated-recovery-secret-at-least-32-characters");
    const marker = createRecoveryMarker(userId, now);
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "changed-legacy-credential");
    expect(verifyRecoveryMarker(marker, userId, now)).toBe(true);
  });
});

