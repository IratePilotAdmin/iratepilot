import { hotelPartnerFeeSchedule } from "../config/fees";

const MAX_PARTNER_FINANCIAL_GROSS_CENTS = 999_999_999_999;

export function calculatePartnerFinancials(subtotal: number) {
  if (!Number.isFinite(subtotal) || subtotal < 0) {
    throw new RangeError("Partner financial subtotal must be a finite, non-negative amount.");
  }

  const scaledSubtotal = subtotal * 100;
  const grossCents = Math.round(scaledSubtotal);
  const centTolerance = Number.EPSILON * Math.max(1, Math.abs(scaledSubtotal)) * 4;
  if (Math.abs(scaledSubtotal - grossCents) > centTolerance) {
    throw new RangeError("Partner financial subtotal cannot contain fractional cents.");
  }
  if (!Number.isSafeInteger(grossCents) || grossCents > MAX_PARTNER_FINANCIAL_GROSS_CENTS) {
    throw new RangeError("Partner financial subtotal exceeds numeric(12,2).");
  }

  const commissionCents = Math.round(
    grossCents * hotelPartnerFeeSchedule.partnerCommissionRateBps / 10_000,
  );
  const rewardProgramFeeCents = Math.round(
    grossCents * hotelPartnerFeeSchedule.rewardProgramFeeRateBps / 10_000,
  );
  const partnerNetCents = grossCents - commissionCents - rewardProgramFeeCents;

  if (partnerNetCents < 0) {
    throw new RangeError("Partner fee schedule cannot produce a negative partner net.");
  }

  return {
    feeScheduleVersion: hotelPartnerFeeSchedule.version,
    partnerCommissionRateBps: hotelPartnerFeeSchedule.partnerCommissionRateBps,
    rewardProgramFeeRateBps: hotelPartnerFeeSchedule.rewardProgramFeeRateBps,
    gross: grossCents / 100,
    commission: commissionCents / 100,
    rewardProgramFee: rewardProgramFeeCents / 100,
    partnerNet: partnerNetCents / 100,
  };
}
