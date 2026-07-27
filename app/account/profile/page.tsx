import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";
import { ProfileForm } from "@/components/account/profile-form";
export default function Page(){return <><SiteHeader/><main className="container-page py-14"><h1 className="text-3xl font-bold">Profile</h1><p className="mt-2 text-slate-500">Update contact information and view membership status.</p><ProfileForm /></main><SiteFooter/></>}
