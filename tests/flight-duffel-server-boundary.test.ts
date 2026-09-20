import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const root = new URL("../", import.meta.url);
const modulePaths = [
  "lib/flights/duffel/http-transport.server.ts",
  "lib/flights/duffel/credentials.server.ts",
  "lib/flights/duffel/telemetry.server.ts",
] as const;
const serverImportGraph = [
  ...modulePaths,
  "lib/flights/duffel-sandbox-contract.ts",
  "lib/flights/commerce-domain.ts",
  "lib/flights/provider-adapter.ts",
  "lib/flights/runtime-safety.ts",
] as const;

function read(path: string) {
  return readFileSync(new URL(path, root), "utf8");
}

describe("Duffel server-only boundary", () => {
  it("marks every boundary module server-only on the first line", () => {
    for (const path of modulePaths) {
      expect(read(path).split(/\r?\n/, 1)[0]).toBe('import "server-only";');
    }
  });

  it("has no environment, public-secret, global-fetch, route, or client import path", () => {
    for (const path of serverImportGraph) {
      const source = read(path);
      expect(source).not.toMatch(/process\s*\.\s*env|NEXT_PUBLIC|globalThis\s*\.\s*fetch|window\.(?:location|document|fetch|localStorage|sessionStorage)|document\s*\./);
      expect(source).not.toMatch(/from\s+["'](?:@\/)?(?:app|components)\//);
      expect(source).not.toContain('"use client"');
      expect(source).not.toMatch(/export\s+(?:async\s+)?function\s+(?:GET|POST|PUT|PATCH|DELETE)\b/);
    }
  });

  it("keeps the credential and HTTP implementations dependency-injected and Node-only", () => {
    const transport = read(modulePaths[0]);
    const credentials = read(modulePaths[1]);
    expect(transport).toContain('import { createHash } from "node:crypto"');
    expect(transport).toContain('DUFFEL_HTTP_TRANSPORT_RUNTIME = "nodejs"');
    expect(transport).toContain("DuffelInjectedHttpDispatcher");
    expect(transport).toContain("private constructor(");
    expect(transport).toContain("createDisabledDuffelHttpTransport");
    expect(transport).toContain("export function createDisabledDuffelHttpTransport():");
    expect(transport).toContain("createDuffelTestHttpTransport");
    expect(transport).not.toContain("export class DuffelSandboxHttpTransport");
    expect(transport).not.toMatch(/\bfetch\s*\(/);
    expect(credentials).toContain("DuffelSandboxCredentialProvider");
    expect(credentials).not.toMatch(/SUPABASE|VAULT|SECRET|TOKEN\s*=|Deno\s*\.|process\s*\./);
  });

  it("pins the tiny server-only marker dependency exactly in both npm manifests", () => {
    const packageJson = JSON.parse(read("package.json")) as { dependencies: Record<string, string> };
    const packageLock = JSON.parse(read("package-lock.json")) as {
      packages: Record<string, { version?: string; integrity?: string; dependencies?: Record<string, string> }>;
    };
    expect(packageJson.dependencies["server-only"]).toBe("0.0.1");
    expect(packageLock.packages[""].dependencies?.["server-only"]).toBe("0.0.1");
    expect(packageLock.packages["node_modules/server-only"]).toEqual(expect.objectContaining({
      version: "0.0.1",
      integrity: "sha512-qepMx2JxAa5jjfzxG79yPPq+8BuFToHd1hm7kI+Z4zAq1ftQiP7HcxMhDDItrbtwVeLg/cY2JnKnrcFkmiswNA==",
    }));
  });

  it("contains fixed caps, redirect refusal, credential omission, and no-store semantics", () => {
    const source = read(modulePaths[0]);
    expect(source).toContain("DUFFEL_MAX_OUTBOUND_BODY_BYTES = 65_536");
    expect(source).toContain("DUFFEL_MAX_INBOUND_BODY_BYTES = 1_048_576");
    expect(source).toContain('redirect: "error" as const');
    expect(source).toContain('credentials: "omit" as const');
    expect(source).toContain('cache: "no-store" as const');
    expect(source).toContain("automaticRetryAttempted: false");
    expect(source).toContain("idempotencyKeyIncluded: false");
    expect(source).toContain("rawBodyBase64: Buffer.from(accepted.rawBody).toString");
    expect(source).toContain("copyDuffelHttpTransportRawBody");
    expect(source).not.toContain("payload: accepted");
    expect(source).toContain("plan.minimumTimeoutMs !== 70_000");
    expect(source).toContain("plan.minimumTimeoutMs !== 30_000");
    expect(source).not.toContain("130_000");
  });

  it("requires the 069 dispatch claim and never blocks a claimed attempt", () => {
    const transport = read(modulePaths[0]);
    const telemetry = read(modulePaths[2]);
    expect(transport.indexOf("await this.#readToken")).toBeLessThan(transport.indexOf("await this.#markDispatching"));
    expect(transport.indexOf("await this.#markDispatching")).toBeLessThan(transport.indexOf("this.#dispatch(request)"));
    expect(telemetry).toContain("prepared -> blocked");
    expect(telemetry).toContain("prepared -> dispatching");
    expect(telemetry).toContain("dispatching -> succeeded");
    expect(telemetry).toContain('export type DuffelJournalTerminalState = "blocked" | "succeeded" | "failed" | "ambiguous"');
    expect(transport).toContain('expectedRevision: 0');
    expect(transport).toContain('expectedRevision: 1');
    expect(transport).toContain('terminalState: "blocked"');
    expect(transport).not.toMatch(/expectedRevision:\s*1,[\s\S]{0,300}terminalState:\s*"blocked"/);
  });
});
