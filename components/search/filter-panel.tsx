import { formatCurrency } from "@/lib/utils";

type FilterPanelProps = {
  maxPrice: number;
  highestPrice: number;
  fourStar: boolean;
  fiveStar: boolean;
  filtersChanged: boolean;
  onMaxPriceChange: (value: number) => void;
  onFourStarChange: (checked: boolean) => void;
  onFiveStarChange: (checked: boolean) => void;
  onReset: () => void;
};

export function FilterPanel({
  maxPrice,
  highestPrice,
  fourStar,
  fiveStar,
  filtersChanged,
  onMaxPriceChange,
  onFourStarChange,
  onFiveStarChange,
  onReset,
}: FilterPanelProps) {
  return (
    <aside className="card h-fit p-5">
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-semibold">Filter results</h3>
        <button
          type="button"
          className="text-xs font-bold text-violet-700 disabled:text-slate-400"
          disabled={!filtersChanged}
          onClick={onReset}
        >
          Reset
        </button>
      </div>
      <div className="mt-5 grid gap-5 text-sm">
        <label className="grid gap-2">
          <span className="flex justify-between gap-3">
            <span>Maximum nightly price</span>
            <strong>{formatCurrency(maxPrice)}</strong>
          </span>
          <input
            type="range"
            min="100"
            max={highestPrice}
            step="50"
            value={maxPrice}
            onChange={(event) => onMaxPriceChange(Number(event.target.value))}
          />
        </label>
        <div>
          <div className="font-medium">Property class</div>
          <label className="mt-2 flex gap-2">
            <input
              type="checkbox"
              checked={fiveStar}
              onChange={(event) => onFiveStarChange(event.target.checked)}
            /> 5-star
          </label>
          <label className="mt-2 flex gap-2">
            <input
              type="checkbox"
              checked={fourStar}
              onChange={(event) => onFourStarChange(event.target.checked)}
            /> 4-star
          </label>
        </div>
      </div>
    </aside>
  );
}
