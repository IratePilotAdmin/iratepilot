export const MAX_RECOMMENDATIONS_PER_RUN = 500;
export class RevenueGenerationLimitError extends Error {}

export function assertSupportedRecommendationCount(count: number): void {
  if (count > MAX_RECOMMENDATIONS_PER_RUN) {
    throw new RevenueGenerationLimitError(`This pilot supports up to ${MAX_RECOMMENDATIONS_PER_RUN} recommendations in one run. Reduce the number of loaded room dates before generating.`);
  }
}
