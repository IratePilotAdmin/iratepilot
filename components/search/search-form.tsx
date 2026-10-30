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
  const initialChildAges = initialValues?.childAges
    ? initialValues.childAges.split(",").filter(Boolean)
    : [];
  const initialGuestCount = Number(initialValues?.guests || 2);
  const [adults, setAdults] = useState(String(Math.max(1, initialGuestCount - initialChildAges.length)));
  const [childAges, setChildAges] = useState<string[]>(initialChildAges);

  function setChildCount(count: number) {
    setChildAges((current) => Array.from({ length: count }, (_, index) => current[index] ?? "0"));
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const guests = String(Number(adults) + childAges.length);
    const params = new URLSearchParams({
      destination,
      checkIn,
      checkOut,
      guests,
      childAges: childAges.join(","),
    });
    router.push(`/search?${params.toString()}`);
  }

  return (
    <form onSubmit={submit} className="search-shell">
      <label><span>Where</span><input value={destination} onChange={(e) => setDestination(e.target.value)} placeholder="City, beach, or landmark" minLength={2} required /></label>
      <label><span>Check in</span><input type="date" value={checkIn} onChange={(e) => setCheckIn(e.target.value)} required /></label>
      <label><span>Check out</span><input type="date" value={checkOut} onChange={(e) => setCheckOut(e.target.value)} required /></label>
      <label><span>Adults</span><select aria-label="Adults" value={adults} onChange={(e) => setAdults(e.target.value)}>{[1, 2, 3, 4, 5, 6, 7, 8].map((count) => <option key={count} value={count}>{count} {count === 1 ? "adult" : "adults"}</option>)}</select></label>
      <label><span>Children</span><select aria-label="Children" value={childAges.length} onChange={(e) => setChildCount(Number(e.target.value))}>{[0, 1, 2, 3, 4].map((count) => <option key={count} value={count}>{count} {count === 1 ? "child" : "children"}</option>)}</select></label>
      {childAges.map((age, index) => (
        <label key={index}><span>Child {index + 1} age</span><select aria-label={`Child ${index + 1} age`} value={age} onChange={(e) => setChildAges((current) => current.map((item, itemIndex) => itemIndex === index ? e.target.value : item))}>{Array.from({ length: 18 }, (_, childAge) => <option key={childAge} value={childAge}>{childAge}</option>)}</select></label>
      ))}
      <button type="submit"><Search className="h-5 w-5" /> Search premium stays</button>
    </form>
  );
}
