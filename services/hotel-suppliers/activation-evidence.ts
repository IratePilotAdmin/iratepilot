const placeholderEvidencePattern = /(?:^|\b)(?:demo|dummy|example|n\/?a|none|ok|pending|placeholder|sample|test(?: hotel)?|tbd|todo|unknown|yes)(?:\b|$)/i;
const controlCharacterPattern = /[\u0000-\u001f\u007f]/;

function normalizedEvidence(value: string | undefined) {
  return value?.trim() ?? "";
}

function isSubstantiveEvidence(value: string | undefined, minimumLength: number) {
  const normalized = normalizedEvidence(value);
  return normalized.length >= minimumLength
    && normalized.length <= 500
    && !controlCharacterPattern.test(normalized)
    && !placeholderEvidencePattern.test(normalized);
}

function isPlausibleEmail(value: string) {
  const separator = value.indexOf("@");
  if (separator <= 0 || separator !== value.lastIndexOf("@")) return false;
  const domain = value.slice(separator + 1);
  return !value.includes(" ")
    && domain.length >= 3
    && domain.includes(".")
    && !domain.startsWith(".")
    && !domain.endsWith(".");
}

export function isVerifiedActivationDetail(value: string | undefined) {
  return isSubstantiveEvidence(value, 3);
}

export function isVerifiedVendorApprovalReference(value: string | undefined) {
  const normalized = normalizedEvidence(value);
  return isSubstantiveEvidence(normalized, 8)
    && !normalized.includes("://")
    && /[A-Za-z]/.test(normalized)
    && /[\d._:/-]/.test(normalized);
}

export function isVerifiedProviderEnvironment(value: string | undefined) {
  return isSubstantiveEvidence(value, 4);
}

export function isVerifiedPropertyCode(value: string | undefined) {
  const normalized = normalizedEvidence(value);
  return isSubstantiveEvidence(normalized, 2)
    && /^[A-Za-z0-9][A-Za-z0-9._:/-]{1,199}$/.test(normalized);
}

export function isVerifiedSupportContact(value: string | undefined) {
  const normalized = normalizedEvidence(value);
  if (!isSubstantiveEvidence(normalized, 6)) return false;
  const email = isPlausibleEmail(normalized);
  const digitCount = [...normalized].filter((character) => character >= "0" && character <= "9").length;
  const lowerCaseValue = normalized.toLowerCase();
  const phone = digitCount >= 7;
  const supportCase = digitCount >= 3
    && (lowerCaseValue.includes("case") || lowerCaseValue.includes("ticket"));
  if (email || phone || supportCase) return true;
  try {
    const url = new URL(normalized);
    return url.protocol === "https:" && url.hostname.includes(".");
  } catch {
    return false;
  }
}

export function areVerifiedActivationDetails(details: {
  vendorApprovalReference?: string;
  approvedEnvironment?: string;
  propertyCode?: string;
  supportContact?: string;
}) {
  return isVerifiedVendorApprovalReference(details.vendorApprovalReference)
    && isVerifiedProviderEnvironment(details.approvedEnvironment)
    && isVerifiedPropertyCode(details.propertyCode)
    && isVerifiedSupportContact(details.supportContact);
}
