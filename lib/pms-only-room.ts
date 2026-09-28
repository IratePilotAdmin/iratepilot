type RoomProperty = { pms_only?: boolean | null };

export function isPmsOnlyRoom(properties: RoomProperty | RoomProperty[] | null | undefined): boolean {
  return Array.isArray(properties)
    ? properties.some((property) => property.pms_only === true)
    : properties?.pms_only === true;
}
