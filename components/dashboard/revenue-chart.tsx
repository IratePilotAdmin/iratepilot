export function RevenueChart() {
  const values = [42, 58, 51, 68, 74, 82, 78, 92, 88, 105, 118, 126];
  return (
    <div className="card p-6">
      <div className="font-semibold">Revenue trend</div>
      <div className="mt-6 flex h-52 items-end gap-3">
        {values.map((value, index) => (
          <div key={index} className="flex flex-1 flex-col items-center gap-2">
            <div className="w-full rounded-t-lg bg-brand-500" style={{ height: `${value}px` }} />
            <span className="text-[10px] text-slate-400">{index + 1}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
