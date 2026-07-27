"use client";

import { Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function SearchForm() {
  const router = useRouter();
  const [destination, setDestination] = useState("Miami Beach");
  const [checkIn, setCheckIn] = useState("");
  const [checkOut, setCheckOut] = useState("");

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const params = new URLSearchParams({ destination, checkIn, checkOut, guests: "2" });
    router.push(`/search?${params.toString()}`);
  }

  return (
    <form onSubmit={submit} className="search-shell">
      <label><span>Where</span><input value={destination} onChange={(e) => setDestination(e.target.value)} placeholder="City, beach, or landmark" /></label>
      <label><span>Check in</span><input type="date" value={checkIn} onChange={(e) => setCheckIn(e.target.value)} /></label>
      <label><span>Check out</span><input type="date" value={checkOut} onChange={(e) => setCheckOut(e.target.value)} /></label>
      <label><span>Travelers</span><select><option>2 guests · 1 room</option><option>1 guest · 1 room</option><option>3 guests · 1 room</option><option>4 guests · 2 rooms</option></select></label>
      <button><Search className="h-5 w-5" /> Search premium stays</button>
    </form>
  );
}
