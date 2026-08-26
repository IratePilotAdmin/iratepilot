import "server-only";

import { createHmac } from "node:crypto";

import type { DuffelSandboxOrderCreateAuthorityVerifier } from "../duffel-sandbox-contract";
import {
  canonicalFlightJson,
  digestFlightRuntimeSettlementBinding,
  sha256FlightEvidence,
  type FlightCanonicalJsonValue,
  type FlightRuntimeSettlementBinding,
} from "../runtime-safety";
import type { FlightConsumerPreviewRuntimeBinding } from "./runtime.server";

export class FlightConsumerPreviewAuthorityError extends Error {
  constructor() {
    super("Flight Consumer Preview authority evidence is unavailable.");
    this.name = "FlightConsumerPreviewAuthorityError";
  }
}

function readSecret(env: Readonly<Record<string, string | undefined>>) {
  const value = env.FLIGHT_DUFFEL_TEST_AUTHORITY_SECRET;
  if (
    env.VERCEL_ENV !== "preview"
    || env.FLIGHT_CONSUMER_PREVIEW_ENABLED !== "true"
    || typeof value !== "string"
    || value.length < 32
  ) throw new FlightConsumerPreviewAuthorityError();
  return value;
}

function receipt(secret: string, label: string, value: unknown) {
  return createHmac("sha256", secret)
    .update(label)
    .update("\0")
    .update(canonicalFlightJson(value as FlightCanonicalJsonValue))
    .digest("hex");
}

export function createFlightConsumerPreviewAuthority(
  binding: FlightConsumerPreviewRuntimeBinding,
  env: Readonly<Record<string, string | undefined>> = process.env,
) {
  const secret = readSecret(env);
  return Object.freeze({
    operationReceipt(label: string, value: unknown) {
      if (!/^[a-z][a-z0-9_-]{2,63}$/.test(label)) {
        throw new FlightConsumerPreviewAuthorityError();
      }
      return receipt(secret, `flight-consumer-preview-${label}-v1`, value);
    },
    paymentBindingReceipt(input: Readonly<{
      customerId: string;
      orderId: string;
      paymentId: string;
      processorReferenceSha256: string;
      amountCents: number;
      currency: string;
    }>) {
      return receipt(secret, "flight-consumer-preview-stripe-binding-v1", {
        ...input,
        executionScopeSha256: binding.executionScopeSha256,
        paymentAccountSha256: binding.paymentAccountSha256,
        paymentSourceSha256: binding.paymentSourceSha256,
        paymentAdapterVersionSha256: binding.paymentAdapterVersionSha256,
      });
    },
    termsAcceptanceReceipt(input: Readonly<{
      customerId: string;
      orderId: string;
      repriceReceiptId: string;
      refreshedOfferReceiptSha256: string;
      termsDigest: string;
      amountCents: number;
      currency: string;
    }>) {
      return receipt(secret, "flight-consumer-preview-terms-acceptance-v1", {
        ...input,
        executionScopeSha256: binding.executionScopeSha256,
      });
    },
    settlement(input: Readonly<{
      customerId: string;
      orderId: string;
      amountCents: number;
      currency: string;
    }>) {
      const settlementBinding: FlightRuntimeSettlementBinding = Object.freeze({
        providerId: "duffel_sandbox_contract_v1",
        method: "provider_balance",
        accountScopeReceiptDigest: receipt(secret, "flight-consumer-preview-duffel-balance-account-v1", {
          customerId: input.customerId,
          orderId: input.orderId,
          accountSha256: binding.providerSettlementAccountSha256,
          sourceSha256: binding.providerSettlementSourceSha256,
          adapterVersionSha256: binding.providerSettlementAdapterVersionSha256,
        }),
        environmentScopeReceiptDigest: receipt(secret, "flight-consumer-preview-duffel-balance-environment-v1", {
          orderId: input.orderId,
          environment: binding.providerSettlementEnvironment,
          executionScopeSha256: binding.executionScopeSha256,
          activationEvidenceSha256: binding.activationEvidenceSha256,
        }),
        currency: input.currency,
      });
      const settlementBindingDigest = digestFlightRuntimeSettlementBinding(settlementBinding);
      return Object.freeze({
        settlementBinding,
        settlementBindingDigest,
        providerSettlementBindingReceiptSha256: receipt(
          secret,
          "flight-consumer-preview-provider-settlement-binding-v1",
          { ...input, settlementBindingDigest },
        ),
        settlementAuthorityReceiptSha256: receipt(
          secret,
          "flight-consumer-preview-provider-settlement-authority-v1",
          { ...input, settlementBindingDigest },
        ),
      });
    },
    orderCreateVerifier(evaluatedAt: string): DuffelSandboxOrderCreateAuthorityVerifier {
      return Object.freeze({
        readTrustedTime() {
          return evaluatedAt;
        },
        async verifyOrderCreateAuthority(
          input: Parameters<DuffelSandboxOrderCreateAuthorityVerifier["verifyOrderCreateAuthority"]>[0],
        ) {
          if (input.evaluatedAt !== evaluatedAt) return Object.freeze({ decision: "invalid" as const });
          const claimsDigest = sha256FlightEvidence(input.claims as unknown as FlightCanonicalJsonValue);
          return Object.freeze({
            decision: "verified" as const,
            claimsDigest,
            authorityReceiptDigest: receipt(secret, "flight-consumer-preview-order-authority-v1", {
              claimsDigest,
              evaluatedAt,
              executionScopeSha256: binding.executionScopeSha256,
              runtimeControlReceiptSha256: binding.runtimeControlReceiptSha256,
            }),
          });
        },
      });
    },
  });
}
