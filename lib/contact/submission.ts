export const CONTACT_SUBMISSION_UNCONFIRMED =
  "We could not confirm receipt of your message. Your details are still in the form. Please try again.";

type ContactSubmissionResult = { received: boolean; message: string };

export async function submitContactMessage(
  data: Record<string, FormDataEntryValue>,
): Promise<ContactSubmissionResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);
  try {
    const response = await fetch("/api/contact", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(data),
      signal: controller.signal,
    });
    const payload: unknown = await response.json().catch(() => null);
    const result = payload && typeof payload === "object" && !Array.isArray(payload)
      ? payload as Record<string, unknown>
      : null;
    if (response.ok) {
      return response.status === 201 && result?.status === "received"
        ? { received: true, message: "Message received. Our team will follow up." }
        : { received: false, message: CONTACT_SUBMISSION_UNCONFIRMED };
    }
    if (response.status === 429) {
      return { received: false, message: "Too many messages were sent. Please wait a few minutes and try again." };
    }
    const error = typeof result?.error === "string" ? result.error.replace(/\s+/g, " ").trim() : "";
    return {
      received: false,
      message: error && error.length <= 300 ? error : "Unable to send your message. Please try again.",
    };
  } catch {
    return { received: false, message: CONTACT_SUBMISSION_UNCONFIRMED };
  } finally {
    clearTimeout(timeout);
  }
}
