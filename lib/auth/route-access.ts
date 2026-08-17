const publicPartnerRoutes = new Set([
  "/partner/onboarding"
]);

export function isPublicPartnerRoute(pathname: string) {
  const normalizedPath = pathname.length > 1 ? pathname.replace(/\/$/, "") : pathname;
  return publicPartnerRoutes.has(normalizedPath);
}

export function isProtectedRoute(pathname: string) {
  return pathname.startsWith("/account") ||
    pathname.startsWith("/admin") ||
    (pathname.startsWith("/partner/") && !isPublicPartnerRoute(pathname));
}
