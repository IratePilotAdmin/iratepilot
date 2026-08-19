export const FLIGHT_SUPPLIER_MODE = "offline_planning" as const;

export const flightCabins = ["economy", "premium_economy", "business", "first"] as const;
export type FlightCabin = (typeof flightCabins)[number];
export type FlightTripType = "roundtrip" | "oneway";

type RawFlightSearch = Record<string, string | string[] | undefined>;

export type FlightSearchValues = {
  tripType: FlightTripType;
  origin: string;
  destination: string;
  departureDate: string;
  returnDate: string;
  travelers: string;
  cabin: FlightCabin;
};

export type FlightPlanningQuery = {
  tripType: FlightTripType;
  origin: string;
  destination: string;
  departureDate: string;
  returnDate: string | null;
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
  const submitted = ["tripType", "origin", "destination", "departureDate", "returnDate", "travelers", "cabin"]
    .some((key) => raw[key] !== undefined);
  const tripTypeValue = first(raw.tripType);
  const cabinValue = first(raw.cabin);
  const values: FlightSearchValues = {
    tripType: tripTypeValue === "oneway" ? "oneway" : "roundtrip",
    origin: normalizeAirportCode(raw.origin),
    destination: normalizeAirportCode(raw.destination),
    departureDate: first(raw.departureDate),
    returnDate: first(raw.returnDate),
    travelers: first(raw.travelers) || "1",
    cabin: flightCabins.includes(cabinValue as FlightCabin) ? cabinValue as FlightCabin : "economy",
  };

  if (!submitted) return { submitted, values, query: null, errors: [] };

  const errors: string[] = [];
  if (tripTypeValue !== "roundtrip" && tripTypeValue !== "oneway") errors.push("Choose round trip or one way.");
  if (!airportCodePattern.test(values.origin)) errors.push("Enter a three-letter departure airport code.");
  if (!airportCodePattern.test(values.destination)) errors.push("Enter a three-letter arrival airport code.");
  if (values.origin && values.origin === values.destination) errors.push("Departure and arrival airports must be different.");

  const today = utcDateKey(now);
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

  const travelers = Number(values.travelers);
  if (!Number.isInteger(travelers) || travelers < 1 || travelers > 9) errors.push("Choose between 1 and 9 travelers.");
  if (!flightCabins.includes(cabinValue as FlightCabin)) errors.push("Choose a supported cabin.");

  const query = errors.length ? null : {
    tripType: values.tripType,
    origin: values.origin,
    destination: values.destination,
    departureDate: values.departureDate,
    returnDate: values.tripType === "roundtrip" ? values.returnDate : null,
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
