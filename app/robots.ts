import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const base = process.env.NEXT_PUBLIC_APP_URL || "https://www.iratepilot.com";
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/admin", "/account", "/checkout", "/partner/dashboard", "/partner/onboarding", "/partner/properties", "/partner/reservations", "/partner/rates", "/partner/settings"] },
    sitemap: `${base}/sitemap.xml`
  };
}
