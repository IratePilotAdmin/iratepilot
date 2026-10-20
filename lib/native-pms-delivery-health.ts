export type NativePmsDeliveryHealth = {
  level: "paused" | "clear" | "attention";
  reviewEvents: number;
  expiredLeases: number;
  overdueEvents: number;
  deliveryEnabledConnections: number;
  checkedAt: string;
};

type Counts = {
  reviewEvents: number;
  expiredLeases: number;
  overduePending: number;
  overdueRetry: number;
  deliveryEnabledConnections: number;
};

export function assessNativePmsDeliveryHealth(counts: Counts, checkedAt: string): NativePmsDeliveryHealth {
  const overdueEvents = counts.overduePending + counts.overdueRetry;
  const needsAttention = counts.reviewEvents > 0 || counts.expiredLeases > 0
    || (counts.deliveryEnabledConnections > 0 && overdueEvents > 0);
  return {
    level: needsAttention ? "attention" : counts.deliveryEnabledConnections === 0 ? "paused" : "clear",
    reviewEvents: counts.reviewEvents,
    expiredLeases: counts.expiredLeases,
    overdueEvents,
    deliveryEnabledConnections: counts.deliveryEnabledConnections,
    checkedAt,
  };
}
