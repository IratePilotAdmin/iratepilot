import Link from "next/link";
import { Plane } from "lucide-react";
import { customerNavigation } from "@/data/navigation";

export function SiteHeader() {
  return (
    <header className="editorial-header">
      <div className="container-page flex min-h-[88px] items-center justify-between gap-5 py-4">
        <Link href="/" className="editorial-logo">
          <span>iRatePilot</span>
          <Plane className="h-4 w-4" />
        </Link>
        <nav className="hidden items-center gap-6 md:flex">
          {customerNavigation.map((item) => (
            <Link key={item.href} href={item.href} className="editorial-nav-link">
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-3">
          <Link href="/login" className="editorial-signin">Sign in</Link>
          <Link href="/register" className="btn-primary hidden sm:inline-flex">Join</Link>
          <details className="relative md:hidden">
            <summary className="cursor-pointer list-none border border-black px-3 py-2 text-xs font-semibold uppercase tracking-wider">Menu</summary>
            <nav aria-label="Mobile navigation" className="absolute right-0 top-12 z-50 grid w-56 border border-black bg-white p-4 shadow-xl">
              {customerNavigation.map((item) => <Link key={item.href} href={item.href} className="py-3 text-sm">{item.label}</Link>)}
              <Link href="/register" className="mt-2 border-t border-neutral-200 py-3 text-sm font-semibold">Create account</Link>
            </nav>
          </details>
        </div>
      </div>
    </header>
  );
}
