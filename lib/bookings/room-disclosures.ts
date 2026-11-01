export type RoomBookingDisclosures = {
  direct_bed_type?: string | null;
  direct_refundable?: boolean | null;
  direct_cancellation_policy?: string | null;
  direct_checkin_begin_time?: string | null;
  direct_checkin_instructions?: string | null;
  direct_special_checkin_instructions?: string | null;
};

export function hasCompleteRoomBookingDisclosures(room: RoomBookingDisclosures) {
  return Boolean(
    room.direct_bed_type?.trim()
    && typeof room.direct_refundable === "boolean"
    && room.direct_cancellation_policy?.trim()
    && room.direct_cancellation_policy.trim().length >= 10
    && room.direct_checkin_begin_time?.trim()
    && room.direct_checkin_instructions?.trim()
    && room.direct_checkin_instructions.trim().length >= 10
    && room.direct_special_checkin_instructions?.trim()
  );
}
