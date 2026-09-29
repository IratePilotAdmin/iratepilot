import { createHash, createHmac, timingSafeEqual } from "node:crypto";

/** No flag in this module defaults to active. */
export const flightRuntimeModes = ["disabled", "synthetic", "sandbox", "production"] as const;
export type FlightRuntimeMode = (typeof flightRuntimeModes)[number];

export const flightRuntimeEnvironments = ["local", "test", "preview", "production"] as const;
export type FlightRuntimeEnvironment = (typeof flightRuntimeEnvironments)[number];

export const flightRuntimeOperations = [
  "search",
  "reprice",
  "create_order",
  "change_order",
  "cancel_order",
  "authorize_payment",
  "capture_payment",
  "refund_payment",
  "void_payment",
  "issue_ticket",
  "void_ticket",
  "exchange_ticket",
  "process_webhook",
  "reconcile_order",
  "reconcile_payment",
  "reconcile_tickets",
] as const;
export type FlightRuntimeOperation = (typeof flightRuntimeOperations)[number];

export const flightRuntimeProviders = ["synthetic", "provider_sandbox", "provider_production"] as const;
export type FlightRuntimeProvider = (typeof flightRuntimeProviders)[number];
export type FlightRuntimeEnv = Readonly<Record<string, string | undefined>>;

export type FlightRuntimeProviderBinding = {
  providerId: string;
  adapterVersion: string;
  adapterSourceDigest: string;
  accountScopeReceiptDigest: string;
  pointOfSaleScopeReceiptDigest: string;
  contentScopeReceiptDigest: string;
};

export type FlightRuntimePaymentBinding = {
  processorId: string;
  adapterVersion: string;
  adapterSourceDigest: string;
  accountScopeReceiptDigest: string;
  environmentScopeReceiptDigest: string;
};

/**
 * Immutable authority for provider-funded order settlement (for example, a
 * provider balance). This is deliberately distinct from customer-card payment
 * processor authority.
 */
export type FlightRuntimeSettlementBinding = Readonly<{
  providerId: string;
  method: "provider_balance";
  accountScopeReceiptDigest: string;
  environmentScopeReceiptDigest: string;
  currency: string;
}>;

export const FLIGHT_PRODUCTION_ACTION_AUTHORIZATION_VERSION = "flight-production-action-authorization-v2" as const;

export type FlightProductionActionAuthorization = {
  version: typeof FLIGHT_PRODUCTION_ACTION_AUTHORIZATION_VERSION;
  authorizationId: string;
  operation: FlightRuntimeOperation;
  provider: "provider_production";
  scopeId: string;
  requestDigest: string;
  idempotencyRequestDigest: string | null;
  providerBindingDigest: string;
  paymentBindingDigest: string | null;
  settlementBindingDigest: string | null;
  nonce: string;
  issuedAtSeconds: number;
  expiresAtSeconds: number;
  signatureHex: string;
};

export type FlightProductionAuthorizationVerifier = {
  /** Must use a trusted server clock, never a timestamp supplied in the authorization or request payload. */
  readTrustedTimeSeconds(): number;
  /** Must authenticate the exact bytes with issuer-held key material that is never returned to this module or its callers. */
  verifyHmacSha256(input: { signingPayload: Uint8Array; signatureHex: string }): boolean;
  /** Must atomically consume an unseen nonce. A concurrent or repeated consume of the same nonce must return replayed. */
  consumeNonce(input: {
    authorizationId: string;
    nonce: string;
    operation: FlightRuntimeOperation;
    scopeId: string;
    expiresAtSeconds: number;
    requestDigest: string;
    idempotencyRequestDigest: string | null;
    providerBindingDigest: string;
    paymentBindingDigest: string | null;
    settlementBindingDigest: string | null;
  }): Promise<"consumed" | "replayed" | "unavailable">;
};

export type FlightRuntimeActionContext = {
  executionBinding?: FlightRuntimeProviderBinding | null;
  paymentExecutionBinding?: FlightRuntimePaymentBinding | null;
  settlementExecutionBinding?: FlightRuntimeSettlementBinding | null;
  productionAuthorization?: FlightProductionActionAuthorization | null;
  productionAuthorizationVerifier?: FlightProductionAuthorizationVerifier | null;
  scopeId?: string | null;
  requestDigest?: string | null;
  idempotencyRequestDigest?: string | null;
};

export type FlightRuntimePolicy = {
  mode: FlightRuntimeMode;
  environment: FlightRuntimeEnvironment | "unbound";
  runtimeEnabled: boolean;
  syntheticAdapterEnabled: boolean;
  providerTrafficEnabled: boolean;
  bookingEnabled: boolean;
  paymentEnabled: boolean;
  settlementEnabled: boolean;
  ticketingEnabled: boolean;
  servicingEnabled: boolean;
  webhookEnabled: boolean;
  productionTrafficEnabled: boolean;
  transactionKillSwitchEngaged: boolean;
  expectedProductionAuthorizationId: string | null;
  providerBinding: FlightRuntimeProviderBinding | null;
  paymentBinding: FlightRuntimePaymentBinding | null;
  settlementBinding: FlightRuntimeSettlementBinding | null;
  invalidSettings: readonly string[];
};

const stableAuthorizationIdPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{15,127}$/;
const sha256Pattern = /^[0-9a-f]{64}$/;
const productionAuthorizationNoncePattern = /^[0-9a-f]{32,128}$/;
const stableTokenPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/;
const adapterVersionPattern = /^[0-9]+\.[0-9]+\.[0-9]+(?:-[0-9A-Za-z.-]+)?$/;

const providerBindingEnvironmentNames = [
  "FLIGHT_PROVIDER_ID",
  "FLIGHT_PROVIDER_ADAPTER_VERSION",
  "FLIGHT_PROVIDER_ADAPTER_SOURCE_SHA256",
  "FLIGHT_PROVIDER_ACCOUNT_SCOPE_SHA256",
  "FLIGHT_PROVIDER_POS_SCOPE_SHA256",
  "FLIGHT_PROVIDER_CONTENT_SCOPE_SHA256",
] as const;

const paymentBindingEnvironmentNames = [
  "FLIGHT_PAYMENT_PROCESSOR_ID",
  "FLIGHT_PAYMENT_ADAPTER_VERSION",
  "FLIGHT_PAYMENT_ADAPTER_SOURCE_SHA256",
  "FLIGHT_PAYMENT_ACCOUNT_SCOPE_SHA256",
  "FLIGHT_PAYMENT_ENVIRONMENT_SCOPE_SHA256",
] as const;

