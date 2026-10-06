type PaymentAuthorizationRpcClient = {
  rpc: (
    name: "has_current_hotel_payment_launch_authorization",
    args: { p_stripe_account_reference: string },
  ) => PromiseLike<{
    data: boolean | null;
    error: unknown;
  }>;
};

export async function hasCurrentLivePaymentAuthorization(
  client: PaymentAuthorizationRpcClient,
  stripeAccountReference = process.env.STRIPE_LIVE_ACCOUNT_ID,
) {
  const normalizedReference = stripeAccountReference?.trim() ?? "";
  if (!/^acct_[A-Za-z0-9]{8,127}$/.test(normalizedReference)) return false;
  try {
    const { data, error } = await client.rpc("has_current_hotel_payment_launch_authorization", {
      p_stripe_account_reference: normalizedReference,
    });
    return !error && data === true;
  } catch {
    return false;
  }
}
