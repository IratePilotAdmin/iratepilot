export type IntegrationConnectionHealthInput = {
  enabled: boolean;
  has_secret: boolean;
  room_types: Record<string, string> | null;
  inventory_authority: string;
};

export type IntegrationDeliveryHealthInput = {
  certified: boolean;
  outbound_enabled: boolean;
  pending: number;
  retrying: number;
  dead_letter: number;
  refresh_pending: number;
  refresh_blocked: number;
  last_delivered_at: string | null;
  certification_gates_passed: number;
  certification_gates_required: number;
};

export type IntegrationHealth = {
  inbound: { state: 'disabled' | 'setup_needed' | 'ready'; label: string; detail: string };
  outbound: { state: 'disabled' | 'setup_needed' | 'attention' | 'pending' | 'awaiting_first_delivery' | 'delivery_recorded'; label: string; detail: string };
  queue: { waiting: number; retrying: number; needs_review: number };
};

const count = (value: unknown) => Number.isSafeInteger(value) && Number(value) >= 0 ? Number(value) : null;

/** Summarize saved connector configuration and queue evidence without claiming that an OTA is reachable. */
export function integrationHealth(connection: IntegrationConnectionHealthInput, delivery: IntegrationDeliveryHealthInput | undefined): IntegrationHealth {
  const mappings = connection.room_types && typeof connection.room_types === 'object' && !Array.isArray(connection.room_types)
    ? Object.keys(connection.room_types).length
    : 0;
  const inbound = !connection.enabled
    ? { state: 'disabled' as const, label: 'Inbound reservations disabled', detail: 'This connection will not accept OTA reservation events.' }
    : !connection.has_secret || mappings === 0
      ? { state: 'setup_needed' as const, label: 'Inbound setup needs attention', detail: !connection.has_secret ? 'Add the signing secret before enabling reservation delivery.' : 'Map at least one OTA room type before accepting reservations.' }
      : { state: 'ready' as const, label: 'Inbound configuration saved', detail: `${mappings} OTA room mapping${mappings === 1 ? '' : 's'} configured. Provider delivery is not verified by this status.` };

  if (!delivery) {
    return { inbound, outbound: { state: 'setup_needed', label: 'Outbound status unavailable', detail: 'Refresh the connection status. No delivery-health record was returned.' }, queue: { waiting: 0, retrying: 0, needs_review: 0 } };
  }

  const pending = count(delivery.pending), retrying = count(delivery.retrying), deadLetter = count(delivery.dead_letter);
  const refreshPending = count(delivery.refresh_pending), refreshBlocked = count(delivery.refresh_blocked);
  const gatesPassed = count(delivery.certification_gates_passed), gatesRequired = count(delivery.certification_gates_required);
  if ([pending, retrying, deadLetter, refreshPending, refreshBlocked, gatesPassed, gatesRequired].some(value => value === null) || gatesPassed! > gatesRequired!) {
    return { inbound, outbound: { state: 'setup_needed', label: 'Outbound status unavailable', detail: 'The saved delivery counters are invalid. Refresh or contact support.' }, queue: { waiting: 0, retrying: 0, needs_review: 0 } };
  }

  const queue = { waiting: pending! + refreshPending!, retrying: retrying!, needs_review: deadLetter! + refreshBlocked! };
  let outbound: IntegrationHealth['outbound'];
  if (queue.needs_review > 0) {
    outbound = { state: 'attention', label: 'Outbound updates need review', detail: `${queue.needs_review} blocked or failed update${queue.needs_review === 1 ? '' : 's'} require review.` };
  } else if (connection.inventory_authority !== 'iratepilot-pms' || mappings === 0 || !delivery.certified || gatesPassed! < gatesRequired!) {
    outbound = { state: 'setup_needed', label: 'Outbound setup needs attention', detail: connection.inventory_authority !== 'iratepilot-pms'
      ? 'Set iRatePilot PMS as inventory authority before publishing.'
      : mappings === 0
        ? 'Map at least one OTA room type before publishing inventory.'
      : `${gatesPassed} of ${gatesRequired} required property/provider approval checks are recorded. Complete the remaining checks before publishing.` };
  } else if (!delivery.outbound_enabled) {
    outbound = { state: 'disabled', label: 'Outbound publishing disabled', detail: 'Rates and availability are not being sent to this channel.' };
  } else if (queue.waiting > 0 || queue.retrying > 0) {
    outbound = { state: 'pending', label: 'Outbound updates are in progress', detail: `${queue.waiting} waiting and ${queue.retrying} retrying. Queue status does not confirm OTA receipt.` };
  } else if (!delivery.last_delivered_at || !Number.isFinite(Date.parse(delivery.last_delivered_at))) {
    outbound = { state: 'awaiting_first_delivery', label: 'Enabled; no successful delivery recorded', detail: 'The connector is enabled, but no successful delivery timestamp is available.' };
  } else {
    outbound = { state: 'delivery_recorded', label: 'A successful delivery is recorded', detail: `Last recorded delivery: ${delivery.last_delivered_at}. This does not confirm current OTA availability.` };
  }
  return { inbound, outbound, queue };
}
