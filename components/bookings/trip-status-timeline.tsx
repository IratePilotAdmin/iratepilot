import { Check } from "lucide-react";
import {
  formatBookingHistoryTimestamp,
  getBookingStatusLabel,
  sortBookingStatusHistory,
  type BookingStatusHistoryEntry,
} from "@/lib/bookings/status-history";

export function TripStatusTimeline({ entries }: { entries: BookingStatusHistoryEntry[] }) {
  const history = sortBookingStatusHistory(entries);
  if (!history.length) return null;

  return (
    <details className="mt-4 border-t border-neutral-200 pt-4">
      <summary className="cursor-pointer text-xs font-semibold uppercase tracking-[.12em] text-neutral-600">
        Status history ({history.length})
      </summary>
      <ol className="mt-5 space-y-4 border-l border-neutral-300 pl-5">
        {history.map((entry, index) => (
          <li key={`${entry.created_at}-${entry.status}-${index}`} className="relative">
            <span className="absolute -left-[29px] top-0 grid h-4 w-4 place-items-center rounded-full bg-black text-white">
              <Check className="h-2.5 w-2.5" />
            </span>
            <strong className="text-sm capitalize">{getBookingStatusLabel(entry.status)}</strong>
            <time dateTime={entry.created_at} className="ml-2 text-xs text-neutral-500">
              {formatBookingHistoryTimestamp(entry.created_at)}
            </time>
            {entry.note && <p className="mt-1 text-sm leading-6 text-neutral-600">{entry.note}</p>}
          </li>
        ))}
      </ol>
    </details>
  );
}
