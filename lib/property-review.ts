export type PropertyReview = {
  active: boolean;
  note: string;
  created_at: string;
};

export function getLatestPropertyReview(
  reviews: PropertyReview[] | null | undefined,
): PropertyReview | null {
  if (!reviews?.length) return null;

  return reviews.reduce((latest, review) =>
    review.created_at > latest.created_at ? review : latest,
  );
}
