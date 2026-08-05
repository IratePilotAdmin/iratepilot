"use client";

import { Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { SearchFormValues } from "@/lib/marketplace-search";

export function SearchForm({ initialValues }: { initialValues?: Partial<SearchFormValues> }) {
  const router = useRouter();
  const [destination, setDestination] = useState(initialValues?.destination || "Miami Beach");
  const [checkIn, setCheckIn] = useState(initialValues?.checkIn || "");
  const [checkOut, setCheckOut] = useState(initialValues?.checkOut || "");
  const [guests, setGuests] = useState(initialValues?.guests || "2");

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const params = new URLSearchParams({ destination, checkIn, checkOut, guests });
    router.push(`/search?${params.toString()}`);
  }

  return (
    <form onSubmit={submit} className="search-shell">
      <label><span>Where</span><input value={destination} onChange={(e) => setDestination(e.target.value)} placeholder="City, beach, or landmark" minLength={2} required /></label>
      <label><span>Check in</span><input type="date" value={checkIn} onChange={(e) => setCheckIn(e.target.value)} required /></label>
      <label><span>Check out</span><input type="date" value={checkOut} onChange={(e) => setCheckOut(e.target.value)} required /></label>
      <label><span>Travelers</span><select value={guests} onChange={(e) => setGuests(e.target.value)}><option value="1">1 guest · 1 room</option><option value="2">2 guests · 1 room</option><option value="3">3 guests · 1 room</option><option value="4">4 guests · 1 room</option></select></label>
      <button type="submit"><Search className="h-5 w-5" /> Search premium stays</button>
    </form>
  );
}
