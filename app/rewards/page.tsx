import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";

export default function RewardsPage() {
  return <><SiteHeader /><main className="container-page py-16"><h1 className="text-4xl font-bold">iRatePilot Rewards</h1><p className="mt-3 max-w-2xl text-slate-600">Earn points, unlock member rates, and receive an extra 5% discount on eligible stays.</p><div className="mt-10 grid gap-6 md:grid-cols-3">{["Member rates","Points on stays","Priority support"].map((x,i)=><div key={x} className="card p-6"><div className="text-3xl font-bold text-brand-600">0{i+1}</div><h2 className="mt-4 font-semibold">{x}</h2></div>)}</div></main><SiteFooter /></>;
}
