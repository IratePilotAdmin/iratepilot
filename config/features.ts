export const features = {
  aiPlanner: true,
  rewards: true,
  vacationHomes: true,
  directPartners: true,
  publicBooking: process.env.NEXT_PUBLIC_PUBLIC_BOOKING === "true",
  testCheckout: process.env.NEXT_PUBLIC_ENABLE_TEST_CHECKOUT === "true"
};
