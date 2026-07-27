export type Hotel = {
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

export const hotels: Hotel[] = [
  {
    slug: "azure-grand-miami",
    name: "Azure Grand Miami",
    city: "Miami Beach",
    country: "United States",
    stars: 5,
    rating: 9.2,
    reviews: 1843,
    price: 389,
    image: "https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=1200&q=80",
    amenities: ["Ocean view", "Spa", "Pool", "Airport transfer"],
    description: "A refined oceanfront retreat with spacious rooms, rooftop dining, and personalized service."
  },
  {
    slug: "harbor-house-charleston",
    name: "Harbor House Charleston",
    city: "Charleston",
    country: "United States",
    stars: 4,
    rating: 8.8,
    reviews: 992,
    price: 249,
    image: "https://images.unsplash.com/photo-1551882547-ff40c63fe5fa?auto=format&fit=crop&w=1200&q=80",
    amenities: ["Breakfast", "Gym", "Historic district", "Valet parking"],
    description: "Boutique comfort in the historic district with locally inspired dining and warm Southern hospitality."
  },
  {
    slug: "palm-reserve-orlando",
    name: "Palm Reserve Orlando",
    city: "Orlando",
    country: "United States",
    stars: 5,
    rating: 9.0,
    reviews: 2210,
    price: 329,
    image: "https://images.unsplash.com/photo-1582719478250-c89cae4dc85b?auto=format&fit=crop&w=1200&q=80",
    amenities: ["Resort pool", "Family suites", "Shuttle", "Kids club"],
    description: "A full-service luxury resort designed for families, groups, and memorable Florida vacations."
  },
  {
    slug: "navarre-luxury-villa",
    name: "Navarre Luxury Villa",
    city: "Navarre",
    country: "United States",
    stars: 5,
    rating: 9.5,
    reviews: 316,
    price: 445,
    image: "https://images.unsplash.com/photo-1600047509807-ba8f99d2cdde?auto=format&fit=crop&w=1200&q=80",
    amenities: ["Private pool", "Beach access", "Full kitchen", "Sleeps 10"],
    description: "A premium vacation home near the Gulf with private outdoor space and upscale interiors."
  }
];