const settlementBindingEnvironmentNames = [
  "FLIGHT_SETTLEMENT_PROVIDER_ID",
  "FLIGHT_SETTLEMENT_METHOD",
  "FLIGHT_SETTLEMENT_ACCOUNT_SCOPE_SHA256",
  "FLIGHT_SETTLEMENT_ENVIRONMENT_SCOPE_SHA256",
  "FLIGHT_SETTLEMENT_CURRENCY",
] as const;

type FlightBooleanFlagName =
  | "FLIGHT_RUNTIME_ENABLED"
  | "FLIGHT_SYNTHETIC_ADAPTER_ENABLED"
  | "FLIGHT_PROVIDER_TRAFFIC_ENABLED"
  | "FLIGHT_BOOKING_ENABLED"
  | "FLIGHT_PAYMENT_ENABLED"
  | "FLIGHT_SETTLEMENT_ENABLED"
  | "FLIGHT_TICKETING_ENABLED"
  | "FLIGHT_SERVICING_ENABLED"
  | "FLIGHT_WEBHOOKS_ENABLED"
  | "FLIGHT_PRODUCTION_TRAFFIC_ENABLED";

function parseStrictFlag(env: FlightRuntimeEnv, name: FlightBooleanFlagName, invalidSettings: string[]) {
  const value = env[name];
  if (value === undefined || value === "false") return false;
  if (value === "true") return true;
  invalidSettings.push(`${name} must be exactly true or false.`);
  return false;
}

function parseProviderBinding(env: FlightRuntimeEnv, invalidSettings: string[]): FlightRuntimeProviderBinding | null {
  const values = providerBindingEnvironmentNames.map((name) => env[name]);
  if (values.every((value) => value === undefined)) return null;
  if (values.some((value) => value === undefined)) {
    invalidSettings.push("Exact flight provider execution binding is incomplete.");
    return null;
  }

  const [providerId, adapterVersion, adapterSourceDigest, accountScopeReceiptDigest, pointOfSaleScopeReceiptDigest, contentScopeReceiptDigest] = values as [string, string, string, string, string, string];
  let valid = true;
  if (!stableTokenPattern.test(providerId)) {
    invalidSettings.push("FLIGHT_PROVIDER_ID is malformed.");
    valid = false;
  }
  if (!adapterVersionPattern.test(adapterVersion) || adapterVersion.length > 64) {
    invalidSettings.push("FLIGHT_PROVIDER_ADAPTER_VERSION is malformed.");
    valid = false;
  }
  for (const [name, value] of [
    ["FLIGHT_PROVIDER_ADAPTER_SOURCE_SHA256", adapterSourceDigest],
    ["FLIGHT_PROVIDER_ACCOUNT_SCOPE_SHA256", accountScopeReceiptDigest],
    ["FLIGHT_PROVIDER_POS_SCOPE_SHA256", pointOfSaleScopeReceiptDigest],
    ["FLIGHT_PROVIDER_CONTENT_SCOPE_SHA256", contentScopeReceiptDigest],
  ] as const) {
    if (!sha256Pattern.test(value)) {
      invalidSettings.push(`${name} is malformed.`);
      valid = false;
    }
  }
  if (!valid) return null;
  return {
    providerId,
    adapterVersion,
    adapterSourceDigest,
    accountScopeReceiptDigest,
    pointOfSaleScopeReceiptDigest,
    contentScopeReceiptDigest,
  };
}

function parsePaymentBinding(env: FlightRuntimeEnv, invalidSettings: string[]): FlightRuntimePaymentBinding | null {
  const values = paymentBindingEnvironmentNames.map((name) => env[name]);
  if (values.every((value) => value === undefined)) return null;
  if (values.some((value) => value === undefined)) {
    invalidSettings.push("Exact flight payment execution binding is incomplete.");
    return null;
  }
  const [processorId, adapterVersion, adapterSourceDigest, accountScopeReceiptDigest, environmentScopeReceiptDigest] = values as [string, string, string, string, string];
  let valid = true;
  if (!stableTokenPattern.test(processorId)) {
    invalidSettings.push("FLIGHT_PAYMENT_PROCESSOR_ID is malformed.");
    valid = false;
  }
  if (!adapterVersionPattern.test(adapterVersion) || adapterVersion.length > 64) {
    invalidSettings.push("FLIGHT_PAYMENT_ADAPTER_VERSION is malformed.");
    valid = false;
  }
  for (const [name, value] of [
    ["FLIGHT_PAYMENT_ADAPTER_SOURCE_SHA256", adapterSourceDigest],
    ["FLIGHT_PAYMENT_ACCOUNT_SCOPE_SHA256", accountScopeReceiptDigest],
    ["FLIGHT_PAYMENT_ENVIRONMENT_SCOPE_SHA256", environmentScopeReceiptDigest],
  ] as const) {
    if (!sha256Pattern.test(value)) {
      invalidSettings.push(`${name} is malformed.`);
      valid = false;
    }
  }
  if (!valid) return null;
  return { processorId, adapterVersion, adapterSourceDigest, accountScopeReceiptDigest, environmentScopeReceiptDigest };
}

function parseSettlementBinding(env: FlightRuntimeEnv, invalidSettings: string[]): FlightRuntimeSettlementBinding | null {
  const values = settlementBindingEnvironmentNames.map((name) => env[name]);
  if (values.every((value) => value === undefined)) return null;
  if (values.some((value) => value === undefined)) {
    invalidSettings.push("Exact flight settlement execution binding is incomplete.");
    return null;
  }
  const [providerId, method, accountScopeReceiptDigest, environmentScopeReceiptDigest, currency] = values as [string, string, string, string, string];
  let valid = true;
  if (!stableTokenPattern.test(providerId)) {
    invalidSettings.push("FLIGHT_SETTLEMENT_PROVIDER_ID is malformed.");
    valid = false;
  }
  if (method !== "provider_balance") {
    invalidSettings.push("FLIGHT_SETTLEMENT_METHOD must be exactly provider_balance.");
    valid = false;
  }
  for (const [name, value] of [
    ["FLIGHT_SETTLEMENT_ACCOUNT_SCOPE_SHA256", accountScopeReceiptDigest],
    ["FLIGHT_SETTLEMENT_ENVIRONMENT_SCOPE_SHA256", environmentScopeReceiptDigest],
  ] as const) {
    if (!sha256Pattern.test(value)) {
      invalidSettings.push(`${name} is malformed.`);
      valid = false;
    }
  }
  if (!/^[A-Z]{3}$/.test(currency)) {
    invalidSettings.push("FLIGHT_SETTLEMENT_CURRENCY is malformed.");
    valid = false;
  }
  if (!valid) return null;
  return Object.freeze({ providerId, method: "provider_balance", accountScopeReceiptDigest, environmentScopeReceiptDigest, currency });
}

