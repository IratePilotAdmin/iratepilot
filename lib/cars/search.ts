export const CAR_RENTAL_SUPPLIER_MODE = "offline_planning" as const;

export const carVehicleClasses = [
  "economy",
  "compact",
  "midsize",
  "fullsize",
  "suv",
  "minivan",
  "pickup",
  "luxury",
  "electric",
] as const;

export const carDriverAgeBands = ["25_plus", "21_24", "18_20"] as const;
export const carReturnTypes = ["same", "different"] as const;

export type CarVehicleClass = (typeof carVehicleClasses)[number];
export type CarDriverAgeBand = (typeof carDriverAgeBands)[number];
export type CarReturnType = (typeof carReturnTypes)[number];

type RawCarRentalSearch = Record<string, string | string[] | undefined>;

export type CarRentalSearchValues = {
  pickupLocation: string;
  returnType: CarReturnType;
  dropoffLocation: string;
  pickupDate: string;
  pickupTime: string;
  dropoffDate: string;
  dropoffTime: string;
  driverAge: CarDriverAgeBand;
  vehicleClass: CarVehicleClass;
};

export type CarRentalPlanningQuery = {
  pickupLocation: string;
  dropoffLocation: string;
  returnType: CarReturnType;
  pickupDate: string;
  pickupTime: string;
  dropoffDate: string;
  dropoffTime: string;
  driverAge: CarDriverAgeBand;
  vehicleClass: CarVehicleClass;
  durationHours: number;
};

export type ParsedCarRentalSearch = {
  submitted: boolean;
  values: CarRentalSearchValues;
  query: CarRentalPlanningQuery | null;
  errors: string[];
};

const isoDatePattern = /^\d{4}-\d{2}-\d{2}$/;
const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/;
const locationPattern = /^[\p{L}\p{N}][\p{L}\p{N}\s.,'&()/-]{1,79}$/u;
const maximumRentalHours = 30 * 24;

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] || "" : value || "";
}

function normalizeLocation(value: string | string[] | undefined) {
  return first(value).trim().replace(/\s+/g, " ");
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

function timestamp(date: string, time: string) {
  const [year, month, day] = date.split("-").map(Number);
  const [hours, minutes] = time.split(":").map(Number);
  return Date.UTC(year, month - 1, day, hours, minutes);
}

function isValidLocation(value: string) {
  return locationPattern.test(value);
}

export function parseCarRentalSearch(raw: RawCarRentalSearch, now = new Date()): ParsedCarRentalSearch {
  const keys = ["pickupLocation", "returnType", "dropoffLocation", "pickupDate", "pickupTime", "dropoffDate", "dropoffTime", "driverAge", "vehicleClass"];
  const submitted = keys.some((key) => raw[key] !== undefined);
  const returnTypeValue = first(raw.returnType);
  const driverAgeValue = first(raw.driverAge);
  const vehicleClassValue = first(raw.vehicleClass);

  const values: CarRentalSearchValues = {
    pickupLocation: normalizeLocation(raw.pickupLocation),
    returnType: returnTypeValue === "different" ? "different" : "same",
    dropoffLocation: normalizeLocation(raw.dropoffLocation),
    pickupDate: first(raw.pickupDate),
    pickupTime: first(raw.pickupTime) || (submitted ? "" : "10:00"),
    dropoffDate: first(raw.dropoffDate),
    dropoffTime: first(raw.dropoffTime) || (submitted ? "" : "10:00"),
    driverAge: carDriverAgeBands.includes(driverAgeValue as CarDriverAgeBand) ? driverAgeValue as CarDriverAgeBand : "25_plus",
    vehicleClass: carVehicleClasses.includes(vehicleClassValue as CarVehicleClass) ? vehicleClassValue as CarVehicleClass : "economy",
  };

  if (!submitted) return { submitted, values, query: null, errors: [] };

  const errors: string[] = [];
  if (!isValidLocation(values.pickupLocation)) errors.push("Enter a pickup city, airport, or rental location.");
  if (!carReturnTypes.includes(returnTypeValue as CarReturnType)) errors.push("Choose the same or a different return location.");

  const effectiveDropoffLocation = values.returnType === "same" ? values.pickupLocation : values.dropoffLocation;
  if (values.returnType === "different") {
    if (!isValidLocation(values.dropoffLocation)) errors.push("Enter a valid return city, airport, or rental location.");
    if (values.pickupLocation && values.dropoffLocation.toLocaleLowerCase() === values.pickupLocation.toLocaleLowerCase()) {
      errors.push("Choose the same-location option when pickup and return locations match.");
    }
  }

  const today = utcDateKey(now);
  if (!isIsoDate(values.pickupDate)) {
    errors.push("Choose a valid pickup date.");
  } else if (values.pickupDate < today) {
    errors.push("Pickup date cannot be in the past.");
  }
  if (!timePattern.test(values.pickupTime)) errors.push("Choose a valid pickup time.");
  if (!isIsoDate(values.dropoffDate)) errors.push("Choose a valid return date.");
  if (!timePattern.test(values.dropoffTime)) errors.push("Choose a valid return time.");

  let durationHours = 0;
  if (isIsoDate(values.pickupDate) && timePattern.test(values.pickupTime) && isIsoDate(values.dropoffDate) && timePattern.test(values.dropoffTime)) {
    durationHours = (timestamp(values.dropoffDate, values.dropoffTime) - timestamp(values.pickupDate, values.pickupTime)) / 3_600_000;
    if (durationHours < 1) errors.push("Return must be at least one hour after pickup.");
    if (durationHours > maximumRentalHours) errors.push("This planning preview supports rentals up to 30 days.");
  }

  if (!carDriverAgeBands.includes(driverAgeValue as CarDriverAgeBand)) errors.push("Choose a supported driver age range.");
  if (!carVehicleClasses.includes(vehicleClassValue as CarVehicleClass)) errors.push("Choose a supported vehicle class.");

  const query = errors.length ? null : {
    pickupLocation: values.pickupLocation,
    dropoffLocation: effectiveDropoffLocation,
    returnType: values.returnType,
    pickupDate: values.pickupDate,
    pickupTime: values.pickupTime,
    dropoffDate: values.dropoffDate,
    dropoffTime: values.dropoffTime,
    driverAge: values.driverAge,
    vehicleClass: values.vehicleClass,
    durationHours,
  };

  return { submitted, values, query, errors };
}

export function formatCarVehicleClass(vehicleClass: CarVehicleClass) {
  if (vehicleClass === "suv") return "SUV";
  return `${vehicleClass[0].toUpperCase()}${vehicleClass.slice(1)}`;
}

export function formatCarDriverAge(age: CarDriverAgeBand) {
  if (age === "25_plus") return "Age 25 or older";
  if (age === "21_24") return "Age 21–24";
  return "Age 18–20";
}

export function formatCarRentalDateTime(date: string, time: string) {
  const formattedDate = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: "UTC" })
    .format(new Date(`${date}T00:00:00Z`));
  const [hours, minutes] = time.split(":").map(Number);
  const formattedTime = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone: "UTC" })
    .format(new Date(Date.UTC(2000, 0, 1, hours, minutes)));
  return `${formattedDate} at ${formattedTime}`;
}
