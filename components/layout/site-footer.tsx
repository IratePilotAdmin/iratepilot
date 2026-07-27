import Link from "next/link";

export function SiteFooter() {
  const groups = [
    { heading: "Travel", links: [["Hotels", "/search"], ["Vacation homes", "/vacation-homes"], ["Deals", "/deals"], ["Rewards", "/rewards"]] },
    { heading: "Partners", links: [["List a property", "/partner#join"], ["Revenue AI", "/partner/revenue"], ["Partner login", "/login?next=/partner/dashboard"], ["Connectivity", "/partner"]] },
    { heading: "Company", links: [["About", "/about"], ["Contact", "/contact"], ["Privacy", "/privacy"], ["Terms", "/terms"]] }
  ];
  return (
    <footer className="mt-20 border-t border-black bg-white">
      <div className="container-page grid gap-10 py-12 md:grid-cols-4">
        <div>
          <div className="editorial-logo text-xl">iRatePilot</div>
          <p className="mt-3 text-sm text-slate-500">Premium hotels, vacation homes, and smarter travel planning.</p>
        </div>
        {groups.map(({ heading, links }) => (
          <div key={heading}>
            <h3 className="font-semibold">{heading}</h3>
            <div className="mt-3 grid gap-2 text-sm text-slate-500">
              {links.map(([label, href]) => <Link key={label} href={href}>{label}</Link>)}
            </div>
          </div>
        ))}
      </div>
      <div className="border-t border-slate-200 py-5 text-center text-xs uppercase tracking-[.12em] text-slate-500">
        © 2026 IRATEPILOT GROUP, LLC. All rights reserved.
      </div>
    </footer>
  );
}
