import Image from "next/image";
import Link from "next/link";
import { Activity, ArrowRight, BarChart3, BellRing, Bot, BriefcaseBusiness, Building2, CalendarDays, Check, CloudSun, Database, Gauge, Gem, Headphones, LockKeyhole, ScanSearch, ShieldCheck, Sparkles, Star, TrendingDown, Zap } from "lucide-react";
import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";
import { SearchForm } from "@/components/search/search-form";
import { HotelCard } from "@/components/hotels/hotel-card";
import { hotels } from "@/data/hotels";
import { partnerPlans, type PartnerPlan } from "@/config/partner-plans";

const destinations = [
  { name: "Miami Beach", copy: "Oceanfront energy", image: hotels[0].image },
  { name: "Charleston", copy: "Historic luxury", image: hotels[1].image },
  { name: "Orlando", copy: "Resort escapes", image: hotels[2].image },
  { name: "Navarre", copy: "Private Gulf homes", image: hotels[3].image }
];

const revenueSignals = [
  "Rates and availability", "Occupancy and booking pace", "Competitor prices",
  "Historical demand", "Events and holidays", "Cancellations and no-shows",
  "Weather and seasonality", "Room-type and channel revenue"
];

const revenueFeatures = [
  { icon: Gauge, title: "AI rate recommendations", copy: "Recommended prices by room type and date, with a clear explanation and estimated impact." },
  { icon: BarChart3, title: "Demand forecasting", copy: "Forecast occupancy, ADR, RevPAR, and room revenue across 7-, 30-, 90-, and 365-day windows." },
  { icon: ScanSearch, title: "Competitor monitoring", copy: "Track nearby hotels and flag significant rate changes and market-position opportunities." },
  { icon: CalendarDays, title: "Event detection", copy: "Surface concerts, conventions, sports, holidays, and unusual demand patterns." },
  { icon: Bot, title: "Revenue Manager Copilot", copy: "Ask why dates are underperforming, where to raise rates, or how to reach a monthly target." },
  { icon: BellRing, title: "Alerts and reports", copy: "Daily action summaries and urgent alerts through the dashboard, with email and SMS planned." }
];

