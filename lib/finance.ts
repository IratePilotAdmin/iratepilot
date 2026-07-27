export function calculatePartnerFinancials(subtotal: number) {
  const gross = Math.round(subtotal * 100) / 100;
  const commission = Math.round(gross * 0.1 * 100) / 100;
  const partnerNet = Math.round((gross - commission) * 100) / 100;
  return { gross, commission, partnerNet };
}
