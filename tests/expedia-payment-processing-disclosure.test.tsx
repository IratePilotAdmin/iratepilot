import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PaymentProcessingDisclosure } from "../components/checkout/payment-processing-disclosure";
import {
  formatExpediaPaymentProcessingDisclosure,
  readExpediaProcessingCountry,
} from "../lib/expedia-rapid/payment-processing-disclosure";

describe("Expedia payment processing location disclosure", () => {
  it("reads one unambiguous country from Rapid Payment Options", () => {
    expect(readExpediaProcessingCountry({
      credit_card: {
        card_options: [
          { name: "MasterCard", processing_country: "US" },
          { name: "Visa", processing_country: "us" },
        ],
      },
    })).toBe("US");
  });

  it("can select the country for a specific card brand", () => {
    expect(readExpediaProcessingCountry({
      credit_card: {
        card_options: [
          { name: "MasterCard", processing_country: "US" },
          { name: "Visa", processing_country: "GB" },
        ],
      },
    }, "Visa")).toBe("GB");
  });

  it("fails closed when the country is missing or ambiguous", () => {
    expect(() => readExpediaProcessingCountry({ credit_card: { card_options: [] } }))
      .toThrow("missing card processing countries");
    expect(() => readExpediaProcessingCountry({
      credit_card: {
        card_options: [
          { name: "MasterCard", processing_country: "US" },
          { name: "Visa", processing_country: "GB" },
        ],
      },
    })).toThrow("missing or ambiguous");
    expect(() => readExpediaProcessingCountry({
      credit_card: {
        card_options: [
          { name: "MasterCard", processing_country: "US" },
          { name: "Visa" },
        ],
      },
    })).toThrow("missing or ambiguous");
  });

  it("uses Expedia's required checkout phrase in a prominent disclosure", () => {
    expect(formatExpediaPaymentProcessingDisclosure("US"))
      .toBe("This payment will be processed in United States.");
    const html = renderToStaticMarkup(
      <PaymentProcessingDisclosure
        merchantOfRecord="expedia"
        processingCountryCode="US"
      />,
    );
    expect(html).toContain("aria-label=\"Payment processing location\"");
    expect(html).toContain("border-2 border-violet-600");
    expect(html).toContain("This payment will be processed in United States.");
  });

  it("rejects non-country CLDR region codes", () => {
    expect(() => formatExpediaPaymentProcessingDisclosure("ZZ"))
      .toThrow("country is invalid");
    expect(() => formatExpediaPaymentProcessingDisclosure("EU"))
      .toThrow("country is invalid");
    expect(() => readExpediaProcessingCountry({
      credit_card: {
        card_options: [{ name: "Visa", processing_country: "ZZ" }],
      },
    })).toThrow("missing or ambiguous");
  });

  it("does not show an Expedia disclosure for another merchant of record", () => {
    expect(renderToStaticMarkup(
      <PaymentProcessingDisclosure
        merchantOfRecord="iratepilot"
        processingCountryCode={null}
      />,
    )).toBe("");
  });

  it("refuses an Expedia checkout without the supplier processing country", () => {
    expect(() => renderToStaticMarkup(
      <PaymentProcessingDisclosure
        merchantOfRecord="expedia"
        processingCountryCode={null}
      />,
    )).toThrow("requires a payment processing country");
  });
});
