export async function sha256File(file: Blob) {
  const digest = await globalThis.crypto.subtle.digest("SHA-256", await file.arrayBuffer());

  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