export function digestFlightRuntimeProviderBinding(binding: FlightRuntimeProviderBinding) {
  return sha256FlightEvidence({ version: "flight-provider-binding-v1", ...binding });
}

export function digestFlightRuntimePaymentBinding(binding: FlightRuntimePaymentBinding) {
  return sha256FlightEvidence({ version: "flight-payment-binding-v1", ...binding });
}

export function digestFlightRuntimeSettlementBinding(binding: FlightRuntimeSettlementBinding) {
  return sha256FlightEvidence({ version: "flight-settlement-binding-v1", ...binding });
}

export function resolveFlightRuntimePolicy(env: FlightRuntimeEnv = {}): FlightRuntimePolicy {
  const invalidSettings: string[] = [];
  const rawMode = env.FLIGHT_RUNTIME_MODE;
  const mode = rawMode && flightRuntimeModes.includes(rawMode as FlightRuntimeMode)
    ? rawMode as FlightRuntimeMode
    : "disabled";
  if (rawMode !== undefined && !flightRuntimeModes.includes(rawMode as FlightRuntimeMode)) {
    invalidSettings.push("FLIGHT_RUNTIME_MODE is not recognized.");
  }

  const rawEnvironment = env.FLIGHT_RUNTIME_ENVIRONMENT;
  const environment = rawEnvironment && flightRuntimeEnvironments.includes(rawEnvironment as FlightRuntimeEnvironment)
    ? rawEnvironment as FlightRuntimeEnvironment
    : "unbound";
  if (rawEnvironment !== undefined && !flightRuntimeEnvironments.includes(rawEnvironment as FlightRuntimeEnvironment)) {
    invalidSettings.push("FLIGHT_RUNTIME_ENVIRONMENT is not recognized.");
  }

  const killSwitch = env.FLIGHT_TRANSACTION_KILL_SWITCH;
  let transactionKillSwitchEngaged = true;
  if (killSwitch === "disengaged") transactionKillSwitchEngaged = false;
  else if (killSwitch !== undefined && killSwitch !== "engaged") {
    invalidSettings.push("FLIGHT_TRANSACTION_KILL_SWITCH must be exactly engaged or disengaged.");
  }

  const rawExpectedProductionAuthorizationId = env.FLIGHT_PRODUCTION_AUTHORIZATION_ID ?? null;
  const expectedProductionAuthorizationId = rawExpectedProductionAuthorizationId !== null
    && stableAuthorizationIdPattern.test(rawExpectedProductionAuthorizationId)
    ? rawExpectedProductionAuthorizationId
    : null;
  if (rawExpectedProductionAuthorizationId !== null && expectedProductionAuthorizationId === null) {
    invalidSettings.push("FLIGHT_PRODUCTION_AUTHORIZATION_ID is malformed.");
  }

  const providerBinding = parseProviderBinding(env, invalidSettings);
  const paymentBinding = parsePaymentBinding(env, invalidSettings);
  let settlementBinding = parseSettlementBinding(env, invalidSettings);
  if (
    providerBinding !== null
    && settlementBinding !== null
    && settlementBinding.providerId !== providerBinding.providerId
  ) {
    invalidSettings.push("Flight settlement binding provider does not match the exact provider execution binding.");
    settlementBinding = null;
  }

  return {
    mode,
    environment,
    runtimeEnabled: parseStrictFlag(env, "FLIGHT_RUNTIME_ENABLED", invalidSettings),
    syntheticAdapterEnabled: parseStrictFlag(env, "FLIGHT_SYNTHETIC_ADAPTER_ENABLED", invalidSettings),
    providerTrafficEnabled: parseStrictFlag(env, "FLIGHT_PROVIDER_TRAFFIC_ENABLED", invalidSettings),
    bookingEnabled: parseStrictFlag(env, "FLIGHT_BOOKING_ENABLED", invalidSettings),
    paymentEnabled: parseStrictFlag(env, "FLIGHT_PAYMENT_ENABLED", invalidSettings),
    settlementEnabled: parseStrictFlag(env, "FLIGHT_SETTLEMENT_ENABLED", invalidSettings),
    ticketingEnabled: parseStrictFlag(env, "FLIGHT_TICKETING_ENABLED", invalidSettings),
    servicingEnabled: parseStrictFlag(env, "FLIGHT_SERVICING_ENABLED", invalidSettings),
    webhookEnabled: parseStrictFlag(env, "FLIGHT_WEBHOOKS_ENABLED", invalidSettings),
    productionTrafficEnabled: parseStrictFlag(env, "FLIGHT_PRODUCTION_TRAFFIC_ENABLED", invalidSettings),
    transactionKillSwitchEngaged,
    expectedProductionAuthorizationId,
    providerBinding,
    paymentBinding,
    settlementBinding,
    invalidSettings,
  };
}

const bookingOperations: readonly FlightRuntimeOperation[] = ["create_order", "change_order", "cancel_order", "reconcile_order"];
const paymentOperations: readonly FlightRuntimeOperation[] = ["authorize_payment", "capture_payment", "refund_payment", "void_payment"];
const paymentBindingOperations: readonly FlightRuntimeOperation[] = [...paymentOperations, "reconcile_payment"];
const settlementBindingOperations: readonly FlightRuntimeOperation[] = ["create_order"];
const ticketingOperations: readonly FlightRuntimeOperation[] = [
  "issue_ticket",
  "void_ticket",
  "exchange_ticket",
  "reconcile_order",
  "reconcile_tickets",
];
const mutationOperations: readonly FlightRuntimeOperation[] = [...bookingOperations, ...paymentOperations, ...ticketingOperations];
const transactionKillSwitchOperations: readonly FlightRuntimeOperation[] = [
  ...mutationOperations,
  "process_webhook",
  "reconcile_order",
  "reconcile_payment",
  "reconcile_tickets",
];
const servicingOperations: readonly FlightRuntimeOperation[] = [
  "change_order",
  "cancel_order",
  "refund_payment",
  "void_payment",
  "void_ticket",
  "exchange_ticket",
  "reconcile_order",
  "reconcile_payment",
  "reconcile_tickets",
];

