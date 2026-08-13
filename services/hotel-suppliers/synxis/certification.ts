import type {
  SynxisAriOperation,
  SynxisTransportRequest,
} from "./transport";
import { SynxisTransportError } from "./transport";

export type SynxisAriTransport = {
  execute(request: SynxisTransportRequest): Promise<string>;
};

export type SynxisResponseIssue = {
  code?: string;
  message?: string;
};

export type SynxisAcknowledgement = {
  success: boolean;
  warnings: SynxisResponseIssue[];
};

export type SynxisCertificationClientConfig = {
  transport: SynxisAriTransport;
  limiter?: SynxisRateLimiter;
  maxAttempts?: number;
  sleep?: (milliseconds: number) => Promise<void>;
};

function attributes(tag: string) {
  return Object.fromEntries(
    [...tag.matchAll(/([\w:-]+)="([^"]*)"/g)].map((match) => [match[1], match[2]]),
  );
}

function decodeXml(value: string) {
  return value
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&amp;", "&");
}

function issues(xml: string, name: "Warning" | "Error") {
  const pattern = new RegExp(`<(?:\\w+:)?${name}\\b[^>]*>`, "gi");
  return [...xml.matchAll(pattern)].map((match) => {
    const values = attributes(match[0]);
    return {
      code: values.Code ?? values.code ?? values.Type,
      message: values.ShortText ? decodeXml(values.ShortText) : undefined,
    };
  });
}

export function parseSynxisAcknowledgement(xml: string): SynxisAcknowledgement {
  if (!xml.trim()) throw new Error("SynXis returned an empty response");
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) {
    throw new Error("SynXis response contains a forbidden XML declaration");
  }
  const errors = issues(xml, "Error");
  if (errors.length > 0 || /<(?:\w+:)?Errors\b/i.test(xml)) {
    const first = errors[0];
    const suffix = first?.code ? ` (${first.code})` : "";
    throw new Error(`SynXis rejected the ARI update${suffix}`);
  }
  if (!/<(?:\w+:)?Success\b/i.test(xml)) {
    throw new Error("SynXis response did not contain a success acknowledgement");
  }
  return { success: true, warnings: issues(xml, "Warning") };
}

export class SynxisRateLimiter {
  private nextStart = 0;
  private chain = Promise.resolve();

  constructor(
    readonly transactionsPerSecond = 5,
    private readonly now: () => number = Date.now,
    private readonly sleep: (milliseconds: number) => Promise<void> = (milliseconds) =>
      new Promise((resolve) => setTimeout(resolve, milliseconds)),
  ) {
    if (!Number.isInteger(transactionsPerSecond) || transactionsPerSecond < 1 || transactionsPerSecond > 5) {
      throw new Error("SynXis transaction rate must be between 1 and 5 TPS");
    }
  }

  async schedule<T>(operation: () => Promise<T>): Promise<T> {
    let release!: () => void;
    const previous = this.chain;
    this.chain = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;

    const interval = Math.ceil(1_000 / this.transactionsPerSecond);
    const wait = Math.max(0, this.nextStart - this.now());
    if (wait > 0) await this.sleep(wait);
    this.nextStart = Math.max(this.nextStart, this.now()) + interval;
    release();

    return operation();
  }
}

function retryable(error: unknown) {
  return error instanceof SynxisTransportError
    && [429, 502, 503, 504].includes(error.status);
}

function retryDelay(attempt: number) {
  return 250 * (2 ** (attempt - 1));
}

export class SynxisCertificationClient {
  private readonly limiter: SynxisRateLimiter;
  private readonly maxAttempts: number;
  private readonly sleep: (milliseconds: number) => Promise<void>;

  constructor(private readonly config: SynxisCertificationClientConfig) {
    this.limiter = config.limiter ?? new SynxisRateLimiter();
    this.maxAttempts = config.maxAttempts ?? 3;
    this.sleep = config.sleep ?? ((milliseconds) =>
      new Promise((resolve) => setTimeout(resolve, milliseconds)));
    if (!Number.isInteger(this.maxAttempts) || this.maxAttempts < 1 || this.maxAttempts > 3) {
      throw new Error("SynXis certification attempts must be between 1 and 3");
    }
  }

  async execute(request: SynxisTransportRequest): Promise<SynxisAcknowledgement> {
    let attempt = 0;
    while (attempt < this.maxAttempts) {
      attempt += 1;
      try {
        const response = await this.limiter.schedule(() => this.config.transport.execute(request));
        return parseSynxisAcknowledgement(response);
      } catch (error) {
        if (!retryable(error) || attempt >= this.maxAttempts) throw error;
        await this.sleep(retryDelay(attempt));
      }
    }
    throw new Error("SynXis certification execution exhausted attempts");
  }
}

export function synxisOperationIsAri(operation: string): operation is SynxisAriOperation {
  return operation === "rate_push" || operation === "inventory_push";
}
