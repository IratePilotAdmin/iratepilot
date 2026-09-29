import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  createFlightConsumerPreviewReferenceKeyring,
  decryptFlightConsumerPreviewReference,
  encryptFlightConsumerPreviewReference,
  sha256FlightConsumerPreviewReference,
} from "../lib/flights/consumer-preview/reference-crypto.server";

const keyring = createFlightConsumerPreviewReferenceKeyring({
  keyVersion: "preview-reference-v1",
  encryptionKeyBase64Url: Buffer.alloc(32, 11).toString("base64url"),
  hmacKeyBase64Url: Buffer.alloc(32, 12).toString("base64url"),
});

const context = Object.freeze({
  kind: "duffel_order" as const,
  customerId: "11111111-1111-4111-8111-111111111111",
  resourceId: "22222222-2222-4222-8222-222222222222",
  executionScopeSha256: "a".repeat(64),
});

describe("Flight Consumer Preview reference encryption", () => {
  it("round-trips an opaque provider identifier with a compact schema-compatible envelope", () => {
    const encrypted = encryptFlightConsumerPreviewReference({
      value: "ord_0000B9jtKP6zGY0BemFUgN",
      context,
      keyring,
    });
    expect(encrypted.ciphertext).toMatch(/^enc:v1:[A-Za-z0-9_-]{16,4073}$/);
    expect(encrypted.ciphertext.length).toBeLessThan(4_080);
    expect(encrypted.referenceSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(decryptFlightConsumerPreviewReference({
      ciphertext: encrypted.ciphertext,
      expectedReferenceSha256: encrypted.referenceSha256,
      context,
      keyring,
    })).toBe("ord_0000B9jtKP6zGY0BemFUgN");
  });

  it.each([
    ["duffel_order", "ord_0000B9jtKP6zGY0BemFUgN"],
    ["duffel_offer", "off_0000B9jtKP6zGY0BemFUgN"],
  ] as const)("uses one domain-separated %s digest for encryption, webhooks, and recovery", (kind, value) => {
    const encrypted = encryptFlightConsumerPreviewReference({
      value,
      context: { ...context, kind },
      keyring,
    });
    const canonicalDigest = sha256FlightConsumerPreviewReference({ kind, value });
    const rawDigest = createHash("sha256").update(value, "utf8").digest("hex");
    expect(encrypted.referenceSha256).toBe(canonicalDigest);
    expect(canonicalDigest).not.toBe(rawDigest);
  });

  it("round-trips a short opaque Duffel TEST ticket identifier without weakening other reference kinds", () => {
    const ticketContext = {
      ...context,
      kind: "duffel_ticket" as const,
      resourceId: "ticket:22222222-2222-4222-8222-222222222222",
    };
    const encrypted = encryptFlightConsumerPreviewReference({
      value: "1",
      context: ticketContext,
      keyring,
    });
    expect(decryptFlightConsumerPreviewReference({
      ciphertext: encrypted.ciphertext,
      expectedReferenceSha256: encrypted.referenceSha256,
      context: ticketContext,
      keyring,
    })).toBe("1");
    expect(() => encryptFlightConsumerPreviewReference({
      value: "1",
      context,
      keyring,
    })).toThrow();
    expect(() => sha256FlightConsumerPreviewReference({
      kind: "duffel_order",
      value: "1",
    })).toThrow();
    for (const value of ["", "A".repeat(65), "ticket.1", "ticket:1", "ticket_1"]) {
      expect(() => encryptFlightConsumerPreviewReference({
        value,
        context: ticketContext,
        keyring,
      })).toThrow();
      expect(() => sha256FlightConsumerPreviewReference({
        kind: "duffel_ticket",
        value,
      })).toThrow();
    }
  });

  it("rejects ciphertext, digest, and resource-context substitution", () => {
    const encrypted = encryptFlightConsumerPreviewReference({
      value: "pi_preview12345678",
      context: { ...context, kind: "stripe_payment_intent" },
      keyring,
    });
    expect(() => decryptFlightConsumerPreviewReference({
      ciphertext: `${encrypted.ciphertext.slice(0, -1)}A`,
      expectedReferenceSha256: encrypted.referenceSha256,
      context: { ...context, kind: "stripe_payment_intent" },
      keyring,
    })).toThrow();
    expect(() => decryptFlightConsumerPreviewReference({
      ciphertext: encrypted.ciphertext,
      expectedReferenceSha256: "b".repeat(64),
      context: { ...context, kind: "stripe_payment_intent" },
      keyring,
    })).toThrow();
    expect(() => decryptFlightConsumerPreviewReference({
      ciphertext: encrypted.ciphertext,
      expectedReferenceSha256: encrypted.referenceSha256,
      context: { ...context, kind: "stripe_payment_intent", resourceId: "33333333-3333-4333-8333-333333333333" },
      keyring,
    })).toThrow();
  });

  it("refuses identical encryption and authentication keys", () => {
    const same = Buffer.alloc(32, 7).toString("base64url");
    expect(() => createFlightConsumerPreviewReferenceKeyring({
      keyVersion: "preview-reference-v1",
      encryptionKeyBase64Url: same,
      hmacKeyBase64Url: same,
    })).toThrow();
  });
});
