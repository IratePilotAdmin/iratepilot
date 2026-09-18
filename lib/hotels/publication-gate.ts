export function isHotelPublicationEnabled(
  env: Record<string, string | undefined> = process.env,
) {
  return env.HOTEL_PUBLICATION_ENABLED === "true";
}
