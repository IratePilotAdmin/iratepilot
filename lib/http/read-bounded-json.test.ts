import { describe, expect, it } from "vitest";
import { readBoundedJson } from "./read-bounded-json";

describe("bounded JSON request reader", () => {
  it("accepts valid JSON within the byte limit", async () => {
    const result = await readBoundedJson(new Request("https://example.test", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ roomId: "room-1" }),
    }));
    expect(result).toEqual({ ok: true, value: { roomId: "room-1" } });
  });

  it("rejects an oversized declared body without reading it", async () => {
    const stream = new ReadableStream<Uint8Array>({ start() {}, cancel() {} });
    const request = new Request("https://example.test", {
      method: "POST", headers: { "content-type": "application/json", "content-length": "129" }, body: stream, duplex: "half",
    } as RequestInit & { duplex: "half" });
    expect(await readBoundedJson(request, 128)).toEqual({ ok: false, reason: "too_large" });
  });

  it("stops chunked bodies as soon as streamed bytes exceed the limit", async () => {
    const request = new Request("https://example.test", {
      method: "POST", headers: { "content-type": "application/json" },
      body: new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new Uint8Array(65)); controller.close(); } }),
      duplex: "half",
    } as RequestInit & { duplex: "half" });
    expect(await readBoundedJson(request, 64)).toEqual({ ok: false, reason: "too_large" });
  });

  it("rejects wrong content types, malformed JSON, and invalid UTF-8", async () => {
    const wrongType = new Request("https://example.test", { method: "POST", body: "{}" });
    expect(await readBoundedJson(wrongType)).toEqual({ ok: false, reason: "unsupported_media_type" });

    const malformed = new Request("https://example.test", { method: "POST", headers: { "content-type": "application/json" }, body: "{" });
    expect(await readBoundedJson(malformed)).toEqual({ ok: false, reason: "invalid_json" });

    const invalidUtf8 = new Request("https://example.test", {
      method: "POST", headers: { "content-type": "application/json" },
      body: new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new Uint8Array([0xc3, 0x28])); controller.close(); } }),
      duplex: "half",
    } as RequestInit & { duplex: "half" });
    expect(await readBoundedJson(invalidUtf8)).toEqual({ ok: false, reason: "invalid_json" });
  });
});
