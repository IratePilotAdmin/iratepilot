"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Headphones, LoaderCircle, ShieldAlert } from "lucide-react";

import { formatConsumerFlightDateTime, formatConsumerFlightStatus } from "./types";
import {
  flightConsumerPreviewServiceRequestReasonLabel,
  flightConsumerPreviewServiceRequestReasons,
  flightConsumerPreviewServiceRequestTypeLabel,
  flightConsumerPreviewServiceRequestTypes,
  type FlightConsumerPreviewServiceRequestDto,
  type FlightConsumerPreviewServiceRequestType,
} from "@/lib/flights/consumer-preview/service-request-contract";

type SubmissionState = "idle" | "submitting" | "success" | "error";
const unresolvedStatuses = new Set([
  "requested",
  "quoted",
  "accepted",
  "processing",
  "requires_review",
]);

export function ConsumerFlightPreviewServiceRequests({
  enabled,
  available,
  orderId,
  orderStatus,
  requests,
}: {
  enabled: boolean;
  available: boolean;
  orderId: string;
  orderStatus: string;
  requests: readonly FlightConsumerPreviewServiceRequestDto[];
}) {
  const router = useRouter();
  const [requestType, setRequestType] = useState<FlightConsumerPreviewServiceRequestType>("cancel");
  const [reasonCode, setReasonCode] = useState(
    flightConsumerPreviewServiceRequestReasons.cancel[0].code,
  );
  const [submission, setSubmission] = useState<SubmissionState>("idle");
  const idempotencyKey = useRef<string | null>(null);
  const canCreate = enabled && available && orderStatus === "ticketed";
  const alreadyRecorded = requests.some((request) => (
    request.requestType === requestType
    && request.reasonCode === reasonCode
    && unresolvedStatuses.has(request.status)
  ));

  function chooseRequestType(next: FlightConsumerPreviewServiceRequestType) {
    setRequestType(next);
    setReasonCode(flightConsumerPreviewServiceRequestReasons[next][0].code);
    setSubmission("idle");
    idempotencyKey.current = null;
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canCreate || alreadyRecorded || submission === "submitting") return;
    setSubmission("submitting");
    idempotencyKey.current ??= window.crypto.randomUUID();
    try {
      const response = await fetch(
        `/api/flights/preview/orders/${encodeURIComponent(orderId)}/service-requests`,
        {
          method: "POST",
          credentials: "same-origin",
          headers: {
            "Content-Type": "application/json",
            "Idempotency-Key": idempotencyKey.current,
          },
          body: JSON.stringify({ requestType, reasonCode }),
        },
      );
      if (!response.ok) throw new Error("support request rejected");
      idempotencyKey.current = null;
      setSubmission("success");
      router.refresh();
    } catch {
      setSubmission("error");
    }
  }

  return (
    <section className="border-t border-neutral-300 p-7 sm:p-10" aria-labelledby="preview-support-title">
      <div className="flex items-start gap-4">
        <Headphones aria-hidden="true" className="mt-1 h-7 w-7" />
        <div>
          <h3 id="preview-support-title" className="text-2xl">Test support requests</h3>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-neutral-600">Record a bounded reason for staff review. This local Preview intake cannot contact Duffel, change a test order, cancel a test ticket, or move test money.</p>
        </div>
      </div>

      {!available ? (
        <div className="mt-6 flex items-start gap-3 border border-red-300 bg-red-50 p-4 text-sm text-red-950" role="alert"><ShieldAlert aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0" /><p>The local support ledger is unavailable. Existing request status is not being inferred, and new intake is disabled.</p></div>
      ) : requests.length ? (
        <ul className="mt-6 grid gap-3" aria-label="Recorded test support requests">
          {requests.map((request) => (
            <li key={request.id} className="border border-neutral-300 bg-neutral-50 p-4 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <strong className="capitalize">{flightConsumerPreviewServiceRequestTypeLabel(request.requestType)}</strong>
                <span className="border border-neutral-300 bg-white px-2 py-1 text-xs font-semibold uppercase tracking-[.1em]">{formatConsumerFlightStatus(request.status)}</span>
              </div>
              <p className="mt-2 text-neutral-600">{flightConsumerPreviewServiceRequestReasonLabel(request.requestType, request.reasonCode)}</p>
              <p className="mt-2 text-xs text-neutral-500">Recorded <time dateTime={request.createdAt}>{formatConsumerFlightDateTime(request.createdAt)}</time></p>
            </li>
          ))}
        </ul>
      ) : <p className="mt-6 border border-dashed border-neutral-300 p-4 text-sm text-neutral-600">No test support request is recorded for this order.</p>}

      {canCreate ? (
        <form className="mt-6 grid gap-4 border border-neutral-300 bg-neutral-50 p-5 sm:grid-cols-2" onSubmit={submit}>
          <label className="text-sm font-semibold">Request type
            <select className="mt-2 w-full border border-neutral-400 bg-white px-3 py-2 font-normal" value={requestType} onChange={(event) => chooseRequestType(event.target.value as FlightConsumerPreviewServiceRequestType)}>
              {flightConsumerPreviewServiceRequestTypes.map((value) => <option key={value} value={value}>{flightConsumerPreviewServiceRequestTypeLabel(value)}</option>)}
            </select>
          </label>
          <label className="text-sm font-semibold">Reason
            <select className="mt-2 w-full border border-neutral-400 bg-white px-3 py-2 font-normal" value={reasonCode} onChange={(event) => { setReasonCode(event.target.value); setSubmission("idle"); idempotencyKey.current = null; }}>
              {flightConsumerPreviewServiceRequestReasons[requestType].map(({ code, label }) => <option key={code} value={code}>{label}</option>)}
            </select>
          </label>
          <div className="sm:col-span-2">
            <button type="submit" className="btn-secondary gap-2" disabled={submission === "submitting" || alreadyRecorded}>{submission === "submitting" ? <LoaderCircle aria-hidden="true" className="h-4 w-4 animate-spin" /> : null}{alreadyRecorded ? "Already recorded" : "Record for test review"}</button>
            <div className="mt-3 text-sm" aria-live="polite">
              {submission === "success" ? <p className="text-emerald-800">The durable test support request was recorded.</p> : null}
              {submission === "error" ? <p className="text-red-800">The request was not recorded safely. Retry with the same selection or review the durable list.</p> : null}
            </div>
          </div>
        </form>
      ) : available ? (
        <div className="mt-6 flex items-start gap-3 border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950"><ShieldAlert aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0" /><p>New support intake opens only for a finalized, ticketed Consumer Preview order. Existing request records remain visible.</p></div>
      ) : null}
    </section>
  );
}
