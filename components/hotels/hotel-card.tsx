import Image from "next/image";
import Link from "next/link";
import { Check, Heart, Sparkles, Star } from "lucide-react";
import { Hotel } from "@/data/hotels";
import { getReviewPresentation } from "@/lib/marketplace-presentation";
import { formatCurrency } from "@/lib/utils";

export function HotelCard({ hotel, variant = "list", rank, source = "demo", hotelHref }: { hotel: Hotel; variant?: "list" | "grid"; rank?: number; source?: "database" | "demo"; hotelHref?: string }) {
  const review = getReviewPresentation(hotel.rating, hotel.reviews);
  const href = hotelHref || `/hotels/${hotel.slug}`;
  if (variant === "grid") return (
    <article className="premium-card group">
      <Link href={href} className="block">
        <div className="relative h-64 overflow-hidden">
          <Image src={hotel.image} alt={hotel.name} fill unoptimized sizes="(max-width: 768px) 100vw, 33vw" className="object-cover transition duration-500 group-hover:scale-105" />
          <span className="absolute left-4 top-4 rounded-full bg-white/95 px-3 py-1 text-xs font-extrabold text-slate-800 shadow">{hotel.stars}-star verified</span>
          <span className="absolute right-4 top-4 rounded-full bg-slate-950/80 px-3 py-1 text-xs font-bold text-white backdrop-blur">★ {review.score}</span>
        </div>
        <div className="p-5">
          <p className="text-xs font-bold uppercase tracking-[.12em] text-violet-600">{hotel.city}, {hotel.country}</p>
          <h3 className="mt-2 text-xl font-extrabold tracking-tight text-slate-950">{hotel.name}</h3>
          <p className="mt-2 line-clamp-2 text-sm leading-6 text-slate-600">{hotel.description}</p>
          <div className="mt-4 flex flex-wrap gap-2">{hotel.amenities.slice(0, 3).map(item => <span key={item} className="mini-chip">{item}</span>)}</div>
          <div className="mt-5 flex items-end justify-between border-t border-slate-100 pt-4"><div><span className="block text-xs text-slate-500">From</span><strong className="text-2xl text-slate-950">{formatCurrency(hotel.price)}</strong><span className="text-xs text-slate-500"> / night</span></div><span className="text-sm font-extrabold text-violet-700">View rooms →</span></div>
        </div>
      </Link>
    </article>
  );
  return (
    <article className="result-card group">
      <div className="grid md:grid-cols-[280px_1fr_210px]">
        <div className="relative min-h-64 overflow-hidden">
          <Image src={hotel.image} alt={hotel.name} fill unoptimized sizes="(max-width: 768px) 100vw, 280px" className="object-cover" />
          {rank ? <span className="absolute left-4 top-4 rounded-full bg-slate-950/80 px-3 py-1.5 text-xs font-bold text-white backdrop-blur">#{rank} Smart Match</span> : null}
          <button aria-label={`Save ${hotel.name}`} className="absolute right-4 top-4 rounded-full bg-white/95 p-2.5 text-slate-700 shadow"><Heart className="h-4 w-4" /></button>
        </div>
        <div className="p-6">
          <div className="flex items-center gap-1 text-amber-500">
            {Array.from({ length: hotel.stars }).map((_, i) => <Star key={i} className="h-4 w-4 fill-current" />)}
          </div>
          <h2 className="mt-2 text-2xl font-extrabold tracking-tight text-slate-950">{hotel.name}</h2>
          <p className="mt-1 text-sm font-semibold text-violet-700">{hotel.city}, {hotel.country}</p>
          <p className="mt-4 text-sm text-slate-600">{hotel.description}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            {hotel.amenities.slice(0, 3).map((item) => <span key={item} className="mini-chip">{item}</span>)}
          </div>
          <p className="mt-4 flex items-center gap-2 text-sm font-semibold text-emerald-700"><Check className="h-4 w-4" /> {source === "database" ? "Approved partner room inventory" : "Private demonstration listing"}</p>
        </div>
        <div className="flex min-w-48 flex-col justify-between border-t border-slate-200 bg-slate-50/70 p-6 md:border-l md:border-t-0">
          <div>
            <div className="flex items-center justify-between"><span className="text-sm font-bold text-slate-700">{review.label}</span><span className="rounded-lg bg-violet-700 px-2.5 py-1.5 text-sm font-black text-white">{review.score}</span></div>
            <div className="text-xs text-slate-500">{review.detail}</div>
          </div>
          <div className="mt-6">
            <div className="text-sm text-slate-500">From</div>
            <div className="text-2xl font-bold">{formatCurrency(hotel.price)}</div>
            <div className="text-xs text-slate-500">per night</div>
            <div className="mt-3 flex items-center gap-1 text-xs font-bold text-violet-700"><Sparkles className="h-3.5 w-3.5" /> Member value available</div>
            <Link href={href} className="btn-primary mt-4 w-full">View rooms</Link>
          </div>
        </div>
      </div>
    </article>
  );
}
