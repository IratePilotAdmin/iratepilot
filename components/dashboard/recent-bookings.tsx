const rows = [
  ["IRP-10482", "Azure Grand Miami", "S. Williams", "$1,238", "Confirmed"],
  ["IRP-10481", "Navarre Luxury Villa", "A. Johnson", "$2,670", "Confirmed"],
  ["IRP-10480", "Palm Reserve Orlando", "M. Garcia", "$987", "Pending"],
  ["IRP-10479", "Harbor House Charleston", "R. Smith", "$742", "Confirmed"]
];

export function RecentBookings() {
  return (
    <div className="card overflow-hidden">
      <div className="border-b border-slate-200 p-5 font-semibold">Recent bookings</div>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-slate-500"><tr>{["Booking", "Property", "Guest", "Total", "Status"].map(h => <th key={h} className="px-5 py-3">{h}</th>)}</tr></thead>
          <tbody>{rows.map(row => <tr key={row[0]} className="border-t border-slate-100">{row.map(cell => <td key={cell} className="px-5 py-4">{cell}</td>)}</tr>)}</tbody>
        </table>
      </div>
    </div>
  );
}
