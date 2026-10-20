const livePmsProjectHost = "eiqmdldjnedqgbtoozqa.supabase.co";

/** A Preview must never use the live hotel database, even before authentication. */
export function previewUsesLivePmsDatabase(environment: string | undefined, databaseUrl: string | undefined): boolean {
  if (environment !== "preview" || !databaseUrl) return false;
  try {
    const parsed = new URL(databaseUrl);
    return parsed.protocol === "https:" && parsed.hostname.toLowerCase() === livePmsProjectHost;
  } catch {
    return false;
  }
}
