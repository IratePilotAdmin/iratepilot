export type SynxisCertificationFreshness = {
  current: boolean;
  newerActivityAt: string | null;
  newerEvidenceAt: string | null;
  newerRequestAt: string | null;
};

export function buildSynxisCertificationFreshness(
  generatedAt: string,
  latestEvidenceAt: string | null,
  latestRequestAt: string | null,
): SynxisCertificationFreshness {
  const generated = Date.parse(generatedAt);
  const evidence = latestEvidenceAt ? Date.parse(latestEvidenceAt) : Number.NaN;
  const request = latestRequestAt ? Date.parse(latestRequestAt) : Number.NaN;
  const newerEvidenceAt = Number.isFinite(evidence) && evidence > generated ? latestEvidenceAt : null;
  const newerRequestAt = Number.isFinite(request) && request > generated ? latestRequestAt : null;
  const newerActivityAt = [newerEvidenceAt, newerRequestAt]
    .filter((value): value is string => value !== null)
    .sort((left, right) => Date.parse(right) - Date.parse(left))[0] ?? null;
  return {
    current: newerActivityAt === null,
    newerActivityAt,
    newerEvidenceAt,
    newerRequestAt,
  };
}
