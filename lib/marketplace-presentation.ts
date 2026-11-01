export type MarketplaceRoom = {
  id: string;
  name: string;
  baseRate: number;
  maxGuests: number;
  availabilityVerified?: boolean;
  staySubtotal?: number | null;
  stayTaxTotal?: number | null;
  stayMandatoryFeeTotal?: number | null;
  stayTotal?: number | null;
  bedType?: string | null;
  refundable?: boolean | null;
  checkinBeginTime?: string | null;
  checkinEndTime?: string | null;
  checkinInstructions?: string | null;
  specialCheckinInstructions?: string | null;
  cancellationPolicy?: string | null;
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
        room.bedType ? `Bed type: ${room.bedType}` : "Bed type pending",
        room.refundable === false ? "Non-refundable" : "Refundable; review cancellation terms",
        room.checkinBeginTime ? `Check-in from ${room.checkinBeginTime}${room.checkinEndTime ? ` to ${room.checkinEndTime}` : ""}` : "Check-in details pending",
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

export function getReviewPresentation(
  rating: number,
  reviews: number,
  source: "database" | "demo" = "database",
) {
  if (source === "demo") {
    return {
      score: rating > 0 ? rating.toFixed(1) : "Demo",
      label: "Illustrative score",
      detail: "Sample review data for this private demo",
    };
  }

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