const settlementBindingKeys = [
  "accountScopeReceiptDigest",
  "currency",
  "environmentScopeReceiptDigest",
  "method",
  "providerId",
] as const;

function snapshotFlightRuntimeSettlementBinding(value: unknown): FlightRuntimeSettlementBinding | null {
  try {
    if (value === null || typeof value !== "object" || Array.isArray(value)) return null;
    const prototype = Object.getPrototypeOf(value) as object | null;
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const keys = Object.keys(value).sort();
    if (
      (prototype !== Object.prototype && prototype !== null)
      || Object.getOwnPropertySymbols(value).length > 0
      || Object.values(descriptors).some((descriptor) => !descriptor.enumerable || !("value" in descriptor))
      || keys.length !== settlementBindingKeys.length
      || settlementBindingKeys.some((key, index) => keys[index] !== key)
    ) return null;
    const binding = value as FlightRuntimeSettlementBinding;
    if (
      !stableTokenPattern.test(binding.providerId)
      || binding.method !== "provider_balance"
      || !sha256Pattern.test(binding.accountScopeReceiptDigest)
      || !sha256Pattern.test(binding.environmentScopeReceiptDigest)
      || !/^[A-Z]{3}$/.test(binding.currency)
    ) return null;
    return Object.freeze({ ...binding });
  } catch {
    return null;
  }
}

const runtimeActionContextKeys = new Set([
  "executionBinding",
  "paymentExecutionBinding",
  "settlementExecutionBinding",
  "productionAuthorization",
  "productionAuthorizationVerifier",
  "scopeId",
  "requestDigest",
  "idempotencyRequestDigest",
]);

export function snapshotFlightRuntimeActionContext(context: FlightRuntimeActionContext): FlightRuntimeActionContext | null {
  try {
    if (context === null || typeof context !== "object" || Array.isArray(context)) return null;
    const prototype = Object.getPrototypeOf(context) as object | null;
    if (prototype !== Object.prototype && prototype !== null) return null;
    if (Object.getOwnPropertySymbols(context).length > 0) return null;
    const descriptors = Object.getOwnPropertyDescriptors(context);
    if (!Object.entries(descriptors).every(([key, descriptor]) => (
      runtimeActionContextKeys.has(key)
      && descriptor.enumerable
      && "value" in descriptor
    ))) return null;
    const entries: [string, unknown][] = [];
    for (const [key, descriptor] of Object.entries(descriptors)) {
      let entryValue = descriptor.value;
      if (key === "settlementExecutionBinding" && entryValue !== null && entryValue !== undefined) {
        entryValue = snapshotFlightRuntimeSettlementBinding(entryValue);
        if (entryValue === null) return null;
      }
      entries.push([key, entryValue]);
    }
    return Object.freeze(Object.fromEntries(entries)) as FlightRuntimeActionContext;
  } catch {
    return null;
  }
}

export type FlightRuntimeAuthorizationDecision = {
  authorized: boolean;
  operation: FlightRuntimeOperation;
  provider: FlightRuntimeProvider;
  reasons: readonly string[];
};

