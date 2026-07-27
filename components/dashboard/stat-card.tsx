export function StatCard({ label, value, change }: { label: string; value: string; change: string }) {
  return (
    <div className="card p-6">
      <div className="text-sm text-slate-500">{label}</div>
      <div className="mt-2 text-3xl font-bold">{value}</div>
      <div className="mt-2 text-sm font-medium text-emerald-600">{change}</div>
    </div>
  );
}
