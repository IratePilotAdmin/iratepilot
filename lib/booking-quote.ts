const currency = (value: number) => Math.round(value * 100) / 100;

export function calculateBookingQuote(
  baseSubtotal: number,
  serviceFeeRate = 0,
  memberDiscountRate = 0,
) {
  const normalizedBaseSubtotal = currency(baseSubtotal);
  const normalizedDiscountRate = Math.min(1, Math.max(0, memberDiscountRate));
  const memberDiscount = currency(normalizedBaseSubtotal * normalizedDiscountRate);
  const subtotal = currency(normalizedBaseSubtotal - memberDiscount);
  const serviceFee = currency(subtotal * serviceFeeRate);
  return {
    baseSubtotal: normalizedBaseSubtotal,
    memberDiscount,
    subtotal,
    serviceFee,
    total: currency(subtotal + serviceFee),
  };
}
