import { afterEach, describe, expect, it } from "vitest";
import { GET, OPTIONS } from "../app/api/ota/capabilities/route";

const previousFlag = process.env.IRATEPILOT_PMS_ARI_ENABLED;

afterEach(() => {
  if (previousFlag === undefined) delete process.env.IRATEPILOT_PMS_ARI_ENABLED;
  else process.env.IRATEPILOT_PMS_ARI_ENABLED = previousFlag;
});

describe("public OTA capabilities route", () => {
  it("documents the native receiver without claiming traffic is enabled", async () => {
    delete process.env.IRATEPILOT_PMS_ARI_ENABLED;
    const response = GET();
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.nativePmsAri).toMatchObject({
      endpoint: "/api/pms/ari",
      implementation: "available",
      trafficEnabled: false,
      currency: ["USD"],
      restrictions: false,
    });
    expect(body.nativePmsAri.activationRequires).toContain("authorized sandbox round trip");
    expect(response.headers.get("access-control-allow-origin")).toBe("*");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(JSON.stringify(body)).not.toContain("SIGNING_SECRET");
  });

  it("reports the server feature flag without exposing credentials", async () => {
    process.env.IRATEPILOT_PMS_ARI_ENABLED = "true";
    const body = await GET().json();
    expect(body.nativePmsAri.trafficEnabled).toBe(true);
    expect(JSON.stringify(body)).not.toContain(process.env.IRATEPILOT_PMS_ARI_SIGNING_SECRETS ?? "__no_secret__");
  });

  it("supports CORS preflight for the read-only capability document", async () => {
    const response = OPTIONS();
    expect(response.status).toBe(204);
    expect(response.headers.get("access-control-allow-methods")).toBe("GET, OPTIONS");
  });
});
