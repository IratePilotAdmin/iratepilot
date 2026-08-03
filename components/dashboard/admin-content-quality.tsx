"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type ContentItem = { id: string; name: string; slug: string; type: string; starRating: number; city: string; country: string; active: boolean; businessName: string; score: number; complete: boolean; missing: string[] };
type Summary = { total: number; published: number; highQuality: number; publishedWithIssues: number };

export function AdminContentQuality() {
  const [items, setItems] = useState<ContentItem[]>([]);
  const [summary, setSummary] = useState<Summary>({ total: 0, published: 0, highQuality: 0, publishedWithIssues: 0 });
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "issues" | "published">("all");
  const [message, setMessage] = useState("Loading marketplace content…");
  useEffect(() => {
    fetch("/api/admin/content", { cache: "no-store" }).then(async (response) => {
      const body = await response.json();
      if (!response.ok) throw new Error(body.error);
      setItems(body.items || []);
      setSummary(body.summary);
      setMessage(body.truncated ? "Showing the 500 most recent property records." : "");
    }).catch((error: Error) => setMessage(error.message));
  }, []);
  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    return items.filter((item) => (filter === "all" || (filter === "issues" ? !item.complete : item.active))
      && (!term || [item.name, item.businessName, item.city, item.country, item.slug].some((value) => value.toLowerCase().includes(term))));
  }, [filter, items, query]);

  return <>
    <section className="mt-8 grid gap-5 md:grid-cols-2 xl:grid-cols-4">{[
      ["Properties", summary.total], ["Published", summary.published], ["High quality", summary.highQuality], ["Published with issues", summary.publishedWithIssues],
    ].map(([label, value]) => <article className="card p-6" key={label}><span className="text-sm text-slate-500">{label}</span><strong className="mt-2 block text-3xl">{Number(value).toLocaleString()}</strong></article>)}</section>
    <section className="card mt-8 overflow-hidden">
      <div className="grid gap-4 border-b p-6 lg:grid-cols-[1fr_220px_auto] lg:items-end"><label className="text-sm font-medium">Search content<input className="input mt-2" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Property, partner, location, or slug" /></label><label className="text-sm font-medium">View<select className="input mt-2" value={filter} onChange={(event) => setFilter(event.target.value as typeof filter)}><option value="all">All properties</option><option value="issues">Needs attention</option><option value="published">Published</option></select></label><Link href="/admin/properties" className="btn-primary text-center">Open property review</Link></div>
      {message && <p role="status" className="border-b px-6 py-4 text-sm text-slate-600">{message}</p>}
      <div className="divide-y">{filtered.map((item) => <article className="grid gap-5 p-6 lg:grid-cols-[1fr_120px_220px] lg:items-center" key={item.id}>
        <div><div className="flex flex-wrap items-center gap-2"><strong>{item.name}</strong><span className="badge">{item.active ? "Published" : "Not published"}</span></div><p className="mt-1 text-sm text-slate-500">{item.starRating}-star {item.type.replaceAll("_", " ")} · {item.city}, {item.country} · {item.businessName}</p>{item.missing.length ? <p className="mt-3 text-sm text-amber-800">Needs: {item.missing.join(", ")}</p> : <p className="mt-3 text-sm text-emerald-700">All content and inventory checks pass.</p>}</div>
        <div><span className="text-xs uppercase tracking-wider text-slate-500">Quality</span><strong className={`mt-1 block text-2xl ${item.score === 100 ? "text-emerald-700" : item.score < 60 ? "text-red-700" : "text-amber-700"}`}>{item.score}%</strong></div>
        <div className="h-2 rounded-full bg-slate-100"><div className={`h-2 rounded-full ${item.score === 100 ? "bg-emerald-500" : "bg-amber-500"}`} style={{ width: `${item.score}%` }} /></div>
      </article>)}</div>
      {!message && !filtered.length && <p className="p-6 text-sm text-slate-500">No property content matches these filters.</p>}
    </section>
  </>;
}
