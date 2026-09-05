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

/** Mobile section nav — horizontal scroll pills with an active state
 * (the desktop sidebar's counterpart; without it the current section is
 * indistinguishable on phones). Sticky offset matches the header height
 * INCLUDING the notched-device safe-area inset. */
export function MobileNav() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Sections"
      className="sticky top-[calc(3.5rem+env(safe-area-inset-top))] z-20 overflow-x-auto border-b bg-[var(--header-bg)] backdrop-blur-xl supports-[backdrop-filter]:bg-[var(--header-bg)] md:hidden premium-scroll"
    >
      <div className="flex items-center gap-1.5 px-3 py-2.5 text-[13px]">
        {MOBILE_LINKS.map(([href, label]) => {
          const active = activeFor(pathname, href);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              aria-label={label}
              className={`shrink-0 whitespace-nowrap rounded-full border px-3.5 py-2 font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 ${
                active
                  ? "border-primary/25 bg-primary text-primary-foreground shadow-xs"
                  : "border-transparent bg-card text-muted-foreground hover:bg-accent hover:text-accent-foreground shadow-xs"
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
