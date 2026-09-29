"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight } from "lucide-react";
import {
  clearFlightConsumerPreviewOfferAcceptanceKey,
  durableFlightConsumerPreviewOfferAcceptanceKey,
} from "@/components/flights/consumer-preview/offer-acceptance-recovery";

type AcceptResponse = {
  orderId?: unknown;
  data?: {
    orderId?: unknown;
    acceptanceRequired?: unknown;
    repriceReceiptId?: unknown;
    totalCents?: unknown;
    currency?: unknown;
  };
  error?: unknown;
};

function responseOrderId(body: AcceptResponse) {
  const candidate = body.data?.orderId ?? body.orderId;
  return typeof candidate === "string" && candidate.length > 0 ? candidate : null;
}

export function ConsumerFlightAcceptOfferButton({
  enabled,
  offerId,
  searchId,
}: {
  enabled: boolean;
  offerId: string;
  searchId: string;
}) {
  const router = useRouter();
  const idempotencyKey = useRef<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [changedPrice, setChangedPrice] = useState<{
    repriceReceiptId: string;
    totalCents: number;
    currency: string;
  } | null>(null);

  async function acceptOffer() {
    if (!enabled || busy) return;
    setBusy(true);
    setMessage("");

    try {
      const repriceReceiptId = changedPrice?.repriceReceiptId ?? null;
      idempotencyKey.current = durableFlightConsumerPreviewOfferAcceptanceKey({
        searchId,
        offerId,
        repriceReceiptId,
        storage: window.localStorage,
      });
      const response = await fetch(`/api/flights/preview/offers/${encodeURIComponent(offerId)}/accept`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": idempotencyKey.current,
        },
        body: JSON.stringify(changedPrice ? {
          searchId,
          confirmedRepriceReceiptId: changedPrice.repriceReceiptId,
          confirmChangedPrice: true,
        } : { searchId }),
      });
      const body = (await response.json().catch(() => ({}))) as AcceptResponse;
      if (
        response.status === 409
        && body.data?.acceptanceRequired === true
        && typeof body.data.repriceReceiptId === "string"
        && typeof body.data.totalCents === "number"
        && Number.isSafeInteger(body.data.totalCents)
        && typeof body.data.currency === "string"
        && /^[A-Z]{3}$/.test(body.data.currency)
      ) {
        clearFlightConsumerPreviewOfferAcceptanceKey({
          searchId,
          offerId,
          repriceReceiptId,
          storage: window.localStorage,
        });
        setChangedPrice({
          repriceReceiptId: body.data.repriceReceiptId,
          totalCents: body.data.totalCents,
          currency: body.data.currency,
        });
        idempotencyKey.current = null;
        setMessage(`The test price changed to ${new Intl.NumberFormat("en-US", {
          style: "currency",
          currency: body.data.currency,
        }).format(body.data.totalCents / 100)}. Confirm this new total to continue.`);
        setBusy(false);
        return;
      }
      const orderId = responseOrderId(body);
      if (!response.ok || !orderId) {
        const detail = typeof body.error === "string" ? body.error : "This test offer could not be accepted.";
        throw new Error(detail);
      }

      clearFlightConsumerPreviewOfferAcceptanceKey({
        searchId,
        offerId,
        repriceReceiptId,
        storage: window.localStorage,
      });
      router.push(`/flights/preview/checkout/${encodeURIComponent(orderId)}`);
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "This test offer could not be accepted.");
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        disabled={!enabled || busy}
        onClick={acceptOffer}
        className="mt-6 inline-flex items-center justify-center gap-2 bg-white px-5 py-3 text-xs font-semibold uppercase tracking-[.12em] text-black disabled:cursor-not-allowed disabled:opacity-50"
      >
        {busy ? "Revalidating…" : changedPrice ? "Confirm changed test price" : "Choose test offer"}
        {!busy ? <ArrowRight aria-hidden="true" className="h-4 w-4" /> : null}
      </button>
      <div className="mt-3 min-h-5" aria-live="polite">
        {message ? <p role="alert" className="text-xs leading-5 text-red-200">{message}</p> : null}
      </div>
    </>
  );
}
