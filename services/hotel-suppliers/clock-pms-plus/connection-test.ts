import { createHash, randomBytes } from "node:crypto";
import type { ClockPmsFetch } from "./transport";

export type ClockPmsConnectionTestConfig = {
  baseUrl: string;
  apiUser: string;
  apiKey: string;
  availabilityPath: string;
  propertyCode: string;
  timeoutMs?: number;
};

export type ClockPmsConnectionTestResult = { resourceCount: number };

export class ClockPmsConnectionTestError extends Error {
  constructor(message: string, readonly status: number, readonly detailCode: string) {
    super(message);
    this.name = "ClockPmsConnectionTestError";
  }
}

type DigestChallenge = {
  realm: string;
  nonce: string;
  algorithm: "MD5" | "MD5-sess" | "SHA-256" | "SHA-256-sess";
  qop?: "auth";
  opaque?: string;
};

function validationEndpoint(config: ClockPmsConnectionTestConfig) {
  const baseUrl = new URL(config.baseUrl);
  if (baseUrl.protocol !== "https:") throw new Error("Clock PMS+ base URL must use HTTPS");
  if (!config.apiUser.trim() || !config.apiKey.trim()) {
    throw new Error("Clock PMS+ API user and API key are required");
  }
  if (!config.availabilityPath.trim()) throw new Error("Clock PMS+ availability path is required");
  if (!config.propertyCode.trim()) throw new Error("Clock PMS+ property code is required");

  const hasPropertyPlaceholder = config.availabilityPath.includes("{propertyCode}");
  const path = config.availabilityPath.replace(
    "{propertyCode}",
    encodeURIComponent(config.propertyCode),
  );
  const endpoint = new URL(path, baseUrl);
  if (endpoint.origin !== baseUrl.origin) {
    throw new Error("Clock PMS+ availability path must remain on the configured API origin");
  }
  if (!hasPropertyPlaceholder && !endpoint.searchParams.has("propertyCode")) {
    endpoint.searchParams.set("propertyCode", config.propertyCode);
  }
  return endpoint;
}

function parseDigestChallenge(header: string | null): DigestChallenge {
  if (!header?.trim().toLowerCase().startsWith("digest ")) {
    throw new ClockPmsConnectionTestError(
      "Clock PMS+ did not return a Digest authentication challenge",
      502,
      "clock_pms_digest_challenge_missing",
    );
  }
  const values: Record<string, string> = {};
  const source = header.trim().slice(7);
  const pattern = /([a-zA-Z][a-zA-Z0-9_-]*)\s*=\s*(?:"((?:\\.|[^"])*)"|([^,\s]+))/g;
  for (const match of source.matchAll(pattern)) {
    values[match[1].toLowerCase()] = (match[2] ?? match[3] ?? "").replace(/\\"/g, '"');
  }
  if (!values.realm || !values.nonce) {
    throw new ClockPmsConnectionTestError(
      "Clock PMS+ returned an invalid Digest authentication challenge",
      502,
      "clock_pms_digest_challenge_invalid",
    );
  }
  const algorithm = values.algorithm || "MD5";
  if (!["MD5", "MD5-sess", "SHA-256", "SHA-256-sess"].includes(algorithm)) {
    throw new ClockPmsConnectionTestError(
      "Clock PMS+ requested an unsupported Digest algorithm",
      502,
      "clock_pms_digest_algorithm_unsupported",
    );
  }
  const qop = values.qop?.split(",").map((value) => value.trim().toLowerCase());
  if (qop && !qop.includes("auth")) {
    throw new ClockPmsConnectionTestError(
      "Clock PMS+ requested an unsupported Digest quality of protection",
      502,
      "clock_pms_digest_qop_unsupported",
    );
  }
  return {
    realm: values.realm,
    nonce: values.nonce,
    algorithm: algorithm as DigestChallenge["algorithm"],
    ...(qop ? { qop: "auth" as const } : {}),
    ...(values.opaque ? { opaque: values.opaque } : {}),
  };
}

