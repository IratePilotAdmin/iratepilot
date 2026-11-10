const emailAddressPattern = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;

export function isValidEmailSender(value: string | undefined) {
  const candidate = value?.trim();
  if (!candidate) return false;
  if (!candidate.includes("<") && !candidate.includes(">")) {
    return emailAddressPattern.test(candidate);
  }
  const namedSender = candidate.match(/^[^<>]+<([^<>]+)>$/);
  return Boolean(namedSender && emailAddressPattern.test(namedSender[1].trim()));
}

export function isValidHttpsWebhook(value: string | undefined) {
  if (!value?.trim()) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:"
      && Boolean(url.hostname)
      && !url.username
      && !url.password
      && !url.hash;
  } catch {
    return false;
  }
}
