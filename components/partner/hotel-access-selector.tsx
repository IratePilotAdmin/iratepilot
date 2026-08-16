"use client";

import type { PartnerHotelAccess } from "@/lib/partner/hotel-access";

type HotelAccessSelectorProps = {
  options: PartnerHotelAccess[];
  value: string;
  onChange: (partnerId: string) => void;
  disabled?: boolean;
};

export function HotelAccessSelector({
  options,
  value,
  onChange,
  disabled = false,
}: HotelAccessSelectorProps) {
  if (options.length < 2) return null;

  return (
    <section className="card p-5">
      <label className="text-sm font-medium">
        Hotel organization
        <select
          className="input mt-2"
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
          value={value}
        >
          <option value="">Select an organization</option>
          {options.map((option) => (
            <option key={option.partnerId} value={option.partnerId}>
              {option.partnerName} — {option.role.replaceAll("_", " ")}
            </option>
          ))}
        </select>
      </label>
      <p className="mt-2 text-xs text-slate-500">
        Choose the organization whose properties, rooms, rates, and inventory you want to manage.
      </p>
    </section>
  );
}