function digestAuthorization(
  challenge: DigestChallenge,
  input: { username: string; password: string; method: string; url: URL },
) {
  const hashName = challenge.algorithm.toLowerCase().startsWith("sha-256") ? "sha256" : "md5";
  const hash = (value: string) => createHash(hashName).update(value).digest("hex");
  const uri = `${input.url.pathname}${input.url.search}`;
  const cnonce = randomBytes(16).toString("hex");
  const nonceCount = "00000001";
  const initialHa1 = hash(`${input.username}:${challenge.realm}:${input.password}`);
  const ha1 = challenge.algorithm.endsWith("-sess")
    ? hash(`${initialHa1}:${challenge.nonce}:${cnonce}`)
    : initialHa1;
  const ha2 = hash(`${input.method}:${uri}`);
  const response = challenge.qop
    ? hash(`${ha1}:${challenge.nonce}:${nonceCount}:${cnonce}:${challenge.qop}:${ha2}`)
    : hash(`${ha1}:${challenge.nonce}:${ha2}`);
  const quote = (value: string) => `"${value.replace(/(["\\])/g, "\\$1")}"`;
  const fields = [
    `username=${quote(input.username)}`,
    `realm=${quote(challenge.realm)}`,
    `nonce=${quote(challenge.nonce)}`,
    `uri=${quote(uri)}`,
    `response=${quote(response)}`,
    `algorithm=${challenge.algorithm}`,
  ];
  if (challenge.opaque) fields.push(`opaque=${quote(challenge.opaque)}`);
  if (challenge.qop) {
    fields.push(`qop=${challenge.qop}`, `nc=${nonceCount}`, `cnonce=${quote(cnonce)}`);
  }
  return `Digest ${fields.join(", ")}`;
}

/** Verifies Clock-issued credentials through the configured read-only availability resource. */
export async function testClockPmsConnection(
  config: ClockPmsConnectionTestConfig,
  fetcher: ClockPmsFetch = fetch,
): Promise<ClockPmsConnectionTestResult> {
  const endpoint = validationEndpoint(config);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs ?? 15_000);
  const headers = { accept: "application/json" };
  try {
    const challengeResponse = await fetcher(endpoint, {
      method: "GET",
      headers,
      redirect: "error",
      signal: controller.signal,
    });
    if (challengeResponse.status !== 401) {
      throw new ClockPmsConnectionTestError(
        "Clock PMS+ did not request Digest authentication",
        challengeResponse.status,
        "clock_pms_digest_challenge_missing",
      );
    }
    const challenge = parseDigestChallenge(challengeResponse.headers.get("www-authenticate"));
    const authorization = digestAuthorization(challenge, {
      username: config.apiUser,
      password: config.apiKey,
      method: "GET",
      url: endpoint,
    });
    const response = await fetcher(endpoint, {
      method: "GET",
      headers: { ...headers, authorization },
      redirect: "error",
      signal: controller.signal,
    });
    const payload = response.status === 204 ? undefined : await response.json().catch(() => undefined);
    if (!response.ok) {
      throw new ClockPmsConnectionTestError(
        `Clock PMS+ validation read returned status ${response.status}`,
        response.status,
        response.status === 401 || response.status === 403
          ? "clock_pms_authentication_failed"
          : "clock_pms_validation_rejected",
      );
    }
    if (payload === undefined) return { resourceCount: 0 };
    if (!payload || (typeof payload !== "object" && !Array.isArray(payload))) {
      throw new ClockPmsConnectionTestError(
        "Clock PMS+ returned an invalid validation response",
        502,
        "clock_pms_invalid_validation_response",
      );
    }
    return { resourceCount: Array.isArray(payload) ? payload.length : 1 };
  } catch (error) {
    if (error instanceof ClockPmsConnectionTestError) throw error;
    if (error instanceof Error && error.name === "AbortError") {
      throw new ClockPmsConnectionTestError(
        "Clock PMS+ validation request timed out",
        504,
        "clock_pms_validation_timeout",
      );
    }
    throw new ClockPmsConnectionTestError(
      "Clock PMS+ connection failed",
      502,
      "clock_pms_connection_unreachable",
    );
  } finally {
    clearTimeout(timeout);
  }
}
