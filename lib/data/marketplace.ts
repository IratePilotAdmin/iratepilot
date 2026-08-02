import { hotels as demoHotels, type Hotel } from "@/data/hotels";
import { fees } from "@/config/fees";
import { createClient } from "@/lib/supabase/server";
import { hasActiveMembership } from "@/lib/memberships/eligibility";
import {
  getAvailableRoomRates,
  getAvailableRooms,
  hasStayCriteria,
  matchesMarketplaceDestination,
  type MarketplaceSearchCriteria,
  type SearchableRoom,
  type StayCriteria,
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

export async function getMarketplaceHotel(slug: string, stay: StayCriteria | null = null) {
  const marketplace = await getMarketplaceHotels();
  if (marketplace.source === "database") {
    try {
      const supabase = await createClient();
      const { data } = await supabase.from("properties")
        .select("rooms(id,name,active,base_rate,max_guests,inventory(stay_date,available_units,rate))")
        .eq("slug", slug).eq("active", true).eq("rooms.active", true).single();
      const roomRows = (data?.rooms || []) as Array<SearchableRoom & { id: string; name: string }>;
      const availableRooms = stay
        ? getAvailableRooms(roomRows, stay)
        : roomRows.filter((room) => room.active).map((room) => ({
          ...room,
          averageNightlyRate: Number(room.base_rate),
          staySubtotal: null,
        }));
      const rooms = availableRooms.map((room) => ({
        id: room.id,
        name: room.name,
        baseRate: room.averageNightlyRate,
        maxGuests: room.max_guests,
        availabilityVerified: Boolean(stay),
        staySubtotal: room.staySubtotal,
      }));
      return { hotel: marketplace.hotels.find((item) => item.slug === slug), source: marketplace.source, rooms };
    } catch {}
  }
  return { hotel: marketplace.hotels.find((item) => item.slug === slug), source: marketplace.source, rooms: [] };
}

export async function getTravelerServiceFeeRate() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return fees.serviceFeeRate;
    const { data, error } = await supabase.from("profiles")
      .select("membership_tier,membership_status")
      .eq("id", user.id)
      .single();
    if (error) throw error;
    return hasActiveMembership(data) ? 0 : fees.serviceFeeRate;
  } catch {
    return fees.serviceFeeRate;
  }
}
