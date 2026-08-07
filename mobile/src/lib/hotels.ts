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

type SearchResponse = {
  data?: MobileHotel[];
  error?: string;
  source?: "database" | "demo";
};

async function readJson<T>(path: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(buildWebUrl(path), {
    headers: { Accept: "application/json" },
    signal,
  });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || "Unable to load iRatePilot inventory.");
  return body as T;
}

export async function searchHotels(destination: string, signal?: AbortSignal) {
  const query = new URLSearchParams({ destination: destination.trim() });
  const result = await readJson<SearchResponse>(`/api/search?${query.toString()}`, signal);
  return { hotels: result.data ?? [], source: result.source ?? "demo" };
}

export async function getHotel(slug: string, signal?: AbortSignal) {
  return readJson<{ data: MobileHotel; source: "database" | "demo" }>(
    `/api/hotels/${encodeURIComponent(slug)}`,
    signal,
  );
}
