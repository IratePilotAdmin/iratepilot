export type MarketplaceRoom = {
  id: string;
  name: string;
  baseRate: number;
  maxGuests: number;
  availabilityVerified?: boolean;
};

export type PresentedRoom = {
  id: string;
  name: string;
  price: number;
  notes: string[];
  bookable: boolean;
};

export function getPresentedRooms(
  source: "database" | "demo",
  rooms: MarketplaceRoom[],
  fallbackPrice: number
): PresentedRoom[] {
  if (source === "database") {
    return rooms.map((room) => ({
      id: room.id,
      name: room.name,
      price: room.baseRate,
      notes: [
        `Up to ${room.maxGuests} ${room.maxGuests === 1 ? "guest" : "guests"}`,
        room.availabilityVerified
          ? "Available for every selected night"
          : "Select dates to verify availability"
      ],
      bookable: true
    }));
  }

  return [
    {
      id: "demo-deluxe-king",
      name: "Example Deluxe King",
      price: fallbackPrice,
      notes: ["Sample room type", "Live availability is not connected"],
      bookable: false
    },
    {
      id: "demo-premium-suite",
      name: "Example Premium Suite",
      price: fallbackPrice + 140,
      notes: ["Sample room type", "Live availability is not connected"],
      bookable: false
    }
  ];
}

export function getReviewPresentation(rating: number, reviews: number) {
  if (reviews < 1) {
    return { score: "New", label: "New to iRatePilot", detail: "No verified guest reviews yet" };
  }

  const label = rating >= 9 ? "Exceptional" : rating >= 8 ? "Excellent" : rating >= 7 ? "Very good" : "Guest rated";
  return {
    score: rating.toFixed(1),
    label,
    detail: `${reviews.toLocaleString()} verified guest ${reviews === 1 ? "review" : "reviews"}`
  };
}
