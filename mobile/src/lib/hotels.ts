import { buildWebUrl } from "@/lib/web";

export type MobileHotel = {
  slug: string;
  name: string;
  city: string;
  country: string;
  stars: 4 | 5;
  rating: number;
  reviews: number;
  price: number;
  image: string;
  amenities: string[];
  description: string;
};

export type MobileRoom = {
  id: string;
  name: string;
  baseRate: number;
  maxGuests: number;
  availabilityVerified: boolean;
  staySubtotal: number | null;
};

export type StaySelection = {
  checkIn: string;
  checkOut: string;
  guests: number;
};

type SearchResponse = {
  data?: MobileHotel[];
  error?: string;
  source?: "database" | "demo";
};

async function readJson<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const response = await fetch(buildWebUrl(path), {
    ...options,
    headers: { Accept: "application/json", ...options.headers },
  });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || "Unable to load iRatePilot inventory.");
  return body as T;
}

export async function searchHotels(destination: string, signal?: AbortSignal) {
  const query = new URLSearchParams({ destination: destination.trim() });
  const result = await readJson<SearchResponse>(`/api/search?${query.toString()}`, { signal });
  return { hotels: result.data ?? [], source: result.source ?? "demo" };
}

export async function getHotel(slug: string, stay?: StaySelection, signal?: AbortSignal) {
  const query = stay
    ? `?${new URLSearchParams({
        checkIn: stay.checkIn,
        checkOut: stay.checkOut,
        guests: String(stay.guests),
      }).toString()}`
    : "";
  return readJson<{
    data: MobileHotel;
    rooms: MobileRoom[];
    source: "database" | "demo";
    availabilityVerified: boolean;
  }>(`/api/hotels/${encodeURIComponent(slug)}${query}`, { signal });
}

export async function createBookingRequest(
  selection: StaySelection & { hotelSlug: string; roomId: string },
  accessToken: string,
) {
  return readJson<{
    data: { confirmation_code: string; status: string; subtotal: number; fees: number; total: number };
    duplicate?: boolean;
    message: string;
  }>("/api/bookings", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(selection),
  });
}
