import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "iRatePilot — Premium Hotels & Vacation Homes",
    short_name: "iRatePilot",
    description: "Search, book, and manage premium hotel and vacation-home stays.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait-primary",
    background_color: "#f8fafc",
    theme_color: "#096fd1",
    categories: ["travel", "lifestyle"],
    icons: [
      {
        src: "/icon",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/apple-icon",
        sizes: "180x180",
        type: "image/png",
        purpose: "any",
      },
    ],
    shortcuts: [
      {
        name: "Search stays",
        short_name: "Search",
        description: "Find hotels and vacation homes",
        url: "/search",
      },
      {
        name: "My trips",
        short_name: "Trips",
        description: "Review upcoming and past trips",
        url: "/account/trips",
      },
    ],
  };
}
