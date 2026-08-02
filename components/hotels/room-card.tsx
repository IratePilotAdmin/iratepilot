import { formatCurrency } from "@/lib/utils";

export function RoomCard({ name, price, notes, bookable }: { name: string; price: number; notes: string[]; bookable: boolean }) {
  return (
    <div className="card grid gap-6 p-6 md:grid-cols-[1fr_auto]">
      <div>
        <h3 className="text-lg font-semibold">{name}</h3>
        <ul className="mt-3 grid gap-1 text-sm text-slate-600">
          {notes.map((note) => <li key={note}>✓ {note}</li>)}
        </ul>
      </div>
      <div className="text-right">
        <div className="text-2xl font-bold">{formatCurrency(price)}</div>
        <div className="text-xs text-slate-500">per night, taxes extra</div>
        {bookable ? <a href="#booking-request" className="btn-primary mt-4">Check availability</a> : <span className="badge mt-4">Demonstration only</span>}
      </div>
    </div>
  );
}
