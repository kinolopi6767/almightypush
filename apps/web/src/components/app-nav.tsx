"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLinkStatus } from "next/link";

/* Minimal 24×24 stroke icons (lucide-style) — no runtime dependency. */
const ICON_PATHS: Record<string, string> = {
  "/dashboard": "M3 3h7v7H3zM14 3h7v5h-7zM14 12h7v9h-7zM3 14h7v7H3z",
  "/dashboard/domains": "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zM2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z",
  "/dashboard/campaigns": "M22 2 11 13M22 2l-7 20-4-9-9-4z",
  "/dashboard/analytics": "M18 20V10M12 20V4M6 20v-6",
  "/dashboard/segments": "M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75",
  "/dashboard/templates": "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M16 13H8M16 17H8M10 9H8",
  "/dashboard/links": "M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71",
  "/dashboard/channels": "M22.54 6.42a2.78 2.78 0 0 0-1.94-2C18.88 4 12 4 12 4s-6.88 0-8.6.46a2.78 2.78 0 0 0-1.94 2A29 29 0 0 0 1 11.75a29 29 0 0 0 .46 5.33A2.78 2.78 0 0 0 3.4 19c1.72.46 8.6.46 8.6.46s6.88 0 8.6-.46a2.78 2.78 0 0 0 1.94-2 29 29 0 0 0 .46-5.25 29 29 0 0 0-.46-5.33zM9.75 15.02V8.48l5.75 3.27z",
  "/dashboard/automations": "M13 2 3 14h9l-1 8 10-12h-9z",
  "/dashboard/journeys": "M6 3v12M18 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM6 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM18 9a9 9 0 0 1-9 9",
  "/dashboard/email": "M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zM22 6l-10 7L2 6",
  "/dashboard/ai": "M12 3l1.9 5.8L19.7 10l-5.8 1.9L12 17.7l-1.9-5.8L4.3 10l5.8-1.2zM19 15l.9 2.6L22.5 18.5l-2.6.9L19 22l-.9-2.6-2.6-.9 2.6-.9z",
  "/dashboard/status": "M22 12h-4l-3 9L9 3l-3 9H2",
  "/dashboard/api": "M16 18l6-6-6-6M8 6l-6 6 6 6",
  "/dashboard/guides": "M4 19.5A2.5 2.5 0 0 1 6.5 17H20M4 19.5A2.5 2.5 0 0 0 6.5 22H20V2H6.5A2.5 2.5 0 0 0 4 4.5z",
  "/dashboard/team": "M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75",
  "/dashboard/settings": "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z",
  "/dashboard/profile": "M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z",
};

function NavIcon({ href, className }: { href: string; className?: string }) {
  const d = ICON_PATHS[href];
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={className}
    >
      <path d={d} />
    </svg>
  );
}

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
    items: [{ href: "/dashboard/ai", label: "AI Studio" }],
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

/** useLinkStatus must be read inside the Link — shows a spinner while loading. */
function NavLink({ href, label, active }: { href: string; label: string; active: boolean }) {
  const { pending } = useLinkStatus();
  return (
    <>
      <NavIcon
        href={href}
        className={`size-4 shrink-0 transition-opacity ${active ? "" : "opacity-55 group-hover:opacity-100"}`}
      />
      <span className="truncate">{label}</span>
      {pending && (
        <span
          aria-hidden
          className="ml-auto size-3 shrink-0 animate-spin rounded-full border-[1.5px] border-current border-t-transparent opacity-70"
        />
      )}
    </>
  );
}

export function AppNav() {
  const pathname = usePathname();

  return (
    <nav className="flex flex-col gap-4 text-[13px]">
      {SECTIONS.map((section) => (
        <div key={section.heading}>
          <p className="sidebar-heading px-2.5 text-[10px] font-semibold uppercase tracking-[0.1em]">
            {section.heading}
          </p>
          <div className="mt-1 flex flex-col gap-px">
            {section.items.map((item) => {
              const active = activeFor(pathname, item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  data-active={active}
                  aria-current={active ? "page" : undefined}
                  className={`sidebar-item group relative flex items-center gap-2.5 rounded-lg px-2.5 py-[7px] font-medium ${
                    active ? "" : ""
                  }`}
                >
                  <NavLink href={item.href} label={item.label} active={active} />
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );
}
