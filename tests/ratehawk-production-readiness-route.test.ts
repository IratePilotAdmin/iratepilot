import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  requireRole: vi.fn(),
  createAdminClient: vi.fn(),
  receiptRows: [] as Array<{ scenario: string }>,
  validationRows: [] as Array<{ validation_kind: string }>,
  receiptError: null as unknown,
  validationError: null as unknown,
}));

vi.mock("@/lib/auth/require-role", () => ({ requireRole: mocks.requireRole }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: mocks.createAdminClient }));

import { GET } from "../app/api/admin/integrations/inventory/ratehawk/readiness/route";

const scenarios = [
  "children", "citizenship", "multiroom", "price_change", "unknown_success",
  "unknown_soldout", "unknown_book_limit",
];

function query(result: () => { data: unknown[]; error: unknown }) {
  const builder = {
    select: vi.fn(),
    eq: vi.fn(),
    order: vi.fn(),
  };
  builder.select.mockReturnValue(builder);
  builder.eq.mockReturnValue(builder);
  builder.order.mockImplementation(() => Promise.resolve(result()));
  return builder;
}

describe("RateHawk production readiness route", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    for (const key of [
      "HOTEL_INVENTORY_RATEHAWK_CHECKLIST_SUBMITTED",
      "HOTEL_INVENTORY_RATEHAWK_CERTIFICATION_APPROVED",
      "HOTEL_INVENTORY_RATEHAWK_PRODUCTION_KEY_ID",
      "HOTEL_INVENTORY_RATEHAWK_PRODUCTION_API_KEY",
      "HOTEL_INVENTORY_RATEHAWK_PRODUCTION_SMOKE_VALIDATED",
      "HOTEL_INVENTORY_RATEHAWK_LIVE_ENABLED",
    ]) delete process.env[key];
    process.env.HOTEL_INVENTORY_RATEHAWK_KEY_ID = "sandbox-key-id";
    process.env.HOTEL_INVENTORY_RATEHAWK_API_KEY = "sandbox-api-key";
    process.env.HOTEL_INVENTORY_RATEHAWK_SANDBOX_ENABLED = "true";
    mocks.requireRole.mockResolvedValue({ user: { id: "admin-1" }, profile: { role: "admin" } });
    mocks.receiptRows = [];
    mocks.validationRows = [];
    mocks.receiptError = null;
    mocks.validationError = null;
    mocks.createAdminClient.mockImplementation(() => ({
      from: (table: string) => table === "ratehawk_certification_receipts"
        ? query(() => ({ data: mocks.receiptRows, error: mocks.receiptError }))
        : query(() => ({ data: mocks.validationRows, error: mocks.validationError })),
    }));
  });

  it("derives completed technical gates but keeps vendor approval blocked", async () => {
    mocks.receiptRows = scenarios.map((scenario) => ({ scenario }));
    mocks.validationRows = [
      { validation_kind: "hotel_search" },
      { validation_kind: "hotel_prebook" },
    ];
    process.env.HOTEL_INVENTORY_RATEHAWK_CHECKLIST_SUBMITTED = "true";

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.evidence).toMatchObject({
      certificationScenariosComplete: true,
      completedScenarioCount: 7,
      requiredScenarioCount: 7,
      searchValidated: true,
      prebookValidated: true,
    });
    expect(body.readiness).toMatchObject({
      nextGate: "certification_approval",
      readyForLiveBooking: false,
      productionCredentialsReady: false,
    });
  });

  it("never accepts sandbox credentials as production credentials", async () => {
    mocks.receiptRows = scenarios.map((scenario) => ({ scenario }));
    mocks.validationRows = [
      { validation_kind: "hotel_search" },
      { validation_kind: "hotel_prebook" },
    ];
    process.env.HOTEL_INVENTORY_RATEHAWK_CHECKLIST_SUBMITTED = "true";
    process.env.HOTEL_INVENTORY_RATEHAWK_CERTIFICATION_APPROVED = "true";
    process.env.HOTEL_INVENTORY_RATEHAWK_PRODUCTION_KEY_ID = "sandbox-key-id";
    process.env.HOTEL_INVENTORY_RATEHAWK_PRODUCTION_API_KEY = "sandbox-api-key";

    const body = await (await GET()).json();

    expect(body.readiness).toMatchObject({
      nextGate: "production_credentials",
      productionCredentialsReady: false,
      readyForLiveBooking: false,
    });
  });

  it("authorizes the administrator and fails closed when evidence cannot load", async () => {
    mocks.requireRole.mockResolvedValueOnce({ error: "Access denied.", status: 403 });
    expect((await GET()).status).toBe(403);
    expect(mocks.createAdminClient).not.toHaveBeenCalled();

    mocks.requireRole.mockResolvedValueOnce({ user: { id: "admin-1" }, profile: { role: "admin" } });
    mocks.receiptError = { message: "database unavailable" };
    const response = await GET();
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      error: "RateHawk production readiness evidence could not be loaded.",
    });
  });
});
