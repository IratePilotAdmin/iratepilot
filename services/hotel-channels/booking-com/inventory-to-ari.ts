import {
  buildBookingComAriRequests,
  type BookingComAriDelta,
  type BookingComAriRequest,
} from "./ari";

export type LocalInventorySnapshot = {
  roomId: string;
  date: string;
  availableUnits: number;
  nightlyRate: string | number;
};

export type BookingComRoomMapping = {
  providerRoomTypeId: string;
  providerRatePlanId: string;
  localRoomId: string;
};

export type BookingComInventoryPlan = {
  channelPropertyId: string;
  currency: string;
  priceBasis: "before_tax" | "after_tax";
  propertyRoomIds: readonly string[];
  mappings: readonly BookingComRoomMapping[];
  inventory: readonly LocalInventorySnapshot[];
  now?: Date;
};

const MAX_DELTAS_PER_REQUEST = 500;

function currencyDigits(currency: string) {
  try {
    if (!/^[A-Z]{3}$/.test(currency) || currency === "XXX") throw new Error();
    const digits = new Intl.NumberFormat("en", { style: "currency", currency }).resolvedOptions().maximumFractionDigits;
    if (typeof digits !== "number" || !Number.isInteger(digits) || digits < 0 || digits > 3) throw new Error();
    return digits;
  } catch {
    throw new Error("unsupported_currency");
  }
}

function parseMinorUnits(rate: string | number, digits: number) {
  const value = typeof rate === "number" ? String(rate) : rate;
  const match = /^(0|[1-9]\d{0,7})(?:\.(\d{1,3}))?$/.exec(value);
  if (!match) throw new Error("invalid_inventory_rate");
  const fraction = match[2] ?? "";
  if (fraction.length > digits) throw new Error("inventory_rate_precision_exceeds_currency");
  const minor = Number(match[1]) * (10 ** digits) + Number(fraction.padEnd(digits, "0") || 0);
  if (!Number.isSafeInteger(minor) || minor < 1) throw new Error("invalid_inventory_rate");
  return minor;
}

/**
 * Creates explicit Booking.com ARI deltas from one property's saved inventory
 * and room/rate mappings. It sends nothing and fails closed on cross-property,
 * duplicate, over-limit, or incomplete source data.
 */
export function buildBookingComInventoryAriPlan(input: BookingComInventoryPlan): BookingComAriRequest[] {
  if (!input || !Array.isArray(input.propertyRoomIds) || !Array.isArray(input.mappings)
    || !Array.isArray(input.inventory) || input.mappings.length < 1 || input.mappings.length > 500
    || input.inventory.length > 50_000) throw new Error("invalid_inventory_plan");
  const allowedRooms = new Set(input.propertyRoomIds);
  if (allowedRooms.size !== input.propertyRoomIds.length || allowedRooms.size === 0) throw new Error("invalid_property_rooms");
  const digits = currencyDigits(input.currency);
  const mappingKeys = new Set<string>();
  const roomProviderType = new Map<string, string>();
  const roomTypeRooms = new Map<string, Set<string>>();
  for (const mapping of input.mappings) {
    if (!mapping || !allowedRooms.has(mapping.localRoomId)) throw new Error("mapping_outside_property");
    const priorProviderRoomType = roomProviderType.get(mapping.localRoomId);
    if (priorProviderRoomType && priorProviderRoomType !== mapping.providerRoomTypeId) {
      throw new Error("local_room_maps_to_multiple_provider_room_types");
    }
    roomProviderType.set(mapping.localRoomId, mapping.providerRoomTypeId);
    const mappingKey = `${mapping.providerRoomTypeId}\u0000${mapping.providerRatePlanId}`;
    if (mappingKeys.has(mappingKey)) throw new Error("duplicate_provider_mapping");
    mappingKeys.add(mappingKey);
    const localRooms = roomTypeRooms.get(mapping.providerRoomTypeId) ?? new Set<string>();
    localRooms.add(mapping.localRoomId);
    roomTypeRooms.set(mapping.providerRoomTypeId, localRooms);
  }

  const snapshots = new Map<string, LocalInventorySnapshot>();
  const snapshotsByRoom = new Map<string, LocalInventorySnapshot[]>();
  for (const snapshot of input.inventory) {
    if (!snapshot || !allowedRooms.has(snapshot.roomId)) throw new Error("inventory_outside_property");
    if (!Number.isInteger(snapshot.availableUnits) || snapshot.availableUnits < 0 || snapshot.availableUnits > 500) {
      throw new Error("invalid_inventory_units");
    }
    const key = `${snapshot.roomId}\u0000${snapshot.date}`;
    if (snapshots.has(key)) throw new Error("duplicate_inventory_snapshot");
    // Also validate every row's amount even if a room currently has no rate mapping.
    parseMinorUnits(snapshot.nightlyRate, digits);
    snapshots.set(key, snapshot);
    const roomSnapshots = snapshotsByRoom.get(snapshot.roomId) ?? [];
    roomSnapshots.push(snapshot);
    snapshotsByRoom.set(snapshot.roomId, roomSnapshots);
  }

  const deltas: BookingComAriDelta[] = [];
  const availabilityRoomTypes = [...roomTypeRooms.entries()].sort(([a], [b]) => a.localeCompare(b));
  for (const [providerRoomTypeId, localRooms] of availabilityRoomTypes) {
    const dates = new Set<string>();
    for (const roomId of localRooms) {
      for (const snapshot of snapshotsByRoom.get(roomId) ?? []) dates.add(snapshot.date);
    }
    for (const date of [...dates].sort()) {
      let available = 0;
      for (const roomId of localRooms) available += snapshots.get(`${roomId}\u0000${date}`)?.availableUnits ?? 0;
      if (available > 254) throw new Error("availability_exceeds_provider_limit");
      deltas.push({
        kind: "availability",
        channelPropertyId: input.channelPropertyId,
        roomTypeId: providerRoomTypeId,
        date,
        roomsToSell: available,
      });
    }
  }

  for (const mapping of input.mappings) {
    for (const snapshot of snapshotsByRoom.get(mapping.localRoomId) ?? []) {
      deltas.push({
        kind: "rate",
        channelPropertyId: input.channelPropertyId,
        roomTypeId: mapping.providerRoomTypeId,
        ratePlanId: mapping.providerRatePlanId,
        date: snapshot.date,
        amountMinor: parseMinorUnits(snapshot.nightlyRate, digits),
        currency: input.currency,
        priceBasis: input.priceBasis,
      });
    }
  }
  if (deltas.length === 0) throw new Error("no_mapped_inventory");

  const batches: BookingComAriRequest[] = [];
  for (let offset = 0; offset < deltas.length; offset += MAX_DELTAS_PER_REQUEST) {
    batches.push(...buildBookingComAriRequests(deltas.slice(offset, offset + MAX_DELTAS_PER_REQUEST), input.now));
  }
  return batches;
}
