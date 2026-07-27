export function FilterPanel() {
  return (
    <aside className="card h-fit p-5">
      <h3 className="font-semibold">Filter results</h3>
      <div className="mt-5 grid gap-5 text-sm">
        <label className="grid gap-2">Maximum nightly price<input type="range" min="100" max="1000" defaultValue="600" /></label>
        <div>
          <div className="font-medium">Property class</div>
          <label className="mt-2 flex gap-2"><input type="checkbox" defaultChecked /> 5-star</label>
          <label className="mt-2 flex gap-2"><input type="checkbox" defaultChecked /> 4-star</label>
        </div>
        <div>
          <div className="font-medium">Property type</div>
          <label className="mt-2 flex gap-2"><input type="checkbox" defaultChecked /> Hotel or resort</label>
          <label className="mt-2 flex gap-2"><input type="checkbox" defaultChecked /> Vacation home</label>
        </div>
      </div>
    </aside>
  );
}
