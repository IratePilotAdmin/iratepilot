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

const isoCountryCodes = new Set(`
AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ
BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ
CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ
DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR
GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY
HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP
KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY
MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ
NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY
QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ
TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ
VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW
`.trim().split(/\s+/));

function normalizeCountryCode(value: unknown) {
  if (typeof value !== "string") return null;
  const countryCode = value.trim().toUpperCase();
  return isoCountryCodes.has(countryCode) ? countryCode : null;
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
