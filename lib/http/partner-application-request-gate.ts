export type PartnerApplicationRequestGateFailure = {
  status: 403 | 415;
  error: string;
};

export function getPartnerApplicationRequestGateFailure(
  request: Request,
): PartnerApplicationRequestGateFailure | null {
  const mediaType = request.headers.get("content-type")
    ?.split(";", 1)[0]
    .trim()
    .toLowerCase();
  if (mediaType !== "application/json") {
    return { status: 415, error: "Partner applications require application/json." };
  }

  const requestOrigin = new URL(request.url).origin;
  const origin = request.headers.get("origin");
  const fetchSite = request.headers.get("sec-fetch-site");
  if (origin !== requestOrigin || fetchSite !== "same-origin") {
    return { status: 403, error: "Partner applications must be submitted from this site." };
  }

  return null;
}
