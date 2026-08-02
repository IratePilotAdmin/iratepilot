import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "You’re offline",
  robots: { index: false, follow: false },
};

export default function OfflinePage() {
  return (
    <main
      style={{
        alignItems: "center",
        background: "#f8fafc",
        color: "#0f172a",
        display: "flex",
        minHeight: "100dvh",
        padding: "32px",
      }}
    >
      <section style={{ margin: "0 auto", maxWidth: "560px" }}>
        <p style={{ fontSize: "12px", fontWeight: 700, letterSpacing: "0.16em", textTransform: "uppercase" }}>
          iRatePilot mobile
        </p>
        <h1 style={{ fontFamily: "Georgia, serif", fontSize: "48px", lineHeight: 1.05, margin: "20px 0" }}>
          You’re offline right now.
        </h1>
        <p style={{ color: "#475569", fontSize: "18px", lineHeight: 1.65 }}>
          Reconnect to search stays, view current prices, or access account and booking details. Sensitive travel data is never stored in the offline cache.
        </p>
        <Link
          href="/"
          style={{
            background: "#096fd1",
            color: "white",
            display: "inline-flex",
            fontSize: "13px",
            fontWeight: 700,
            marginTop: "32px",
            padding: "14px 22px",
            textDecoration: "none",
            textTransform: "uppercase",
          }}
        >
          Try again
        </Link>
      </section>
    </main>
  );
}
