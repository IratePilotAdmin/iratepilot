import Link from "next/link";
import { Plane } from "lucide-react";
import { customerNavigation } from "@/data/navigation";
import { HeaderActions } from "@/components/layout/header-actions";

export function SiteHeader() {
  return (
    <header className="editorial-header">
      <div className="container-page flex min-h-[88px] items-center justify-between gap-5 py-4">
        <Link href="/" className="editorial-logo" aria-label="iRatePilot home">
          <span className="editorial-wordmark" aria-hidden="true">
            <span className="editorial-wordmark-primary">iRate</span>
            <span className="editorial-wordmark-pilot">pilot</span>
          </span>
          <Plane className="h-4 w-4" aria-hidden="true" />
        </Link>
        <nav className="hidden items-center gap-6 md:flex">
          {customerNavigation.map((item) => (
            <Link key={item.href} href={item.href} className="editorial-nav-link">
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-3"><HeaderActions /></div>
      </div>
    </header>
  );
}