export async function evaluateFlightRuntimeAuthorization(
  policy: FlightRuntimePolicy,
  operation: FlightRuntimeOperation,
  provider: FlightRuntimeProvider,
  context: FlightRuntimeActionContext = {},
): Promise<FlightRuntimeAuthorizationDecision> {
  if (!flightRuntimeOperations.includes(operation)) {
    return { authorized: false, operation, provider, reasons: ["Flight runtime operation is not recognized."] };
  }
  if (!flightRuntimeProviders.includes(provider)) {
    return { authorized: false, operation, provider, reasons: ["Flight runtime provider is not recognized."] };
  }
  const actionContext = snapshotFlightRuntimeActionContext(context);
  if (actionContext === null) {
    return { authorized: false, operation, provider, reasons: ["Flight action context is malformed."] };
  }
  context = actionContext;
  const reasons = [...policy.invalidSettings];
  const executionBinding = context.executionBinding ?? null;
  const paymentExecutionBinding = context.paymentExecutionBinding ?? null;
  const settlementExecutionBinding = context.settlementExecutionBinding ?? null;
  let nonceConsumption: {
    verifier: FlightProductionAuthorizationVerifier;
    authorization: FlightProductionActionAuthorization;
  } | null = null;
  if (!policy.runtimeEnabled) reasons.push("Flight runtime is disabled.");
  if (policy.environment === "unbound") reasons.push("Flight runtime environment is not bound.");

  if (provider === "synthetic") {
    if (policy.mode !== "synthetic") reasons.push("Synthetic operations require synthetic runtime mode.");
    if (!policy.syntheticAdapterEnabled) reasons.push("Synthetic adapter is disabled.");
    if (policy.environment === "production") reasons.push("Synthetic fixtures cannot run in Production.");
  } else {
    if (!policy.providerTrafficEnabled) reasons.push("Provider traffic is disabled.");
    if (policy.providerBinding === null) reasons.push("Exact provider execution binding is not configured.");
    if (executionBinding === null) reasons.push("Action-time provider execution binding is missing.");
    if (
      policy.providerBinding !== null
      && executionBinding !== null
      && canonicalFlightJson(policy.providerBinding) !== canonicalFlightJson(executionBinding)
    ) {
      reasons.push("Action-time provider execution binding does not match configured provider scope evidence.");
    }
    if (paymentBindingOperations.includes(operation)) {
      if (policy.paymentBinding === null) reasons.push("Exact payment execution binding is not configured.");
      if (paymentExecutionBinding === null) reasons.push("Action-time payment execution binding is missing.");
      if (
        policy.paymentBinding !== null
        && paymentExecutionBinding !== null
        && canonicalFlightJson(policy.paymentBinding) !== canonicalFlightJson(paymentExecutionBinding)
      ) {
        reasons.push("Action-time payment execution binding does not match configured payment scope evidence.");
      }
    } else if (paymentExecutionBinding !== null) {
      reasons.push("Payment execution binding is not valid for this non-payment operation.");
    }
    if (settlementBindingOperations.includes(operation)) {
      if (policy.settlementBinding === null) reasons.push("Exact settlement execution binding is not configured.");
      if (settlementExecutionBinding === null) reasons.push("Action-time settlement execution binding is missing.");
      if (
        policy.settlementBinding !== null
        && settlementExecutionBinding !== null
        && canonicalFlightJson(policy.settlementBinding) !== canonicalFlightJson(settlementExecutionBinding)
      ) {
        reasons.push("Action-time settlement execution binding does not match configured settlement scope evidence.");
      }
    } else if (settlementExecutionBinding !== null) {
      reasons.push("Settlement execution binding is not valid for this non-settlement operation.");
    }
    if (provider === "provider_sandbox" && policy.mode !== "sandbox") reasons.push("Sandbox provider operations require sandbox runtime mode.");
    if (provider === "provider_sandbox" && policy.environment === "production") reasons.push("Sandbox provider traffic cannot run in Production.");
    if (provider === "provider_production") {
      if (policy.mode !== "production") reasons.push("Production provider operations require production runtime mode.");
      if (policy.environment !== "production") reasons.push("Production provider operations require the Production environment binding.");
      if (!policy.productionTrafficEnabled) reasons.push("Production provider traffic is disabled.");
      if (policy.expectedProductionAuthorizationId === null) {
        reasons.push("Expected Production authorization binding is not configured.");
      }
      const actionAuthorization = context.productionAuthorization ?? null;
      if (actionAuthorization === null) {
        reasons.push("Per-call Production action authorization is missing.");
      } else {
        const authorizationError = validateFlightProductionActionAuthorization(actionAuthorization);
        if (authorizationError !== null) {
          reasons.push(authorizationError);
        } else {
          if (actionAuthorization.authorizationId !== policy.expectedProductionAuthorizationId) {
            reasons.push("Per-call Production authorization ID does not match the expected binding.");
          }
          if (actionAuthorization.operation !== operation || actionAuthorization.provider !== provider) {
            reasons.push("Per-call Production authorization is bound to another operation or provider.");
          }
          const scopeId = context.scopeId ?? null;
          if (scopeId === null || !stableTokenPattern.test(scopeId)) {
            reasons.push("A valid action-time Production scope ID is required.");
          } else if (actionAuthorization.scopeId !== scopeId) {
            reasons.push("Per-call Production authorization is bound to another execution scope.");
          }
          const requestDigest = context.requestDigest ?? null;
          if (requestDigest === null || !sha256Pattern.test(requestDigest)) {
            reasons.push("A valid exact Production request digest is required.");
          } else if (actionAuthorization.requestDigest !== requestDigest) {
            reasons.push("Per-call Production authorization is bound to another canonical request.");
          }
          const requiresIdempotency = flightIdempotentOperations.includes(operation as FlightIdempotentOperation);
          const idempotencyRequestDigest = context.idempotencyRequestDigest ?? null;
          if (requiresIdempotency) {
            if (idempotencyRequestDigest === null || !sha256Pattern.test(idempotencyRequestDigest)) {
              reasons.push("A valid exact Production idempotency request digest is required.");
            } else if (actionAuthorization.idempotencyRequestDigest !== idempotencyRequestDigest) {
              reasons.push("Per-call Production authorization is bound to another idempotency request.");
            }
          } else if (idempotencyRequestDigest !== null || actionAuthorization.idempotencyRequestDigest !== null) {
            reasons.push("Idempotency request evidence is not valid for this Production operation.");
          }
          if (
            policy.providerBinding !== null
            && actionAuthorization.providerBindingDigest !== digestFlightRuntimeProviderBinding(policy.providerBinding)
          ) {
            reasons.push("Per-call Production authorization is bound to another provider execution binding.");
          }
          if (paymentBindingOperations.includes(operation)) {
            if (
              policy.paymentBinding !== null
              && actionAuthorization.paymentBindingDigest !== digestFlightRuntimePaymentBinding(policy.paymentBinding)
            ) {
              reasons.push("Per-call Production authorization is bound to another payment execution binding.");
            }
          } else if (actionAuthorization.paymentBindingDigest !== null) {
            reasons.push("Per-call Production authorization contains payment authority for a non-payment operation.");
          }
          if (settlementBindingOperations.includes(operation)) {
            if (
              policy.settlementBinding !== null
              && actionAuthorization.settlementBindingDigest !== digestFlightRuntimeSettlementBinding(policy.settlementBinding)
            ) {
              reasons.push("Per-call Production authorization is bound to another settlement execution binding.");
            }
          } else if (actionAuthorization.settlementBindingDigest !== null) {
            reasons.push("Per-call Production authorization contains settlement authority for a non-settlement operation.");
          }
          const verifier = context.productionAuthorizationVerifier ?? null;
          if (verifier === null) {
            reasons.push("Trusted Production authorization verification is unavailable.");
          } else {
            let signatureVerified = false;
            try {
              signatureVerified = verifier.verifyHmacSha256({
                signingPayload: productionActionAuthorizationSigningPayload(actionAuthorization),
                signatureHex: actionAuthorization.signatureHex,
              }) === true;
            } catch {
              signatureVerified = false;
            }
            if (!signatureVerified) {
              reasons.push("Per-call Production authorization signature is invalid.");
            } else {
              let trustedNowSeconds: number | null = null;
              try {
                trustedNowSeconds = verifier.readTrustedTimeSeconds();
              } catch {
                trustedNowSeconds = null;
              }
              if (!Number.isSafeInteger(trustedNowSeconds) || (trustedNowSeconds as number) < 0) {
                reasons.push("Trusted Production authorization time is unavailable.");
              } else if (
                (trustedNowSeconds as number) < actionAuthorization.issuedAtSeconds
                || (trustedNowSeconds as number) >= actionAuthorization.expiresAtSeconds
              ) {
                reasons.push("Per-call Production authorization is not currently valid.");
              } else {
                nonceConsumption = { verifier, authorization: actionAuthorization };
              }
            }
          }
        }
      }
    }
  }

  if (transactionKillSwitchOperations.includes(operation) && policy.transactionKillSwitchEngaged) reasons.push("Flight transaction kill switch is engaged.");
  if (bookingOperations.includes(operation) && !policy.bookingEnabled) reasons.push("Flight booking operations are disabled.");
  if (paymentBindingOperations.includes(operation) && !policy.paymentEnabled) reasons.push("Flight payment operations are disabled.");
  if (provider !== "synthetic" && settlementBindingOperations.includes(operation) && !policy.settlementEnabled) {
    reasons.push("Flight settlement operations are disabled.");
  }
  if (ticketingOperations.includes(operation) && !policy.ticketingEnabled) reasons.push("Flight ticketing operations are disabled.");
  if (servicingOperations.includes(operation) && !policy.servicingEnabled) {
    reasons.push("Flight servicing operations are disabled.");
  }
  if (operation === "process_webhook" && !policy.webhookEnabled) reasons.push("Flight webhook processing is disabled.");

  if (provider === "provider_production" && reasons.length === 0 && nonceConsumption !== null) {
    let nonceResult: "consumed" | "replayed" | "unavailable" = "unavailable";
    try {
      nonceResult = await nonceConsumption.verifier.consumeNonce({
        authorizationId: nonceConsumption.authorization.authorizationId,
        nonce: nonceConsumption.authorization.nonce,
        operation: nonceConsumption.authorization.operation,
        scopeId: nonceConsumption.authorization.scopeId,
        expiresAtSeconds: nonceConsumption.authorization.expiresAtSeconds,
        requestDigest: nonceConsumption.authorization.requestDigest,
        idempotencyRequestDigest: nonceConsumption.authorization.idempotencyRequestDigest,
        providerBindingDigest: nonceConsumption.authorization.providerBindingDigest,
        paymentBindingDigest: nonceConsumption.authorization.paymentBindingDigest,
        settlementBindingDigest: nonceConsumption.authorization.settlementBindingDigest,
      });
    } catch {
      nonceResult = "unavailable";
    }
    if (nonceResult === "replayed") reasons.push("Per-call Production authorization nonce has already been consumed.");
    else if (nonceResult !== "consumed") reasons.push("Production authorization nonce consumption is unavailable.");
  }

  return { authorized: reasons.length === 0, operation, provider, reasons };
}

