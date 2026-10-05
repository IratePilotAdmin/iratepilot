// Compatibility marker only; never an authentication or authorization credential.
// Server enforcement requires the separately rehearsed database gate.
export const pmsContract='reviewed-checkout-v1';
export const pmsContractHeaders={'x-irp-contract':pmsContract} as const;
