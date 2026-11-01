type BookingEmailTemplateData = Record<string, unknown>;

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}

function money(value: unknown) {
  const amount = Number(value ?? 0);
  return Number.isFinite(amount) ? `$${amount.toFixed(2)}` : "$0.00";
}

export function renderBookingEmailDetails(data: BookingEmailTemplateData) {
  const itinerary = data.supplier_itinerary_id || data.confirmation_code;
  const refundable = data.refundable === false ? "Non-refundable" : "Refundable under the cancellation terms";
  const checkinWindow = [data.checkin_begin_time, data.checkin_end_time].filter(Boolean).join(" – ");
  return `<div style="margin:24px 0;border:1px solid #e4e7ec;padding:20px">
    <h2 style="margin-top:0">Booking details</h2>
    <p><strong>Itinerary ID:</strong> ${escapeHtml(itinerary)}</p>
    <p><strong>Property:</strong> ${escapeHtml(data.property_name)}</p>
    <p><strong>Room:</strong> ${escapeHtml(data.room_name)} · ${escapeHtml(data.bed_type)}</p>
    <p><strong>Stay:</strong> ${escapeHtml(data.check_in)} to ${escapeHtml(data.check_out)}</p>
    <p><strong>Travelers:</strong> ${escapeHtml(data.guests)}${Array.isArray(data.child_ages) && data.child_ages.length ? ` · children ages ${escapeHtml(data.child_ages.join(", "))}` : ""}</p>
    <p><strong>Refundability:</strong> ${escapeHtml(refundable)}</p>
    <p><strong>Cancellation terms:</strong> ${escapeHtml(data.cancellation_policy)}</p>
    <p><strong>Check-in:</strong> ${escapeHtml(checkinWindow)}</p>
    <p><strong>Check-in instructions:</strong> ${escapeHtml(data.checkin_instructions)}</p>
    <p><strong>Special check-in instructions:</strong> ${escapeHtml(data.special_checkin_instructions)}</p>
    <table style="width:100%;border-collapse:collapse"><tbody>
      <tr><td>Room subtotal</td><td style="text-align:right">${money(data.subtotal)}</td></tr>
      <tr><td>Taxes</td><td style="text-align:right">${money(data.taxes)}</td></tr>
      <tr><td>Charges due at property</td><td style="text-align:right">${money(data.due_at_property)}</td></tr>
      <tr><td>Other fees</td><td style="text-align:right">${money(Math.max(0, Number(data.fees || 0) - Number(data.due_at_property || 0)))}</td></tr>
      <tr><td><strong>Total price</strong></td><td style="text-align:right"><strong>${money(data.total)}</strong></td></tr>
    </tbody></table>
    <p><strong>Payment timing:</strong> ${escapeHtml(data.payment_timing)}</p>
    <p><strong>Customer support:</strong> <a href="mailto:${escapeHtml(data.support_email)}">${escapeHtml(data.support_email)}</a> · <a href="${escapeHtml(data.support_url)}">Online support</a></p>
  </div>`;
}
