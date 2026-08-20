import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = process.env.NEXT_PUBLIC_APP_URL || "https://www.iratepilot.com";
  return ["", "/search", "/flights", "/cars", "/vacation-homes", "/deals", "/rewards", "/partner", "/about", "/contact", "/privacy", "/terms"]
    .map((path) => ({ url: `${base}${path}`, lastModified: new Date() }));
}
