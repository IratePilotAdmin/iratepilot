import {
  deriveFlightConsumerProductionApprovedReservePolicySha256,
  deriveFlightConsumerProductionOperationalSourceSectionSha256,
  FLIGHT_CONSUMER_PRODUCTION_OPERATIONAL_SOURCES,
  type FlightConsumerProductionMonitoringTrustedContext,
  type FlightConsumerProductionOperationalSnapshot,
  type FlightConsumerProductionOperationalSource,
} from "./flight-consumer-production";

type OperationalSection = Pick<
  FlightConsumerProductionOperationalSnapshot,
  FlightConsumerProductionOperationalSource
>;

export type FlightConsumerProductionOperationalSourceCollection<
  Source extends FlightConsumerProductionOperationalSource,
> = Readonly<{
  collectedAt: string;
  section: OperationalSection[Source];
  authorityReceiptSha256: string;
}>;

export type FlightConsumerProductionOperationalCollectorReaders = {
  readonly [Source in FlightConsumerProductionOperationalSource]: () =>
    | FlightConsumerProductionOperationalSourceCollection<Source>
    | Promise<FlightConsumerProductionOperationalSourceCollection<Source>>;
};

export type FlightConsumerProductionApprovedDuffelReservePolicy = Readonly<{
  version: "flight-consumer-production-duffel-reserve-policy-v1";
  currency: string;
  requiredReserveMinor: number;
  approvalReceiptSha256: string;
}>;

export type FlightConsumerProductionOperationalCollectedEvidence = Readonly<{
  snapshot: FlightConsumerProductionOperationalSnapshot;
  trustedContext: FlightConsumerProductionMonitoringTrustedContext;
}>;

export type FlightConsumerProductionOperationalCollectorOptions = Readonly<{
  readClock?: () => Date;
}>;

function assertFiniteClock(now: Date) {
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) {
    throw new Error("The monitoring collector clock is unavailable.");
  }
  return now.toISOString();
}

/**
 * Assemble an aggregate Production monitoring snapshot from explicitly injected
 * source readers. This function has no database, network, provider, payment,
 * alert, or release capability; callers must supply each authoritative reader
 * and receipt. Missing or malformed evidence remains the evaluator's fail-closed
 * concern rather than being replaced with defaults.
 */
export async function collectFlightConsumerProductionOperationalEvidence(
  readers: FlightConsumerProductionOperationalCollectorReaders,
  approvedDuffelReservePolicy: FlightConsumerProductionApprovedDuffelReservePolicy,
  options: FlightConsumerProductionOperationalCollectorOptions = {},
): Promise<FlightConsumerProductionOperationalCollectedEvidence> {
  const readClock = options.readClock ?? (() => new Date());

  const entries = await Promise.all(
    FLIGHT_CONSUMER_PRODUCTION_OPERATIONAL_SOURCES.map(async (source) => {
      const reader = readers[source];
      if (typeof reader !== "function") {
        throw new Error(`Missing monitoring source reader: ${source}.`);
      }
      return [source, await reader()] as const;
    }),
  );
  const collectedAt = assertFiniteClock(readClock());

  const sections = Object.fromEntries(
    entries.map(([source, collection]) => [source, collection.section]),
  ) as OperationalSection;
  const snapshot = {
    version: "flight-consumer-production-operational-snapshot-v2" as const,
    environment: "production" as const,
    collectedAt,
    ...sections,
  } satisfies FlightConsumerProductionOperationalSnapshot;

  const sourceReceipts = Object.fromEntries(
    entries.map(([source, collection]) => [source, {
      collectedAt: collection.collectedAt,
      sectionSha256: deriveFlightConsumerProductionOperationalSourceSectionSha256(
        source,
        snapshot.collectedAt,
        collection.collectedAt,
        collection.section,
      ),
      authorityReceiptSha256: collection.authorityReceiptSha256,
    }]),
  ) as FlightConsumerProductionMonitoringTrustedContext["sourceReceipts"];

  const policy = {
    ...approvedDuffelReservePolicy,
    policySha256: deriveFlightConsumerProductionApprovedReservePolicySha256(
      approvedDuffelReservePolicy,
    ),
  } satisfies FlightConsumerProductionMonitoringTrustedContext["approvedDuffelReservePolicy"];

  return {
    snapshot,
    trustedContext: {
      version: "flight-consumer-production-monitoring-trusted-context-v1",
      approvedDuffelReservePolicy: policy,
      sourceReceipts,
    },
  };
}
