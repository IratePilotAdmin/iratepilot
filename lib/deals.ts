export type DealInventoryRow = {
  stay_date: string;
  available_units: number | string;
  rate: number | string;
  rooms: {
    id: string;
    name: string;
    base_rate: number | string;
    properties: {
      slug: string;
      name: string;
      city: string;
      country: string;
      image_url: string | null;
      active: boolean;
      star_rating: number;
    } | null;
  } | null;
};

export function buildRateBackedDeals(rows: DealInventoryRow[], minimumDiscountPercent = 5) {
  const byRoom = new Map<string, ReturnType<typeof toDeal> & { discountedNights: number }>();
  for (const row of rows) {
    const deal = toDeal(row);
    if (!deal || deal.discountPercent < minimumDiscountPercent) continue;
    const current = byRoom.get(deal.roomId);
    if (!current) {
      byRoom.set(deal.roomId, { ...deal, discountedNights: 1 });
      continue;
    }
    current.discountedNights += 1;
    if (deal.discountPercent > current.discountPercent
      || (deal.discountPercent === current.discountPercent && deal.stayDate < current.stayDate)) {
      byRoom.set(deal.roomId, { ...deal, discountedNights: current.discountedNights });
    }
  }
  return [...byRoom.values()].sort((left, right) =>
    right.discountPercent - left.discountPercent || left.dealRate - right.dealRate || left.propertyName.localeCompare(right.propertyName)
  );
}

function toDeal(row: DealInventoryRow) {
  const room = row.rooms;
  const property = room?.properties;
  const baseRate = Number(room?.base_rate);
  const dealRate = Number(row.rate);
  if (!room || !property || Number(row.available_units) < 1 || !Number.isFinite(baseRate) || !Number.isFinite(dealRate) || baseRate <= 0 || dealRate >= baseRate) return null;
  const savings = Math.round((baseRate - dealRate) * 100) / 100;
  return {
    roomId: room.id,
    roomName: room.name,
    propertySlug: property.slug,
    propertyName: property.name,
    city: property.city,
    country: property.country,
    imageUrl: property.image_url,
    published: property.active,
    stars: property.star_rating,
    stayDate: row.stay_date,
    baseRate,
    dealRate,
    savings,
    discountPercent: Math.round(savings / baseRate * 100),
  };
}
