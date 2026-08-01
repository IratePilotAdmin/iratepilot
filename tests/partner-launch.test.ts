import { describe, expect, it } from "vitest";
import { getPartnerLaunchProgress, type PartnerLaunchProperty } from "../lib/partner-launch";

function property(overrides: Partial<PartnerLaunchProperty> = {}): PartnerLaunchProperty {
  return {
    active: false,
    readiness: {
      requirements: {
        primaryPhoto: false,
        amenities: false,
        activeRoom: false,
        futureInventory: false
      }
    },
    ...overrides
  };
}

describe("partner launch progress", () => {
  it("starts with property creation for a new partner", () => {
    const progress = getPartnerLaunchProgress([]);
    expect(progress.completed).toBe(0);
    expect(progress.percent).toBe(0);
    expect(progress.nextStep?.key).toBe("property");
  });

  it("moves through content, room, inventory, and publication", () => {
    const progress = getPartnerLaunchProgress([property({
      readiness: {
        requirements: {
          primaryPhoto: true,
          amenities: true,
          activeRoom: true,
          futureInventory: false
        }
      }
    })]);
    expect(progress.completed).toBe(3);
    expect(progress.nextStep?.key).toBe("inventory");
  });

  it("marks a published listing complete", () => {
    const progress = getPartnerLaunchProgress([property({
      active: true,
      readiness: {
        requirements: {
          primaryPhoto: true,
          amenities: true,
          activeRoom: true,
          futureInventory: true
        }
      }
    })]);
    expect(progress.completed).toBe(progress.total);
    expect(progress.percent).toBe(100);
    expect(progress.nextStep).toBeNull();
    expect(progress.publishedCount).toBe(1);
  });
});