export default function HomePage() {
  return (
    <>
      <SiteHeader />
      <main className="overflow-hidden">
        <section className="hero-grid relative border-b border-violet-100">
          <div className="container-page relative py-16 sm:py-24">
            <div className="grid items-center gap-14 lg:grid-cols-[1.02fr_.98fr]">
              <div>
                <span className="eyebrow-pill"><Sparkles className="h-4 w-4" /> AI-guided premium travel</span>
                <h1 className="mt-7 max-w-3xl text-5xl font-black tracking-[-0.055em] text-slate-950 sm:text-7xl">
                  Exceptional stays. <span className="gradient-text">Smarter value.</span>
                </h1>
                <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-600">
                  Discover verified 4- and 5-star hotels, resorts, and premium vacation homes with transparent pricing, intelligent recommendations, and help whenever you need it.
                </p>
                <div className="mt-8 flex flex-wrap gap-3 text-sm font-semibold text-slate-600">
                  <span className="trust-chip"><Check /> Premium-only collection</span>
                  <span className="trust-chip"><Check /> Transparent trip totals</span>
                  <span className="trust-chip"><Check /> Test payments only</span>
                </div>
              </div>
              <div className="journey-panel">
                <div className="journey-glow" />
                <div className="relative overflow-hidden rounded-[28px] bg-slate-950 shadow-2xl shadow-violet-300/40">
                  <Image src={hotels[0].image} alt="Luxury beachfront hotel" width={1000} height={780} priority unoptimized sizes="(max-width: 1024px) 100vw, 50vw" className="h-[470px] w-full object-cover opacity-80" />
                  <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/15 to-transparent" />
                  <div className="absolute inset-x-0 bottom-0 p-7 text-white">
                    <span className="rounded-full bg-white/15 px-3 py-1 text-xs font-bold backdrop-blur">AI match · 96%</span>
                    <h2 className="mt-4 text-2xl font-extrabold">Your ideal beachfront escape</h2>
                    <p className="mt-2 text-sm text-slate-200">5-star stay · Free breakfast · Ocean view · Under your budget</p>
                  </div>
                </div>
                <div className="floating-card left-[-20px] top-10"><Bot className="h-5 w-5 text-violet-600" /><span><strong>Concierge found 7 matches</strong><small>Based on your preferences</small></span></div>
                <div className="floating-card bottom-10 right-[-18px]"><TrendingDown className="h-5 w-5 text-emerald-600" /><span><strong>Member value available</strong><small>Save fees and earn rewards</small></span></div>
              </div>
            </div>
            <div className="relative z-10 mt-12 lg:-mb-28">
              <SearchForm />
            </div>
          </div>
        </section>

        <section className="container-page pb-20 pt-40">
          <div className="section-title-row">
            <div><span className="section-kicker">Explore your way</span><h2>One premium marketplace, every kind of stay.</h2></div>
            <Link href="/search">Explore all stays <ArrowRight /></Link>
          </div>
          <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {destinations.map((destination) => (
              <Link key={destination.name} href={`/search?destination=${encodeURIComponent(destination.name)}`} className="destination-card group">
                <Image src={destination.image} alt="" width={640} height={480} className="h-64 w-full object-cover transition duration-500 group-hover:scale-105" />
                <div className="absolute inset-0 bg-gradient-to-t from-slate-950/85 via-transparent" />
                <div className="absolute bottom-0 p-5 text-white"><strong>{destination.name}</strong><span>{destination.copy}</span></div>
              </Link>
            ))}
          </div>
        </section>

        <section className="bg-white py-20">
          <div className="container-page">
            <div className="section-title-row">
              <div><span className="section-kicker">Premium verified properties</span><h2>Stay somewhere remarkable.</h2><p>Sample properties demonstrate the marketplace until direct partner inventory is connected.</p></div>
              <Link href="/search">View all properties <ArrowRight /></Link>
            </div>
            <div className="mt-9 grid gap-6 lg:grid-cols-3">
              {hotels.slice(0, 3).map((hotel) => <HotelCard key={hotel.slug} hotel={hotel} variant="grid" />)}
            </div>
          </div>
        </section>

        <section className="container-page py-20">
          <div className="membership-shell">
            <div className="relative z-10 max-w-2xl">
              <span className="eyebrow-pill light"><Gem className="h-4 w-4" /> iRatePilot memberships</span>
              <h2 className="mt-6 text-4xl font-black tracking-tight text-white sm:text-5xl">Book more. Pay less in fees. Earn more.</h2>
              <p className="mt-5 text-lg leading-8 text-violet-100">Membership checkout is limited to Stripe test mode. Benefits activate only while a verified membership subscription is active.</p>
              <Link href="/rewards" className="mt-7 inline-flex items-center gap-2 rounded-xl bg-white px-5 py-3 font-bold text-violet-800">Explore rewards <ArrowRight className="h-4 w-4" /></Link>
            </div>
            <div className="relative z-10 grid gap-4">
              <article className="member-tier"><span>Basic</span><strong>$70<small>/year</small></strong><p>0% traveler service fee + reward points</p></article>
              <article className="member-tier featured"><span><BriefcaseBusiness className="h-4 w-4" /> Business Traveler</span><strong>$120<small>/year</small></strong><p>0% traveler service fee · double reward points</p></article>
            </div>
          </div>
        </section>

        <section id="revenue-ai" className="revenue-ai-section">
          <div className="container-page py-24">
            <div className="grid gap-14 lg:grid-cols-[.82fr_1.18fr] lg:items-center">
              <div>
                <span className="section-kicker">For hotel revenue teams</span>
                <h2 className="mt-5 text-5xl leading-[1.02] text-white sm:text-6xl">iRatePilot Revenue AI</h2>
                <p className="mt-6 max-w-xl text-lg leading-8 text-neutral-300">
                  Turn hotel data into explainable pricing recommendations, reliable forecasts, and a prioritized daily action list—while the manager remains in control.
                </p>
                <div className="mt-8 grid gap-x-6 gap-y-3 sm:grid-cols-2">
                  {revenueSignals.map((signal) => <span key={signal} className="revenue-signal"><Check /> {signal}</span>)}
                </div>
                <div className="mt-9 flex flex-wrap gap-3">
                  <Link href="/partner/revenue" className="revenue-primary">Explore Revenue AI <ArrowRight /></Link>
                  <Link href="/partner#application" className="revenue-secondary">Request early access</Link>
                </div>
              </div>

              <div className="revenue-dashboard">
                <div className="revenue-dashboard-top">
                  <div><span>Revenue command center</span><strong>Good morning, Ocean House</strong></div>
                  <span className="revenue-live"><Activity /> Data updated 8:45 AM</span>
                </div>
                <div className="revenue-kpis">
                  {[["Occupancy", "78%", "+6.4%"], ["ADR", "$204", "+$18"], ["RevPAR", "$159", "+11.2%"], ["Revenue", "$48,620", "+9.7%"]].map(([label, value, change]) => (
                    <div key={label}><span>{label}</span><strong>{value}</strong><small>{change} vs. pace</small></div>
                  ))}
                </div>
                <div className="revenue-action">
                  <div className="revenue-action-icon"><Sparkles /></div>
                  <div><span>AI opportunity · August 14</span><strong>Raise King rooms from $189 to $219</strong><p>Occupancy is 18% ahead of last year. Estimated additional revenue: <b>$2,460.</b></p></div>
                  <button>Review</button>
                </div>
                <div className="grid gap-4 md:grid-cols-[1.35fr_.65fr]">
                  <div className="revenue-chart-card">
                    <div className="flex items-center justify-between"><strong>90-day demand forecast</strong><span>Occupancy</span></div>
                    <div className="forecast-bars">{[38, 49, 44, 62, 57, 73, 67, 82, 76, 91, 79, 86].map((height, index) => <i key={index} style={{ height: `${height}%` }} />)}</div>
                    <div className="flex justify-between text-[10px] uppercase tracking-widest text-neutral-500"><span>Aug</span><span>Sep</span><span>Oct</span></div>
                  </div>
                  <div className="revenue-chart-card"><strong>Today’s actions</strong><ul><li><Zap /> 4 rate changes</li><li><TrendingDown /> 2 pace risks</li><li><CloudSun /> 1 demand alert</li></ul></div>
                </div>
              </div>
            </div>

            <div className="mt-24">
              <div className="section-title-row revenue-title-row">
                <div><span className="section-kicker">Essential capabilities</span><h2>One intelligent workspace for every revenue decision.</h2></div>
                <p>Automatic pricing will activate only within manager-defined limits and after the recommendation workflow has reliable hotel data.</p>
              </div>
              <div className="mt-10 grid gap-px border border-white/20 bg-white/20 md:grid-cols-2 lg:grid-cols-3">
                {revenueFeatures.map(({ icon: Icon, title, copy }) => <article key={title} className="revenue-feature"><Icon /><h3>{title}</h3><p>{copy}</p></article>)}
              </div>
            </div>

            <div className="mt-20 grid gap-8 lg:grid-cols-[1.05fr_.95fr]">
              <div className="revenue-control-panel">
                <span className="section-kicker">Manager safety controls</span><h2>AI recommends. Your rules decide.</h2>
                <div className="mt-8 grid gap-3 sm:grid-cols-2">
                  {["Minimum and maximum rates", "Maximum daily price change", "Manual-approval dates", "Room-type relationships", "Occupancy-based rules", "Automatic-pricing permissions", "Full recommendation history", "Audit trail for every change"].map((item) => <span key={item}><LockKeyhole /> {item}</span>)}
                </div>
              </div>
              <div className="revenue-launch-panel">
                <span className="section-kicker">Recommended first release</span><h3>Start reliable. Integrate intelligently.</h3>
                <p>Launch with secure hotel access, room setup, CSV uploads, a revenue dashboard, 90-day demand calendar, pricing recommendations, manager approvals, forecasting, reports, subscriptions, and admin controls.</p>
                <div className="mt-5 flex gap-3"><Database /><p><strong>CSV first</strong><br />Connect Mews, Cloudbeds, Oracle OPERA Cloud, and channel managers after the recommendation system is proven.</p></div>
              </div>
            </div>

            <div className="mt-20">
              <div className="text-center"><span className="section-kicker">Revenue AI plans</span><h2 className="mt-4 text-4xl text-white sm:text-5xl">Built for independent hotels and growing portfolios.</h2></div>
              <div className="mt-9 grid gap-4 md:grid-cols-3">
                {(Object.entries(partnerPlans) as [PartnerPlan, (typeof partnerPlans)[PartnerPlan]][]).map(([, plan]) => <article className={plan.featured ? "revenue-price featured" : "revenue-price"} key={plan.name}><span>{plan.name}</span><strong>${plan.monthlyPrice}<small>/month</small></strong><p>{plan.audience}</p></article>)}
              </div>
              <p className="mt-5 text-center text-sm text-slate-300">Private-pilot subscriptions use Stripe test mode. Live software billing requires launch approval.</p>
            </div>
          </div>
        </section>

        <section className="bg-slate-950 py-20 text-white">
          <div className="container-page">
            <div className="grid gap-12 lg:grid-cols-[.9fr_1.1fr]">
              <div><span className="section-kicker text-violet-300">Built around trust</span><h2 className="mt-4 text-4xl font-black tracking-tight sm:text-5xl">Premium travel with clearer boundaries.</h2><p className="mt-5 text-lg leading-8 text-slate-300">iRatePilot starts with directly approved properties. We do not claim unapproved OTA partnerships, live rates, or active payment processing.</p></div>
              <div className="grid gap-4 sm:grid-cols-2">
                <article className="dark-feature"><ShieldCheck /><strong>Admin-approved inventory</strong><p>Partner properties remain drafts until reviewed and published.</p></article>
                <article className="dark-feature"><Building2 /><strong>4- and 5-star focus</strong><p>Hotels, resorts, and professionally managed vacation homes.</p></article>
                <article className="dark-feature"><Headphones /><strong>AI + human support</strong><p>Routine answers with escalation for exceptions and complex cases.</p></article>
                <article className="dark-feature"><Star /><strong>Transparent economics</strong><p>5% traveler fee and 10% partner commission shown separately.</p></article>
              </div>
            </div>
          </div>
        </section>

        <section className="container-page py-20">
          <div className="partner-cta">
            <div><span className="section-kicker">For premium property partners</span><h2>Bring your hotel or vacation home to iRatePilot.</h2><p>Start a draft listing, add rooms, amenities, policies, photos, and rates, then submit it for marketplace approval.</p></div>
            <div className="flex flex-wrap gap-3"><Link href="/partner#application" className="btn-primary">Apply as a partner</Link><Link href="/partner" className="btn-secondary">See partner tools</Link></div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
