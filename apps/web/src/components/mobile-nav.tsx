"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const MOBILE_LINKS = [
 ["/dashboard", "Dashboard"],
 ["/dashboard/domains", "Domains"],
 ["/dashboard/campaigns", "Campaigns"],
 ["/dashboard/analytics", "Analytics"],
 ["/dashboard/segments", "Segments"],
 ["/dashboard/templates", "Templates"],
 ["/dashboard/links", "LP links"],
 ["/dashboard/channels", "Channels"],
 ["/dashboard/automations", "Automations"],
 ["/dashboard/journeys", "Journeys"],
 ["/dashboard/email", "Email"],
 ["/dashboard/ai", "AI Studio"],
 ["/dashboard/workspaces", "Workspaces"],
 ["/dashboard/status", "Status"],
 ["/dashboard/logs", "Logs"],
 ["/dashboard/api", "API"],
 ["/dashboard/guides", "Guides"],
 ["/dashboard/team", "Team"],
 ["/dashboard/settings", "Settings"],
 ["/dashboard/profile", "Profile"],
] as const;

function activeFor(pathname: string, href: string): boolean {
 if (href === "/dashboard") return pathname === "/dashboard";
 return pathname.startsWith(href);
}

/** Mobile section strip — dense horizontal pills under the topbar. */
export function MobileNav() {
 const pathname = usePathname();
 return (
  <nav
   aria-label="Sections"
   className="mobile-sections console-topbar sticky top-14 z-20 overflow-x-auto md:hidden"
  >
   <div className="flex items-center gap-1.5 px-3 py-2">
    {MOBILE_LINKS.map(([href, label]) => {
     const active = activeFor(pathname, href);
     return (
      <Link
       key={href}
       href={href}
       aria-current={active ? "page" : undefined}
       aria-label={label}
       className={`shrink-0 whitespace-nowrap rounded-full px-3 py-1.5 text-[12.5px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)] ${
        active
         ? "bg-[var(--ink)] text-[var(--bg)]"
         : "text-[var(--ink-2)] hover:bg-[var(--muted)] hover:text-[var(--ink)]"
       }`}
      >
       {label}
      </Link>
     );
    })}
   </div>
  </nav>
 );
}