export class FlightRuntimeAuthorizationError extends Error {
  readonly decision: FlightRuntimeAuthorizationDecision;

  constructor(decision: FlightRuntimeAuthorizationDecision) {
    super(`Flight ${decision.operation} is not authorized: ${decision.reasons.join(" ")}`);
    this.name = "FlightRuntimeAuthorizationError";
    this.decision = decision;
  }
}

export async function assertFlightRuntimeAuthorized(
  policy: FlightRuntimePolicy,
  operation: FlightRuntimeOperation,
  provider: FlightRuntimeProvider,
  context: FlightRuntimeActionContext = {},
) {
  const decision = await evaluateFlightRuntimeAuthorization(policy, operation, provider, context);
  if (!decision.authorized) throw new FlightRuntimeAuthorizationError(decision);
  return decision;
}

export type FlightCanonicalJsonValue = null | boolean | number | string | readonly FlightCanonicalJsonValue[] | {
  readonly [key: string]: FlightCanonicalJsonValue;
};

function canonicalize(value: unknown, ancestors: ReadonlySet<object>): string {
  if (value === null || typeof value === "boolean" || typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value)) throw new TypeError("Canonical flight evidence accepts safe integers only.");
    return JSON.stringify(Object.is(value, -0) ? 0 : value);
  }
  if (Array.isArray(value)) {
    if (ancestors.has(value)) throw new TypeError("Canonical flight evidence cannot be cyclic.");
    const descriptors = Object.getOwnPropertyDescriptors(value);
    for (let index = 0; index < value.length; index += 1) {
      const descriptor = descriptors[String(index)];
      if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) {
        throw new TypeError("Canonical flight evidence arrays cannot be sparse and require dense enumerable data elements.");
      }
    }
    if (
      Object.getOwnPropertySymbols(value).length > 0
      || Object.keys(descriptors).some((key) => key !== "length" && !/^\d+$/.test(key))
      || Object.keys(value).length !== value.length
      || Object.keys(value).some((key) => !/^\d+$/.test(key))
    ) {
      throw new TypeError("Canonical flight evidence arrays cannot contain named or symbol properties.");
    }
    const nextAncestors = new Set(ancestors).add(value);
    return `[${value.map((item) => canonicalize(item, nextAncestors)).join(",")}]`;
  }
  if (typeof value === "object") {
    const object = value as Record<string, unknown>;
    const prototype = Object.getPrototypeOf(object) as object | null;
    if (prototype !== Object.prototype && prototype !== null) throw new TypeError("Canonical flight evidence requires plain objects.");
    if (ancestors.has(object)) throw new TypeError("Canonical flight evidence cannot be cyclic.");
    if (Object.getOwnPropertySymbols(object).length > 0) throw new TypeError("Canonical flight evidence cannot contain symbol properties.");
    const descriptors = Object.getOwnPropertyDescriptors(object);
    if (Object.values(descriptors).some((descriptor) => !descriptor.enumerable || "get" in descriptor || "set" in descriptor)) {
      throw new TypeError("Canonical flight evidence requires enumerable data properties.");
    }
    const nextAncestors = new Set(ancestors).add(object);
    return `{${Object.keys(object).sort().map((key) => {
      const item = object[key];
      if (item === undefined) throw new TypeError("Canonical flight evidence cannot contain undefined.");
      return `${JSON.stringify(key)}:${canonicalize(item, nextAncestors)}`;
    }).join(",")}}`;
  }
  throw new TypeError("Canonical flight evidence contains an unsupported value.");
}

export function canonicalFlightJson(value: FlightCanonicalJsonValue) {
  return canonicalize(value, new Set());
}

export function sha256FlightEvidence(value: FlightCanonicalJsonValue) {
  return createHash("sha256").update(canonicalFlightJson(value), "utf8").digest("hex");
}

const productionActionAuthorizationKeys = [
  "authorizationId",
  "expiresAtSeconds",
  "idempotencyRequestDigest",
  "issuedAtSeconds",
  "nonce",
  "operation",
  "paymentBindingDigest",
  "provider",
  "providerBindingDigest",
  "requestDigest",
  "scopeId",
  "settlementBindingDigest",
  "signatureHex",
  "version",
] as const;
const maximumProductionActionAuthorizationLifetimeSeconds = 300;

function productionActionAuthorizationEvidence(input: Omit<FlightProductionActionAuthorization, "signatureHex">): FlightCanonicalJsonValue {
  return {
    version: input.version,
    authorizationId: input.authorizationId,
    operation: input.operation,
    provider: input.provider,
    scopeId: input.scopeId,
    requestDigest: input.requestDigest,
    idempotencyRequestDigest: input.idempotencyRequestDigest,
    providerBindingDigest: input.providerBindingDigest,
    paymentBindingDigest: input.paymentBindingDigest,
    settlementBindingDigest: input.settlementBindingDigest,
    nonce: input.nonce,
    issuedAtSeconds: input.issuedAtSeconds,
    expiresAtSeconds: input.expiresAtSeconds,
  };
}

function productionActionAuthorizationSigningPayload(authorization: FlightProductionActionAuthorization) {
  return Buffer.from(canonicalFlightJson(productionActionAuthorizationEvidence(authorization)), "utf8");
}

