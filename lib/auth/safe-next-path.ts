const internalOrigin = "https://internal.iratepilot.invalid";
const unsafeCharacters = /[\\\u0000-\u001f\u007f]/;

export function getSafeNextPath(value: string | null | undefined) {
  if (!value?.startsWith("/") || unsafeCharacters.test(value)) return null;

  try {
    const parsed = new URL(value, internalOrigin);
    if (parsed.origin !== internalOrigin) return null;
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return null;
  }
}
