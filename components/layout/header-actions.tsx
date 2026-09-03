"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { customerNavigation } from "@/data/navigation";

type SessionUser = {
  email?: string;
  role?: "customer" | "partner" | "admin";
  fullName?: string | null;
};

const customerAccountLinks = [
  { href: "/account", label: "Account overview" },
  { href: "/account/trips", label: "My trips" },
  { href: "/account/flights", label: "My flights" },
  { href: "/account/payments", label: "Payment history" },
  { href: "/account/rewards", label: "Membership & rewards" },
  { href: "/account/profile", label: "Profile" },
  { href: "/account/support", label: "Booking messages" },
];

const roleDestination = (role: SessionUser["role"]) => role === "admin"
  ? { href: "/admin", label: "Admin Console" }
  : role === "partner"
    ? { href: "/partner/dashboard", label: "Partner Center" }
    : { href: "/account", label: "My Account" };

export function HeaderActions() {
  const router = useRouter();
  const [user, setUser] = useState<SessionUser | null>(null);
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    fetch("/api/auth/session", { cache: "no-store" }).then(async (response) => {
      if (response.status === 401) return null;
      const body = await response.json();
      return response.ok && body.authenticated ? body.user as SessionUser : null;
    }).then(setUser).catch(() => setUser(null));
  }, []);

  async function signOut() {
    setSigningOut(true);
    const response = await fetch("/api/auth/session", { method: "POST" });
    if (response.ok) router.push("/");
    else setSigningOut(false);
  }

  const destination = roleDestination(user?.role);
  const accountLinks = user?.role === "customer" || !user?.role
    ? customerAccountLinks
    : [destination];
  const displayName = user?.fullName?.trim() || user?.email || destination.label;

  return <>
    <div className="hidden items-center gap-3 md:flex">
      {user ? <details className="relative">
        <summary className="editorial-signin max-w-48 cursor-pointer list-none truncate" aria-label="Open account menu">{displayName}</summary>
        <nav aria-label="Account navigation" className="absolute right-0 top-10 z-50 grid w-64 border border-black bg-white p-3 shadow-xl">
          {accountLinks.map((item) => <Link key={item.href} href={item.href} className="px-3 py-2 text-sm hover:bg-slate-50">{item.label}</Link>)}
          <button className="mt-2 border-t border-neutral-200 px-3 py-3 text-left text-sm font-semibold" disabled={signingOut} onClick={signOut}>{signingOut ? "Signing out…" : "Sign out"}</button>
        </nav>
      </details> : <><Link href="/login" className="editorial-signin">Sign in</Link><Link href="/register" className="btn-primary">Join</Link></>}
    </div>

    <details className="relative md:hidden">
      <summary className="cursor-pointer list-none border border-black px-3 py-2 text-xs font-semibold uppercase tracking-wider">Menu</summary>
      <nav aria-label="Mobile navigation" className="absolute right-0 top-12 z-50 grid w-64 border border-black bg-white p-4 shadow-xl">
        {customerNavigation.map((item) => <Link key={item.href} href={item.href} className="py-3 text-sm">{item.label}</Link>)}
        {user ? <>
          <span className="mt-2 border-t border-neutral-200 pt-4 text-xs text-slate-500">{displayName}</span>
          {accountLinks.map((item) => <Link key={item.href} href={item.href} className="py-3 text-sm font-semibold">{item.label}</Link>)}
          <button className="py-3 text-left text-sm font-semibold" disabled={signingOut} onClick={signOut}>{signingOut ? "Signing out…" : "Sign out"}</button>
        </> : <><Link href="/login" className="mt-2 border-t border-neutral-200 py-3 text-sm font-semibold">Sign in</Link><Link href="/register" className="py-3 text-sm font-semibold">Create account</Link></>}
      </nav>
    </details>
  </>;
}
