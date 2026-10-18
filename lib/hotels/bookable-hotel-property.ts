type BookableHotelPropertyRpcClient = {
  rpc: (
    name: "has_current_bookable_hotel_property",
    args: { p_property_id: string },
  ) => PromiseLike<{ data: boolean | null; error: unknown }>;
};

export async function hasCurrentBookableHotelProperty(
  client: BookableHotelPropertyRpcClient,
  propertyId: string,
) {
  try {
    const { data, error } = await client.rpc("has_current_bookable_hotel_property", {
      p_property_id: propertyId,
    });
    return !error && data === true;
  } catch {
    return false;
  }
}
