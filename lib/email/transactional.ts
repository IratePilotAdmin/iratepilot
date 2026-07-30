export type TransactionalEmailInput = {
  to: string;
  subject: string;
  html: string;
  text?: string;
};

export async function sendTransactionalEmail(
  input: TransactionalEmailInput,
) {
  const apiKey = process.env.RESEND_API_KEY;
  const from =
    process.env.RESEND_FROM_EMAIL ||
    process.env.EMAIL_FROM;

  if (!apiKey) {
    throw new Error("RESEND_API_KEY is not configured");
  }

  if (!from) {
    throw new Error("RESEND_FROM_EMAIL is not configured");
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [input.to],
      subject: input.subject,
      html: input.html,
      text: input.text,
      reply_to: process.env.EMAIL_REPLY_TO || undefined,
    }),
  });

  const result = await response.json();

  if (!response.ok) {
    throw new Error(
      result?.message || `Resend request failed with ${response.status}`,
    );
  }

  return result as { id: string };
}