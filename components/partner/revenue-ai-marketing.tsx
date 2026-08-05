import Link from "next/link";
import { Activity, ArrowRight, BarChart3, BellRing, Bot, CalendarDays, Check, CloudSun, Database, Gauge, LockKeyhole, ScanSearch, Sparkles, TrendingDown, Zap } from "lucide-react";
import { partnerPlans, type PartnerPlan } from "@/config/partner-plans";

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

export function RevenueAiMarketing() {
  return (
    <section id="revenue-ai" className="revenue-ai-section scroll-mt-20">
      <div className="container-page py-24">
        <div className="grid gap-14 lg:grid-cols-[.82fr_1.18fr] lg:items-center">
          <div>
            <span className="section-kicker">For hotel revenue teams</span>
            <h2 className="mt-5 text-5xl leading-[1.02] text-white sm:text-6xl">iRatePilot Revenue AI</h2>
            <p className="mt-6 max-w-xl text-lg leading-8 text-neutral-300">Turn hotel data into explainable pricing recommendations, reliable forecasts, and a prioritized daily action list—while the manager remains in control.</p>
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
  );
}
