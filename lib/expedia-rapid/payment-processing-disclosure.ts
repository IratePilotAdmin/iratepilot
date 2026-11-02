export type LodgingMerchantOfRecord = "expedia" | "iratepilot" | "property";

type ExpediaCardOption = {
  name?: unknown;
  processing_country?: unknown;
};

type ExpediaPaymentOptions = {
  credit_card?: {
    card_options?: unknown;
  } | null;
};

const countryCodePattern = /^[A-Z]{2}$/;

function normalizeCountryCode(value: unknown) {
  if (typeof value !== "string") return null;
  const countryCode = value.trim().toUpperCase();
  return countryCodePattern.test(countryCode) ? countryCode : null;
}

export function readExpediaProcessingCountry(
  paymentOptions: ExpediaPaymentOptions,
  selectedCardName?: string,
) {
  const options = paymentOptions.credit_card?.card_options;
  if (!Array.isArray(options) || options.length === 0) {
    throw new Error("Expedia payment options are missing card processing countries.");
  }

  const cardOptions = options.filter((option): option is ExpediaCardOption => (
    typeof option === "object" && option !== null
  ));
  const selectedName = selectedCardName?.trim().toLowerCase();
  const applicableOptions = selectedName
    ? cardOptions.filter((option) => (
        typeof option.name === "string" && option.name.trim().toLowerCase() === selectedName
      ))
    : cardOptions;
  const normalizedCountries = applicableOptions
    .map((option) => normalizeCountryCode(option.processing_country));
  const processingCountries = new Set(
    normalizedCountries.filter((countryCode): countryCode is string => countryCode !== null),
  );

  if (
    applicableOptions.length === 0
    || normalizedCountries.some((countryCode) => countryCode === null)
    || processingCountries.size !== 1
  ) {
    throw new Error("Expedia payment processing country is missing or ambiguous.");
  }

  return [...processingCountries][0];
}

export function formatExpediaPaymentProcessingDisclosure(countryCode: string) {
  const normalizedCountryCode = normalizeCountryCode(countryCode);
  if (!normalizedCountryCode) {
    throw new Error("Expedia payment processing country is invalid.");
  }

  const countryName = new Intl.DisplayNames(["en"], { type: "region" })
    .of(normalizedCountryCode);
  if (!countryName || countryName === normalizedCountryCode) {
    throw new Error("Expedia payment processing country is unsupported.");
  }

  return `This payment will be processed in ${countryName}.`;
}
