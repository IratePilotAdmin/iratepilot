export const FLIGHT_SUPPLIER_MODE = "offline_planning" as const;

export const flightCabins = ["economy", "premium_economy", "business", "first"] as const;
export type FlightCabin = (typeof flightCabins)[number];
export type FlightTripType = "roundtrip" | "oneway" | "multicity";

export type FlightRouteSegment = {
  origin: string;
  destination: string;
  departureDate: string;
};

type RawFlightSearch = Record<string, string | string[] | undefined>;

export type FlightSearchValues = {
  tripType: FlightTripType;
  origin: string;
  destination: string;
  departureDate: string;
  returnDate: string;
  segments: readonly FlightRouteSegment[];
  travelers: string;
  cabin: FlightCabin;
};

export type FlightPlanningQuery = {
  tripType: FlightTripType;
  origin: string;
  destination: string;
  departureDate: string;
  returnDate: string | null;
  segments: readonly FlightRouteSegment[];
  travelers: number;
  cabin: FlightCabin;
};

export type ParsedFlightSearch = {
  submitted: boolean;
  values: FlightSearchValues;
  query: FlightPlanningQuery | null;
  errors: string[];
};

const airportCodePattern = /^[A-Z]{3}$/;
const isoDatePattern = /^\d{4}-\d{2}-\d{2}$/;

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] || "" : value || "";
}

function all(value: string | string[] | undefined) {
  return Array.isArray(value) ? value : value === undefined ? [] : [value];
}

function normalizeAirportCode(value: string | string[] | undefined) {
  return first(value).trim().toUpperCase();
}

function isIsoDate(value: string) {
  if (!isoDatePattern.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function utcDateKey(now: Date) {
  return [now.getUTCFullYear(), String(now.getUTCMonth() + 1).padStart(2, "0"), String(now.getUTCDate()).padStart(2, "0")].join("-");
}

export function parseFlightSearch(raw: RawFlightSearch, now = new Date()): ParsedFlightSearch {
  const submitted = ["tripType", "origin", "destination", "departureDate", "returnDate", "segmentOrigin", "segmentDestination", "segmentDepartureDate", "travelers", "cabin"]
    .some((key) => raw[key] !== undefined);
  const tripTypeValue = first(raw.tripType);
  const cabinValue = first(raw.cabin);
  const segmentOrigins = all(raw.segmentOrigin).map((value) => value.trim().toUpperCase());
  const segmentDestinations = all(raw.segmentDestination).map((value) => value.trim().toUpperCase());
  const segmentDepartureDates = all(raw.segmentDepartureDate).map((value) => value.trim());
  const segmentCount = Math.max(segmentOrigins.length, segmentDestinations.length, segmentDepartureDates.length);
  const segments = Array.from({ length: segmentCount }, (_, index) => ({
    origin: segmentOrigins[index] || "",
    destination: segmentDestinations[index] || "",
    departureDate: segmentDepartureDates[index] || "",
  }));
  while (segments.at(-1) && Object.values(segments.at(-1)!).every((value) => value === "")) segments.pop();
  const values: FlightSearchValues = {
    tripType: tripTypeValue === "oneway" ? "oneway" : tripTypeValue === "multicity" ? "multicity" : "roundtrip",
    origin: normalizeAirportCode(raw.origin),
    destination: normalizeAirportCode(raw.destination),
    departureDate: first(raw.departureDate),
    returnDate: first(raw.returnDate),
    segments,
    travelers: first(raw.travelers) || "1",
    cabin: flightCabins.includes(cabinValue as FlightCabin) ? cabinValue as FlightCabin : "economy",
  };

  if (!submitted) return { submitted, values, query: null, errors: [] };

  const errors: string[] = [];
  const today = utcDateKey(now);
  if (tripTypeValue !== "roundtrip" && tripTypeValue !== "oneway" && tripTypeValue !== "multicity") {
    errors.push("Choose round trip, one way, or multi-city.");
  }

  if (values.tripType === "multicity") {
    if (segments.length < 2 || segments.length > 4) {
      errors.push("Multi-city itineraries require between 2 and 4 legs.");
    }
    segments.forEach((segment, index) => {
      const label = `Multi-city leg ${index + 1}`;
      if (!airportCodePattern.test(segment.origin)) errors.push(`${label} needs a three-letter departure airport code.`);
      if (!airportCodePattern.test(segment.destination)) errors.push(`${label} needs a three-letter arrival airport code.`);
      if (segment.origin && segment.origin === segment.destination) errors.push(`${label} departure and arrival airports must differ.`);
      if (!isIsoDate(segment.departureDate)) errors.push(`${label} needs a valid departure date.`);
      else if (segment.departureDate < today) errors.push(`${label} departure date cannot be in the past.`);
      const previous = segments[index - 1];
      if (previous && airportCodePattern.test(previous.destination) && segment.origin !== previous.destination) {
        errors.push(`${label} must depart from ${previous.destination}, the prior leg's arrival airport.`);
      }
      if (previous && isIsoDate(previous.departureDate) && isIsoDate(segment.departureDate) && segment.departureDate < previous.departureDate) {
        errors.push(`${label} departure date cannot be before the prior leg.`);
      }
    });
  } else {
    if (!airportCodePattern.test(values.origin)) errors.push("Enter a three-letter departure airport code.");
    if (!airportCodePattern.test(values.destination)) errors.push("Enter a three-letter arrival airport code.");
    if (values.origin && values.origin === values.destination) errors.push("Departure and arrival airports must be different.");
    if (!isIsoDate(values.departureDate)) {
      errors.push("Choose a valid departure date.");
    } else if (values.departureDate < today) {
      errors.push("Departure date cannot be in the past.");
    }

    if (values.tripType === "roundtrip") {
      if (!isIsoDate(values.returnDate)) {
        errors.push("Choose a valid return date.");
      } else if (isIsoDate(values.departureDate) && values.returnDate <= values.departureDate) {
        errors.push("Return date must be after departure.");
      }
    }
  }

  const travelers = Number(values.travelers);
  if (!Number.isInteger(travelers) || travelers < 1 || travelers > 9) errors.push("Choose between 1 and 9 travelers.");
  if (!flightCabins.includes(cabinValue as FlightCabin)) errors.push("Choose a supported cabin.");

  const query = errors.length ? null : {
    tripType: values.tripType,
    origin: values.tripType === "multicity" ? segments[0]!.origin : values.origin,
    destination: values.tripType === "multicity" ? segments.at(-1)!.destination : values.destination,
    departureDate: values.tripType === "multicity" ? segments[0]!.departureDate : values.departureDate,
    returnDate: values.tripType === "roundtrip" ? values.returnDate : null,
    segments: values.tripType === "multicity"
      ? Object.freeze(segments.map((segment) => Object.freeze({ ...segment })))
      : Object.freeze([Object.freeze({
        origin: values.origin,
        destination: values.destination,
        departureDate: values.departureDate,
      })]),
    travelers,
    cabin: values.cabin,
  };

  return { submitted, values, query, errors };
}

export function formatFlightCabin(cabin: FlightCabin) {
  return cabin === "premium_economy" ? "Premium economy" : `${cabin[0].toUpperCase()}${cabin.slice(1)}`;
}

export function formatFlightDate(value: string) {
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: "UTC" })
    .format(new Date(`${value}T00:00:00Z`));
}
