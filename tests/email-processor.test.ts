import { describe, expect, it } from "vitest";
import {
  DEFAULT_EMAIL_ACTION_URL,
  getSafeEmailActionUrl,
  isAuthorizedCronRequest,
} from "../lib/email/processor";

describe("transactional email processor security", () => {
  it("only accepts the exact Vercel cron authorization value", () => {
    expect(isAuthorizedCronRequest("Bearer correct-secret", "correct-secret")).toBe(
      true,
    );
    expect(isAuthorizedCronRequest("Bearer wrong-secret", "correct-secret")).toBe(
      false,
    );
    expect(isAuthorizedCronRequest(null, "correct-secret")).toBe(false);
    expect(isAuthorizedCronRequest("Bearer correct-secret", "")).toBe(false);
  });

  it("allows only HTTPS links on the iRatePilot domain", () => {
    expect(
      getSafeEmailActionUrl("https://www.iratepilot.com/partner/dashboard"),
    ).toBe("https://www.iratepilot.com/partner/dashboard");
    expect(getSafeEmailActionUrl("https://app.iratepilot.com/account")).toBe(
      "https://app.iratepilot.com/account",
    );
    expect(getSafeEmailActionUrl("http://www.iratepilot.com/account")).toBe(
      DEFAULT_EMAIL_ACTION_URL,
    );
    expect(getSafeEmailActionUrl("https://iratepilot.com.evil.test/phish")).toBe(
      DEFAULT_EMAIL_ACTION_URL,
    );
    expect(getSafeEmailActionUrl("javascript:alert(1)")).toBe(
      DEFAULT_EMAIL_ACTION_URL,
    );
  });
});
