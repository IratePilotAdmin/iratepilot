type PaymentAuthorizationRpcClient = {
  rpc: (name: "has_current_hotel_payment_launch_authorization") => PromiseLike<{
    data: boolean | null;
    error: unknown;
  }>;
};

export async function hasCurrentLivePaymentAuthorization(client: PaymentAuthorizationRpcClient) {
  try {
    const { data, error } = await client.rpc("has_current_hotel_payment_launch_authorization");
    return !error && data === true;
  } catch {
    return false;
  }
}
