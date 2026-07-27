import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";
import { CustomerTrips } from "@/components/bookings/customer-trips";
export default function Page(){return <><SiteHeader/><main className="container-page py-14"><h1 className="text-3xl font-bold">My trips</h1><p className="mt-2 text-slate-500">Private booking requests and confirmed reservations appear here.</p><CustomerTrips /></main><SiteFooter/></>}
