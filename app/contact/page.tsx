import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";
import { ContactForm } from "@/components/forms/contact-form";
export default function ContactPage(){return <><SiteHeader/><main className="container-page py-16"><h1 className="text-4xl font-bold">Contact</h1><p className="mt-3 text-slate-600">Questions about travel, partnerships, or Revenue AI? Send our team a message.</p><ContactForm /></main><SiteFooter/></>}
