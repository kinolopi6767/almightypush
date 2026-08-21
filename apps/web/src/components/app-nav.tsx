"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const SECTIONS: { heading: string; items: { href: string; label: string }[] }[] = [
  {
    heading: "Overview",
    items: [
      { href: "/dashboard", label: "Dashboard" },
      { href: "/dashboard/domains", label: "Domains" },
      { href: "/dashboard/campaigns", label: "Campaigns" },
      { href: "/dashboard/analytics", label: "Analytics" },
    ],
  },
  {
    heading: "Audience",
    items: [
      { href: "/dashboard/segments", label: "Segments" },
      { href: "/dashboard/templates", label: "Templates" },
      { href: "/dashboard/links", label: "LP links" },
      { href: "/dashboard/channels", label: "YouTube channels" },
      { href: "/dashboard/automations", label: "Automations" },
      { href: "/dashboard/journeys", label: "Journeys" },
      { href: "/dashboard/email", label: "Email" },
    ],
  },
  {
    heading: "Intelligence",
    items: [
      { href: "/dashboard/ai", label: "AI Studio" },
    ],
  },
  {
    heading: "System",
    items: [
      { href: "/dashboard/status", label: "Status" },
      { href: "/dashboard/api", label: "API" },
      { href: "/dashboard/guides", label: "Guides" },
      { href: "/dashboard/team", label: "Team" },
      { href: "/dashboard/settings", label: "Settings" },
      { href: "/dashboard/profile", label: "Profile" },
    ],
  },
];

function activeFor(pathname: string, href: string): boolean {
  if (href === "/dashboard") return pathname === "/dashboard";
  return pathname.startsWith(href);
}

export function AppNav() {
  const pathname = usePathname();

  return (
    <nav className="flex flex-col gap-5 text-sm">
      {SECTIONS.map((section) => (
        <div key={section.heading}>
          <p className="kicker px-3 text-muted-foreground/70">{section.heading}</p>
          <div className="mt-1.5 flex flex-col gap-0.5">
            {section.items.map((item) => {
              const active = activeFor(pathname, item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={`flex items-center gap-2.5 rounded-lg px-3 py-2 transition-colors ${
                    active
                      ? "bg-primary/10 font-medium text-primary"
                      : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                  }`}
                >
                  <span
                    aria-hidden
                    className={`size-1.5 rounded-full transition-colors ${
                      active ? "bg-primary" : "bg-transparent group-hover:bg-border"
                    }`}
                  />
                  {item.label}
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );
}
