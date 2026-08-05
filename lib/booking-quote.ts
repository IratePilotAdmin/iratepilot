export function calculateBookingQuote(subtotal: number, serviceFeeRate: number) {
  const normalizedSubtotal = Math.round(subtotal * 100) / 100;
  const serviceFee = Math.round(normalizedSubtotal * serviceFeeRate * 100) / 100;
  return {
    subtotal: normalizedSubtotal,
    serviceFee,
    total: Math.round((normalizedSubtotal + serviceFee) * 100) / 100,
  };
}