function validateFlightProductionActionAuthorization(authorization: FlightProductionActionAuthorization): string | null {
  if (authorization === null || typeof authorization !== "object" || Array.isArray(authorization)) {
    return "Per-call Production authorization evidence is malformed.";
  }
  const prototype = Object.getPrototypeOf(authorization) as object | null;
  const keys = Object.keys(authorization).sort();
  const descriptors = Object.getOwnPropertyDescriptors(authorization);
  if (
    (prototype !== Object.prototype && prototype !== null)
    || Object.getOwnPropertySymbols(authorization).length > 0
    || Object.values(descriptors).some((descriptor) => !descriptor.enumerable || !("value" in descriptor))
    || keys.length !== productionActionAuthorizationKeys.length
    || productionActionAuthorizationKeys.some((key, index) => keys[index] !== key)
    || authorization.version !== FLIGHT_PRODUCTION_ACTION_AUTHORIZATION_VERSION
    || !stableAuthorizationIdPattern.test(authorization.authorizationId)
    || !flightRuntimeOperations.includes(authorization.operation)
    || authorization.provider !== "provider_production"
    || !stableTokenPattern.test(authorization.scopeId)
    || !sha256Pattern.test(authorization.requestDigest)
    || !sha256Pattern.test(authorization.providerBindingDigest)
    || (authorization.idempotencyRequestDigest !== null && !sha256Pattern.test(authorization.idempotencyRequestDigest))
    || (authorization.paymentBindingDigest !== null && !sha256Pattern.test(authorization.paymentBindingDigest))
    || (authorization.settlementBindingDigest !== null && !sha256Pattern.test(authorization.settlementBindingDigest))
    || !productionAuthorizationNoncePattern.test(authorization.nonce)
    || !Number.isSafeInteger(authorization.issuedAtSeconds)
    || authorization.issuedAtSeconds < 0
    || !Number.isSafeInteger(authorization.expiresAtSeconds)
    || authorization.expiresAtSeconds <= authorization.issuedAtSeconds
    || authorization.expiresAtSeconds - authorization.issuedAtSeconds > maximumProductionActionAuthorizationLifetimeSeconds
    || !sha256Pattern.test(authorization.signatureHex)
  ) {
    return "Per-call Production authorization evidence is malformed.";
  }
  const requiresIdempotency = flightIdempotentOperations.includes(authorization.operation as FlightIdempotentOperation);
  if ((requiresIdempotency && authorization.idempotencyRequestDigest === null) || (!requiresIdempotency && authorization.idempotencyRequestDigest !== null)) {
    return "Per-call Production authorization evidence is malformed.";
  }
  const requiresPaymentBinding = paymentBindingOperations.includes(authorization.operation);
  if ((requiresPaymentBinding && authorization.paymentBindingDigest === null) || (!requiresPaymentBinding && authorization.paymentBindingDigest !== null)) {
    return "Per-call Production authorization evidence is malformed.";
  }
  const requiresSettlementBinding = settlementBindingOperations.includes(authorization.operation);
  if (
    (requiresSettlementBinding && authorization.settlementBindingDigest === null)
    || (!requiresSettlementBinding && authorization.settlementBindingDigest !== null)
  ) {
    return "Per-call Production authorization evidence is malformed.";
  }
  return null;
}

export const flightIdempotentOperations = [
  "create_order",
  "change_order",
  "cancel_order",
  "authorize_payment",
  "capture_payment",
  "refund_payment",
  "void_payment",
  "issue_ticket",
  "void_ticket",
  "exchange_ticket",
] as const;
export type FlightIdempotentOperation = (typeof flightIdempotentOperations)[number];

export type FlightIdempotencyIntent = {
  version: "flight-idempotency-v1";
  operation: FlightIdempotentOperation;
  scopeId: string;
  requestId: string;
  requestDigest: string;
  idempotencyKey: string;
};

export function buildFlightIdempotencyIntent(input: {
  operation: FlightIdempotentOperation;
  scopeId: string;
  requestId: string;
  payload: FlightCanonicalJsonValue;
}): FlightIdempotencyIntent {
  if (!flightIdempotentOperations.includes(input.operation)) throw new TypeError("Flight operation is not idempotency-enabled.");
  if (!stableTokenPattern.test(input.scopeId)) throw new TypeError("Idempotency scope ID must be a stable opaque token.");
  if (!stableTokenPattern.test(input.requestId)) throw new TypeError("Idempotency request ID must be a stable opaque token.");
  const canonicalPayload = canonicalFlightJson(input.payload);
  if (Buffer.byteLength(canonicalPayload, "utf8") > 65_536) throw new TypeError("Idempotency payload exceeds the 64 KiB canonical limit.");
  const requestDigest = sha256FlightEvidence({
    version: "flight-idempotency-v1",
    operation: input.operation,
    scopeId: input.scopeId,
    requestId: input.requestId,
    payload: input.payload,
  });
  return {
    version: "flight-idempotency-v1",
    operation: input.operation,
    scopeId: input.scopeId,
    requestId: input.requestId,
    requestDigest,
    idempotencyKey: `flt_v1_${requestDigest}`,
  };
}

export type FlightIdempotencyReceipt = {
  idempotencyKey: string;
  requestDigest: string;
  status: "in_progress" | "succeeded" | "failed" | "ambiguous";
  outcomeDigest: string | null;
};

export type FlightIdempotencyDecision = "proceed" | "in_progress" | "replay_succeeded" | "replay_failed" | "blocked_ambiguous" | "conflict";

