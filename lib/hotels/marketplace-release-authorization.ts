type MarketplaceReleaseAuthorizationRpcClient = {
  rpc: (name: "has_current_hotel_marketplace_release_authorization") => PromiseLike<{
    data: boolean | null;
    error: unknown;
  }>;
};

export async function hasCurrentHotelMarketplaceReleaseAuthorization(
  client: MarketplaceReleaseAuthorizationRpcClient,
) {
  try {
    const { data, error } = await client.rpc("has_current_hotel_marketplace_release_authorization");
    return !error && data === true;
  } catch {
    return false;
  }
}
