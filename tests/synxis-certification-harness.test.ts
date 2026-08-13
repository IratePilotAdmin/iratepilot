import { describe, expect, it, vi } from "vitest";
import {
  parseSynxisAcknowledgement,
  SynxisCertificationClient,
  SynxisRateLimiter,
  SynxisTransportError,
} from "../services/hotel-suppliers/synxis";
import type {
  SynxisAriTransport,
  SynxisTransportRequest,
} from "../services/hotel-suppliers/synxis";

const request: SynxisTransportRequest = {
  operation: "inventory_push",
  requestId: "IRP-CERT-1",
  body: "<OTA_HotelInvCountNotifRQ></OTA_HotelInvCountNotifRQ>",
};

describe("SynXis certification acknowledgement parsing", () => {
  it("accepts success and captures non-fatal warnings", () => {
    expect(parseSynxisAcknowledgement(
      '<OTA_HotelInvCountNotifRS><Success/><Warnings><Warning Code="WARN-1" ShortText="Mapped &amp; accepted"/></Warnings></OTA_HotelInvCountNotifRS>',
    )).toEqual({
      success: true,
      warnings: [{ code: "WARN-1", message: "Mapped & accepted" }],
    });
  });

  it("rejects error, missing-success, empty, and unsafe responses", () => {
    expect(() => parseSynxisAcknowledgement(
      '<OTA_HotelInvCountNotifRS><Errors><Error Code="INV-4" ShortText="Invalid room"/></Errors></OTA_HotelInvCountNotifRS>',
    )).toThrow("SynXis rejected the ARI update (INV-4)");
    expect(() => parseSynxisAcknowledgement("<Response/>"))
      .toThrow("did not contain a success acknowledgement");
    expect(() => parseSynxisAcknowledgement(" ")).toThrow("empty response");
    expect(() => parseSynxisAcknowledgement('<!DOCTYPE x [<!ENTITY y "z">]><Success/>'))
      .toThrow("forbidden XML declaration");
  });
});

describe("SynXis certification execution", () => {
  it("spaces starts at no more than five transactions per second", async () => {
    let currentTime = 0;
    const starts: number[] = [];
    const sleep = vi.fn(async (milliseconds: number) => {
      currentTime += milliseconds;
    });
    const limiter = new SynxisRateLimiter(5, () => currentTime, sleep);

    await Promise.all(Array.from({ length: 6 }, () =>
      limiter.schedule(async () => {
        starts.push(currentTime);
      }),
    ));

    expect(starts).toEqual([0, 200, 400, 600, 800, 1000]);
    expect(sleep).toHaveBeenCalledTimes(5);
  });

  it("caps configured throughput at Sabre's five-TPS limit", () => {
    expect(() => new SynxisRateLimiter(6)).toThrow("between 1 and 5 TPS");
    expect(() => new SynxisRateLimiter(0)).toThrow("between 1 and 5 TPS");
  });

  it("retries transient transport failures with bounded exponential delay", async () => {
    const execute = vi.fn<SynxisAriTransport["execute"]>()
      .mockRejectedValueOnce(new SynxisTransportError(
        "temporary", 503, "inventory_push", request.requestId,
      ))
      .mockResolvedValue("<OTA_HotelInvCountNotifRS><Success/></OTA_HotelInvCountNotifRS>");
    const sleep = vi.fn(async () => undefined);
    const client = new SynxisCertificationClient({
      transport: { execute },
      limiter: new SynxisRateLimiter(5, () => 0, async () => undefined),
      sleep,
    });

    await expect(client.execute(request)).resolves.toEqual({
      success: true,
      warnings: [],
    });
    expect(execute).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(250);
  });

  it("does not retry rejected payloads or non-transient failures", async () => {
    const rejectedPayload = vi.fn(async () =>
      '<OTA_HotelInvCountNotifRS><Errors><Error Code="INV-4"/></Errors></OTA_HotelInvCountNotifRS>');
    const payloadClient = new SynxisCertificationClient({
      transport: { execute: rejectedPayload },
      limiter: new SynxisRateLimiter(5, () => 0, async () => undefined),
      maxAttempts: 3,
    });
    await expect(payloadClient.execute(request)).rejects.toThrow("(INV-4)");
    expect(rejectedPayload).toHaveBeenCalledOnce();

    const forbidden = vi.fn(async () => {
      throw new SynxisTransportError("forbidden", 403, "inventory_push", request.requestId);
    });
    const forbiddenClient = new SynxisCertificationClient({
      transport: { execute: forbidden },
      limiter: new SynxisRateLimiter(5, () => 0, async () => undefined),
      maxAttempts: 3,
    });
    await expect(forbiddenClient.execute(request)).rejects.toMatchObject({ status: 403 });
    expect(forbidden).toHaveBeenCalledOnce();
  });

  it("allows at most three attempts", () => {
    expect(() => new SynxisCertificationClient({
      transport: { execute: async () => "<Success/>" },
      limiter: new SynxisRateLimiter(5, () => 0, async () => undefined),
      maxAttempts: 4,
    })).toThrow("between 1 and 3");
  });
});
