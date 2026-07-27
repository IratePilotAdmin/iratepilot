import Link from "next/link";
import { formatCurrency } from "@/lib/utils";

export function RoomCard({ name, price, perks }: { name: string; price: number; perks: string[] }) {
  return (
    <div className="card grid gap-6 p-6 md:grid-cols-[1fr_auto]">
      <div>
        <h3 className="text-lg font-semibold">{name}</h3>
        <ul className="mt-3 grid gap-1 text-sm text-slate-600">
          {perks.map((perk) => <li key={perk}>✓ {perk}</li>)}
        </ul>
      </div>
      <div className="text-right">
        <div className="text-2xl font-bold">{formatCurrency(price)}</div>
        <div className="text-xs text-slate-500">per night, taxes extra</div>
        <Link href="/checkout" className="btn-primary mt-4">Reserve</Link>
      </div>
    </div>
  );
}
