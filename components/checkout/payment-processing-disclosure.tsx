import {
  formatExpediaPaymentProcessingDisclosure,
  type LodgingMerchantOfRecord,
} from "@/lib/expedia-rapid/payment-processing-disclosure";

export function PaymentProcessingDisclosure({
  merchantOfRecord,
  processingCountryCode,
}: {
  merchantOfRecord: LodgingMerchantOfRecord;
  processingCountryCode?: string | null;
}) {
  if (merchantOfRecord !== "expedia") return null;
  if (!processingCountryCode) {
    throw new Error("Expedia checkout requires a payment processing country.");
  }

  return (
    <aside
      aria-label="Payment processing location"
      className="mt-4 rounded-xl border-2 border-violet-600 bg-violet-50 p-4 text-sm font-semibold text-violet-950"
      role="note"
    >
      {formatExpediaPaymentProcessingDisclosure(processingCountryCode)}
    </aside>
  );
}