export function evaluateFlightIdempotency(
  intent: FlightIdempotencyIntent,
  existing: FlightIdempotencyReceipt | null,
): { decision: FlightIdempotencyDecision; reason: string } {
  if (
    intent.version !== "flight-idempotency-v1"
    || !flightIdempotentOperations.includes(intent.operation)
    || !stableTokenPattern.test(intent.scopeId)
    || !stableTokenPattern.test(intent.requestId)
    || !sha256Pattern.test(intent.requestDigest)
    || intent.idempotencyKey !== `flt_v1_${intent.requestDigest}`
  ) {
    return { decision: "conflict", reason: "Idempotency intent evidence is malformed." };
  }
  if (existing === null) return { decision: "proceed", reason: "No prior receipt exists for this idempotency key." };
  if (
    !/^flt_v1_[0-9a-f]{64}$/.test(existing.idempotencyKey)
    || !sha256Pattern.test(existing.requestDigest)
    || !["in_progress", "succeeded", "failed", "ambiguous"].includes(existing.status)
    || (existing.outcomeDigest !== null && !sha256Pattern.test(existing.outcomeDigest))
  ) {
    return { decision: "conflict", reason: "Stored idempotency evidence is malformed." };
  }
  if (existing.idempotencyKey !== intent.idempotencyKey || existing.requestDigest !== intent.requestDigest) {
    return { decision: "conflict", reason: "Idempotency key is bound to different canonical request evidence." };
  }
  if (existing.status === "in_progress") {
    if (existing.outcomeDigest !== null) return { decision: "conflict", reason: "An in-progress receipt cannot contain terminal outcome evidence." };
    return { decision: "in_progress", reason: "The identical request is already in progress." };
  }
  if (existing.status === "ambiguous") {
    return { decision: "blocked_ambiguous", reason: "Ambiguous execution evidence requires reconciliation and must not be replayed or re-executed." };
  }
  if (existing.status === "succeeded") {
    if (existing.outcomeDigest === null) return { decision: "conflict", reason: "A successful receipt requires a valid outcome digest." };
    return { decision: "replay_succeeded", reason: "Return the previously recorded successful outcome." };
  }
  return { decision: "replay_failed", reason: "Return the previously recorded failed outcome without re-executing." };
}

function encodeLength(length: number) {
  const buffer = Buffer.alloc(8);
  buffer.writeBigUInt64BE(BigInt(length));
  return buffer;
}

function lengthFrame(parts: readonly Uint8Array[]) {
  const framed: Buffer[] = [];
  for (const part of parts) {
    const buffer = Buffer.from(part);
    framed.push(encodeLength(buffer.byteLength), buffer);
  }
  return Buffer.concat(framed);
}

export function buildFlightWebhookSigningPayload(timestampSeconds: number, rawBody: Uint8Array) {
  if (!Number.isSafeInteger(timestampSeconds) || timestampSeconds < 0) throw new TypeError("Webhook timestamp must be a non-negative integer.");
  if (rawBody.byteLength > 1_048_576) throw new TypeError("Webhook body exceeds the 1 MiB verification limit.");
  return lengthFrame([
    Buffer.from("flight-webhook-hmac-v1", "utf8"),
    Buffer.from(String(timestampSeconds), "ascii"),
    rawBody,
  ]);
}

export type FlightWebhookVerificationResult = {
  verified: boolean;
  reason: "verified" | "missing_secret" | "malformed_signature" | "invalid_timestamp" | "timestamp_outside_tolerance" | "invalid_signature" | "payload_rejected";
  bodyDigest: string | null;
};

export function verifyFlightWebhookHmac(input: {
  rawBody: Uint8Array;
  signatureHex: string;
  timestampSeconds: number;
  secret: string | Uint8Array;
  nowSeconds: number;
  toleranceSeconds?: number;
}): FlightWebhookVerificationResult {
  const secret = typeof input.secret === "string" ? Buffer.from(input.secret, "utf8") : Buffer.from(input.secret);
  if (secret.byteLength < 32) return { verified: false, reason: "missing_secret", bodyDigest: null };
  if (!/^[0-9a-f]{64}$/.test(input.signatureHex)) return { verified: false, reason: "malformed_signature", bodyDigest: null };
  if (!Number.isSafeInteger(input.timestampSeconds) || input.timestampSeconds < 0 || !Number.isSafeInteger(input.nowSeconds) || input.nowSeconds < 0) {
    return { verified: false, reason: "invalid_timestamp", bodyDigest: null };
  }
  const toleranceSeconds = input.toleranceSeconds ?? 300;
  if (!Number.isSafeInteger(toleranceSeconds) || toleranceSeconds < 1 || toleranceSeconds > 900) {
    return { verified: false, reason: "invalid_timestamp", bodyDigest: null };
  }
  if (Math.abs(input.nowSeconds - input.timestampSeconds) > toleranceSeconds) {
    return { verified: false, reason: "timestamp_outside_tolerance", bodyDigest: null };
  }

  let signingPayload: Buffer;
  try {
    signingPayload = buildFlightWebhookSigningPayload(input.timestampSeconds, input.rawBody);
  } catch {
    return { verified: false, reason: "payload_rejected", bodyDigest: null };
  }
  const expected = createHmac("sha256", secret).update(signingPayload).digest();
  const provided = Buffer.from(input.signatureHex, "hex");
  if (expected.byteLength !== provided.byteLength || !timingSafeEqual(expected, provided)) {
    return { verified: false, reason: "invalid_signature", bodyDigest: null };
  }
  return {
    verified: true,
    reason: "verified",
    bodyDigest: createHash("sha256").update(input.rawBody).digest("hex"),
  };
}

export type FlightWebhookReceipt = {
  providerId: string;
  eventId: string;
  bodyDigest: string;
  status: "received" | "verified" | "processed" | "duplicate" | "blocked" | "failed";
};

export function evaluateFlightWebhookReplay(
  incoming: Pick<FlightWebhookReceipt, "providerId" | "eventId" | "bodyDigest">,
  existing: FlightWebhookReceipt | null,
): { decision: "accept" | "duplicate" | "in_progress" | "blocked" | "conflict"; reason: string } {
  if (!stableTokenPattern.test(incoming.providerId) || !stableTokenPattern.test(incoming.eventId) || !sha256Pattern.test(incoming.bodyDigest)) {
    return { decision: "conflict", reason: "Incoming webhook evidence is malformed." };
  }
  if (existing === null) return { decision: "accept", reason: "No prior event receipt exists." };
  if (
    !stableTokenPattern.test(existing.providerId)
    || !stableTokenPattern.test(existing.eventId)
    || !sha256Pattern.test(existing.bodyDigest)
    || !["received", "verified", "processed", "duplicate", "blocked", "failed"].includes(existing.status)
  ) {
    return { decision: "conflict", reason: "Stored webhook evidence is malformed." };
  }
  if (existing.providerId !== incoming.providerId || existing.eventId !== incoming.eventId || existing.bodyDigest !== incoming.bodyDigest) {
    return { decision: "conflict", reason: "Webhook event identity is bound to different payload evidence." };
  }
  if (existing.status === "received" || existing.status === "verified") {
    return { decision: "in_progress", reason: "The identical webhook event is already being handled." };
  }
  if (existing.status === "processed" || existing.status === "duplicate") {
    return { decision: "duplicate", reason: "The identical webhook event already has a terminal receipt." };
  }
  return { decision: "blocked", reason: "Blocked or failed webhook evidence requires manual reconciliation before any retry." };
}
