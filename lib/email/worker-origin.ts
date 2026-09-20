type EmailWorkerEnvironment = Record<string, string | undefined>;

function httpsOrigin(value?: string) {
  if (!value) return null;

  try {
    const url = new URL(value.includes("://") ? value : `https://${value}`);
    return url.protocol === "https:" ? url.origin : null;
  } catch {
    return null;
  }
}

export function resolveTransactionalEmailWorkerOrigin(
  env: EmailWorkerEnvironment = process.env,
  requestOrigin?: string,
) {
  return httpsOrigin(requestOrigin)
    || httpsOrigin(env.VERCEL_URL)
    || httpsOrigin(env.VERCEL_BRANCH_URL)
    || httpsOrigin(env.NEXT_PUBLIC_APP_URL)
    || httpsOrigin(env.VERCEL_PROJECT_PRODUCTION_URL);
}
