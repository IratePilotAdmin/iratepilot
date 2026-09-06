import { z } from "zod";

export const HOTEL_MANAGER_INTEREST_MESSAGE_PREFIX = "[HOTEL_MANAGER_INTEREST_V1]";

const requiredText = (label: string, minimum: number, maximum: number) => z
  .string({ required_error: `${label} is required.` })
  .trim()
  .min(minimum, `${label} is required.`)
  .max(maximum, `${label} is too long.`);

const optionalText = (maximum: number) => z.preprocess(
  (value) => typeof value === "string" && value.trim() === "" ? undefined : value,
  z.string().trim().max(maximum).optional(),
);

const optionalHttpsUrl = z.preprocess(
  (value) => typeof value === "string" && value.trim() === "" ? undefined : value,
  z.string().trim().url().max(2_000).refine((value) => {
    try {
      const url = new URL(value);
      return url.protocol === "https:" && !url.username && !url.password;
    } catch {
      return false;
    }
  }, "Use an HTTPS hotel website URL.").optional(),
);

export const hotelManagerInterestSchema = z.object({
  hotelName: requiredText("Hotel name", 2, 160),
  contactName: requiredText("Contact name", 2, 100),
  role: z.enum([
    "owner",
    "authorized_representative",
    "general_manager",
    "revenue_manager",
    "sales_manager",
  ]),
  businessEmail: z.string().trim().email().max(254).transform((value) => value.toLowerCase()),
  businessPhone: requiredText("Business phone", 7, 30),
  city: requiredText("City", 2, 100),
  region: optionalText(100),
  country: requiredText("Country", 2, 100),
  websiteUrl: optionalHttpsUrl,
  preferredContact: z.enum(["email", "phone"]),
  notes: optionalText(1_000),
  faxNumber: z.literal("").default(""),
}).strict();

export type HotelManagerInterest = z.infer<typeof hotelManagerInterestSchema>;

const labels: Record<HotelManagerInterest["role"] | HotelManagerInterest["preferredContact"], string> = {
  owner: "Owner",
  authorized_representative: "Authorized representative",
  general_manager: "General manager",
  revenue_manager: "Revenue manager",
  sales_manager: "Sales manager",
  email: "Email",
  phone: "Phone",
};

function cleanLine(value: string) {
  return value.replace(/[\r\n]+/g, " ").trim();
}

function identityKey(value: string) {
  return cleanLine(value).normalize("NFKC").replace(/\s+/g, " ").toLocaleLowerCase("en-US");
}

type HotelInterestIdentity = Pick<HotelManagerInterest, "hotelName" | "city" | "region" | "country">;

export function matchesHotelManagerInterestMessage(message: string, interest: HotelInterestIdentity) {
  if (!message.startsWith(`${HOTEL_MANAGER_INTEREST_MESSAGE_PREFIX}\n`)) return false;
  const lines = message.split("\n");
  const values = (prefix: string) => lines.filter((line) => line.startsWith(prefix)).map((line) => line.slice(prefix.length));
  const hotel = values("Hotel: ");
  const city = values("City: ");
  const region = values("State or region: ");
  const country = values("Country: ");
  // Legacy comma-joined locations cannot establish the original field boundaries.
  if (hotel.length !== 1 || city.length !== 1 || country.length !== 1 || region.length > 1) return false;
  return identityKey(hotel[0]) === identityKey(interest.hotelName)
    && identityKey(city[0]) === identityKey(interest.city)
    && identityKey(region[0] ?? "") === identityKey(interest.region ?? "")
    && identityKey(country[0]) === identityKey(interest.country);
}

export function formatHotelManagerInterestMessage(interest: HotelManagerInterest) {
  const lines = [
    HOTEL_MANAGER_INTEREST_MESSAGE_PREFIX,
    `Hotel: ${cleanLine(interest.hotelName)}`,
    `Role: ${labels[interest.role]}`,
    `Business phone: ${cleanLine(interest.businessPhone)}`,
    `Preferred contact: ${labels[interest.preferredContact]}`,
    `City: ${cleanLine(interest.city)}`,
    interest.region ? `State or region: ${cleanLine(interest.region)}` : null,
    `Country: ${cleanLine(interest.country)}`,
    interest.websiteUrl ? `Official website: ${cleanLine(interest.websiteUrl)}` : null,
    interest.notes ? `Manager notes: ${cleanLine(interest.notes)}` : null,
    "Intake state: private onboarding interest only; no application approval, listing, booking, payment, email delivery, or supplier access was activated.",
  ];
  return lines.filter((line): line is string => Boolean(line)).join("\n");
}
