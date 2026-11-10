import {
  isValidEmailSender,
  isValidHttpsWebhook,
} from "./readiness-value-validation";

export type AirbnbSupportControl = {
  id: string;
  label: string;
  implemented: boolean;
  configured: boolean;
  evidence: string;
};

export type AirbnbSupportReadiness = {
  status: "evidence_only";
  eligibilityDetermined: false;
  controls: readonly AirbnbSupportControl[];
};

type Environment = Record<string, string | undefined>;

const present = (value: string | undefined) => Boolean(value?.trim());

export function buildAirbnbSupportReadiness(
  environment: Environment,
): AirbnbSupportReadiness {
  const transactionalEmailConfigured = present(environment.RESEND_API_KEY)
    && isValidEmailSender(environment.RESEND_FROM_EMAIL || environment.EMAIL_FROM)
    && environment.EMAIL_WORKER_ENABLED === "true";

  return {
    status: "evidence_only",
    eligibilityDetermined: false,
    controls: [
      {
        id: "reservation_message_center",
        label: "Reservation-linked guest messaging",
        implemented: true,
        configured: true,
        evidence: "Customers can contact the property team from an existing reservation, keeping the conversation linked to the booking.",
      },
      {
        id: "partner_reply_workflow",
        label: "Property-team reply workflow",
        implemented: true,
        configured: true,
        evidence: "The partner message center lets property teams answer guest questions in the reservation conversation.",
      },
      {
        id: "admin_case_queue",
        label: "Admin support case queue",
        implemented: true,
        configured: true,
        evidence: "An admin-only queue supports search, status counts, in-progress handling, resolution, and reopening.",
      },
      {
        id: "transactional_customer_updates",
        label: "Transactional booking updates",
        implemented: true,
        configured: transactionalEmailConfigured,
        evidence: "Booking request, approval, decline, payment, cancellation, and refund events are queued with deduplication for customer delivery.",
      },
      {
        id: "support_reply_address",
        label: "Monitored support reply address",
        implemented: true,
        configured: present(environment.EMAIL_REPLY_TO),
        evidence: "Booking notices can expose a dedicated reply address alongside the authenticated reservation support page.",
      },
      {
        id: "operational_escalation",
        label: "Operational error escalation",
        implemented: true,
        configured: isValidHttpsWebhook(environment.ERROR_WEBHOOK_URL),
        evidence: "Operational failures are logged with sensitive context redacted and can be delivered to a bounded alert webhook.",
      },
    ],
  };
}
