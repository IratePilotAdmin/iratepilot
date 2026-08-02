import { hotels as demoHotels, type Hotel } from "@/data/hotels";
import { createClient } from "@/lib/supabase/server";
import {
  getAvailableRoomRates,
  hasStayCriteria,
  matchesMarketplaceDestination,
  type MarketplaceSearchCriteria,
  type SearchableRoom,
} from "@/lib/marketplace-search";

type PropertyRow = {
  slug: string;
  name: string;
  city: string;
  country: string;
  star_rating: 4 | 5;
  description: string | null;
  image_url: string | null;
  amenities: string[] | null;
  guest_rating: number | null;
  review_count: number | null;
  rooms: Array<SearchableRoom & { id: string }> | null;
};

const fallbackImage = "https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=1200&q=80";

export async function getMarketplaceHotels(
  criteria: MarketplaceSearchCriteria | null = null,
): Promise<{ hotels: Hotel[]; source: "database" | "demo" }> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.from("properties")
      .select("slug,name,city,country,star_rating,description,image_url,amenities,guest_rating,review_count,rooms(id,active,base_rate,max_guests,inventory(stay_date,available_units,rate))")
      .eq("active", true)
      .in("star_rating", [4, 5])
      .eq("rooms.active", true);
    if (error) throw error;

    const rows = (data || []) as PropertyRow[];
    const mapped = rows.flatMap((property): Hotel[] => {
      if (criteria && !matchesMarketplaceDestination(property, criteria.destination)) return [];
      const rates = hasStayCriteria(criteria)
        ? getAvailableRoomRates(property.rooms, criteria)
        : property.rooms?.filter((room) => room.active).map((room) => Number(room.base_rate)).filter((rate) => rate > 0) || [];
      if (rates.length === 0) return [];
      return [{
        slug: property.slug,
        name: property.name,
        city: property.city,
        country: property.country,
        stars: property.star_rating,
        rating: Number(property.guest_rating || 0),
        reviews: property.review_count || 0,
        price: Math.min(...rates),
        image: property.image_url || fallbackImage,
        amenities: property.amenities || [],
        description: property.description || "A verified premium property in the iRatePilot marketplace."
      }];
    });
    return { hotels: mapped, source: "database" };
  } catch {
    const hotels = criteria
      ? demoHotels.filter((hotel) => matchesMarketplaceDestination(hotel, criteria.destination))
      : demoHotels;
    return { hotels, source: "demo" };
  }
}

export async function getMarketplaceHotel(slug: string) {
  const marketplace = await getMarketplaceHotels();
  if (marketplace.source === "database") {
    try {
      const supabase = await createClient();
      const { data } = await supabase.from("properties")
        .select("rooms(id,name,base_rate,max_guests)")
        .eq("slug", slug).eq("active", true).eq("rooms.active", true).single();
      const rooms = ((data?.rooms || []) as Array<{ id: string; name: string; base_rate: number; max_guests: number }>).map((room) => ({
        id: room.id, name: room.name, baseRate: Number(room.base_rate), maxGuests: room.max_guests
      }));
      return { hotel: marketplace.hotels.find((item) => item.slug === slug), source: marketplace.source, rooms };
    } catch {}
  }
  return { hotel: marketplace.hotels.find((item) => item.slug === slug), source: marketplace.source, rooms: [] };
}
