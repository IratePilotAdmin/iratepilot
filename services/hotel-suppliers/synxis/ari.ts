const OTA_NAMESPACE = "http://www.opentravel.org/OTA/2003/05";

export type SynxisRateAmountInput = {
  hotelCode: string;
  roomTypeCode: string;
  ratePlanCode: string;
  startDate: string;
  endDate: string;
  currencyCode: string;
  amountBeforeTax: number;
  numberOfGuests?: number;
  timestamp: string;
  echoToken: string;
};

export type SynxisInventoryInput = {
  hotelCode: string;
  roomTypeCode: string;
  channelCode: string;
  startDate: string;
  endDate: string;
  availableCount: number;
  sellLimit?: number;
  timestamp: string;
  echoToken: string;
};

function xml(value: string | number) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function required(name: string, value: string) {
  if (!value.trim()) throw new Error(`SynXis ${name} is required`);
}

function date(name: string, value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`SynXis ${name} must use YYYY-MM-DD`);
  }
}

function dateRange(startDate: string, endDate: string) {
  date("start date", startDate);
  date("end date", endDate);
  if (endDate < startDate) throw new Error("SynXis end date cannot precede start date");
}

function count(name: string, value: number) {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`SynXis ${name} must be a non-negative integer`);
  }
}

export function buildSynxisRateAmountXml(input: SynxisRateAmountInput) {
  required("hotel code", input.hotelCode);
  required("room type code", input.roomTypeCode);
  required("rate plan code", input.ratePlanCode);
  required("currency code", input.currencyCode);
  required("timestamp", input.timestamp);
  required("echo token", input.echoToken);
  dateRange(input.startDate, input.endDate);
  if (!Number.isFinite(input.amountBeforeTax) || input.amountBeforeTax < 0) {
    throw new Error("SynXis amount before tax must be a non-negative number");
  }
  const guests = input.numberOfGuests ?? 2;
  if (!Number.isInteger(guests) || guests < 1) {
    throw new Error("SynXis number of guests must be a positive integer");
  }

  return [
    `<OTA_HotelRateAmountNotifRQ xmlns="${OTA_NAMESPACE}" TimeStamp="${xml(input.timestamp)}" EchoToken="${xml(input.echoToken)}" Version="4">`,
    `<RateAmountMessages HotelCode="${xml(input.hotelCode)}">`,
    "<RateAmountMessage>",
    `<StatusApplicationControl InvTypeCode="${xml(input.roomTypeCode)}" RatePlanCode="${xml(input.ratePlanCode)}"/>`,
    "<Rates>",
    `<Rate Start="${xml(input.startDate)}" End="${xml(input.endDate)}" CurrencyCode="${xml(input.currencyCode)}">`,
    "<BaseByGuestAmts>",
    `<BaseByGuestAmt AmountBeforeTax="${xml(input.amountBeforeTax)}" NumberOfGuests="${guests}" AgeQualifyingCode="10"/>`,
    "</BaseByGuestAmts>",
    "</Rate>",
    "</Rates>",
    "</RateAmountMessage>",
    "</RateAmountMessages>",
    "</OTA_HotelRateAmountNotifRQ>",
  ].join("");
}

export function buildSynxisInventoryXml(input: SynxisInventoryInput) {
  required("hotel code", input.hotelCode);
  required("room type code", input.roomTypeCode);
  required("channel code", input.channelCode);
  required("timestamp", input.timestamp);
  required("echo token", input.echoToken);
  dateRange(input.startDate, input.endDate);
  count("available count", input.availableCount);
  if (input.sellLimit !== undefined) count("sell limit", input.sellLimit);

  const sellLimit = input.sellLimit === undefined
    ? ""
    : `<InvCount CountType="3" Count="${input.sellLimit}"/>`;

  return [
    `<OTA_HotelInvCountNotifRQ xmlns="${OTA_NAMESPACE}" TimeStamp="${xml(input.timestamp)}" EchoToken="${xml(input.echoToken)}" Version="2.000">`,
    `<Inventories HotelCode="${xml(input.hotelCode)}">`,
    "<Inventory>",
    `<StatusApplicationControl Start="${xml(input.startDate)}" End="${xml(input.endDate)}" InvTypeCode="${xml(input.roomTypeCode)}">`,
    "<DestinationSystemCodes>",
    `<DestinationSystemCode>${xml(input.channelCode)}</DestinationSystemCode>`,
    "</DestinationSystemCodes>",
    "</StatusApplicationControl>",
    "<InvCounts>",
    `<InvCount CountType="2" Count="${input.availableCount}"/>`,
    sellLimit,
    "</InvCounts>",
    "</Inventory>",
    "</Inventories>",
    "</OTA_HotelInvCountNotifRQ>",
  ].join("");
}
