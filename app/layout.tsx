import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || "https://www.iratepilot.com"),
  applicationName: "iRatePilot",
  title: { default: "iRatePilot | Premium Hotels & Vacation Homes", template: "%s | iRatePilot" },
  description: "Discover curated 4- and 5-star hotels, resorts, and premium vacation homes.",
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
    siteName: "iRatePilot",
    title: "iRatePilot | Premium Hotels & Vacation Homes",
    description: "Discover curated premium stays and AI-powered hospitality tools."
  }
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#096fd1",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
