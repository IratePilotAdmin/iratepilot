import Link from "next/link";
import { ReactNode } from "react";

type Item = { href: string; label: string };

export function DashboardShell({
  title,
  items,
  children
}: {
  title: string;
  items: Item[];
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-slate-100">
      <div className="grid min-h-screen lg:grid-cols-[260px_1fr]">
        <aside className="border-r border-slate-200 bg-slate-950 p-6 text-white">
          <Link href="/" className="text-xl font-bold">iRatePilot</Link>
          <div className="mt-1 text-xs text-slate-400">{title}</div>
          <nav className="mt-8 grid gap-1">
            {items.map((item) => (
              <Link key={item.href} href={item.href} className="rounded-xl px-4 py-3 text-sm text-slate-300 hover:bg-slate-800 hover:text-white">
                {item.label}
              </Link>
            ))}
          </nav>
        </aside>
        <main>
          <header className="border-b border-slate-200 bg-white px-6 py-4">
            <div className="font-semibold">{title}</div>
          </header>
          <div className="p-6 lg:p-8">{children}</div>
        </main>
      </div>
    </div>
  );
}
