import {
  flightBookingConnectorIds,
  type FlightBookingConnectorId,
} from "./booking-connectors";

export const FLIGHT_ROLLOUT_ROUTE_DECISION_MODE = "authorized_route_preference_only" as const;
export const FLIGHT_ROLLOUT_PRIMARY_CONNECTOR_ID = "duffel" as const;
export const FLIGHT_ROLLOUT_SECONDARY_CONNECTOR_ID = "sabre" as const;

export type FlightRolloutAlternativeConnectorId = Exclude<
  FlightBookingConnectorId,
  typeof FLIGHT_ROLLOUT_SECONDARY_CONNECTOR_ID
>;

export type FlightRolloutRouteDecision = Readonly<{
  mode: typeof FLIGHT_ROLLOUT_ROUTE_DECISION_MODE;
  decisionState: "authorized_route_preference";
  primaryConnectorId: typeof FLIGHT_ROLLOUT_PRIMARY_CONNECTOR_ID;
  secondaryConnectorId: typeof FLIGHT_ROLLOUT_SECONDARY_CONNECTOR_ID;
  alternativeConnectorIds: readonly FlightRolloutAlternativeConnectorId[];
  parallelLaunchAuthorized: false;
  contractAuthorityApproved: false;
  credentialsConfigured: false;
  sandboxTrafficAuthorized: false;
  routeEnabled: false;
  bookingAuthorized: false;
  ticketingAuthorized: false;
  paymentAuthorized: false;
  productionTrafficAuthorized: false;
  nextGate: "contract_authority";
}>;

export function buildFlightRolloutRouteDecision(): FlightRolloutRouteDecision {
  const alternativeConnectorIds = flightBookingConnectorIds.filter(
    (id): id is FlightRolloutAlternativeConnectorId => id !== FLIGHT_ROLLOUT_SECONDARY_CONNECTOR_ID,
  );
  return Object.freeze({
    mode: FLIGHT_ROLLOUT_ROUTE_DECISION_MODE,
    decisionState: "authorized_route_preference",
    primaryConnectorId: FLIGHT_ROLLOUT_PRIMARY_CONNECTOR_ID,
    secondaryConnectorId: FLIGHT_ROLLOUT_SECONDARY_CONNECTOR_ID,
    alternativeConnectorIds: Object.freeze(alternativeConnectorIds),
    parallelLaunchAuthorized: false,
    contractAuthorityApproved: false,
    credentialsConfigured: false,
    sandboxTrafficAuthorized: false,
    routeEnabled: false,
    bookingAuthorized: false,
    ticketingAuthorized: false,
    paymentAuthorized: false,
    productionTrafficAuthorized: false,
    nextGate: "contract_authority",
  });
}
