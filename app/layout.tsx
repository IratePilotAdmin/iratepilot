import type { Metadata, Viewport } from "next";
import { PwaRegistration } from "@/components/pwa-registration";
import "./globals.css";

const siteUrl = process.env.NEXT_PUBLIC_APP_URL || "https://www.iratepilot.com";
const siteTitle = "iRatePilot | Book Hotels & Vacation Homes";
const siteDescription =
  "Search and book curated hotels, resorts, and vacation homes with transparent rates and secure online payments.";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  applicationName: "iRatePilot",
  title: { default: siteTitle, template: "%s | iRatePilot" },
  description: siteDescription,
  alternates: {
    canonical: "/",
  },
  robots: {
    index: true,
    follow: true,
  },
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "iRatePilot",
  },
  formatDetection: {
    telephone: false,
  },
  openGraph: {
    type: "website",
    url: siteUrl,
    siteName: "iRatePilot",
    title: siteTitle,
    description: siteDescription,
  },
  twitter: {
    card: "summary_large_image",
    title: siteTitle,
    description: siteDescription,
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#096fd1",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}<PwaRegistration /></body></html>;
}
