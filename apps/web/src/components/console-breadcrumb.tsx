"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LABELS: Record<string, string> = {
 dashboard: "Dashboard",
 domains: "Domains",
 campaigns: "Campaigns",
 analytics: "Analytics",
 segments: "Segments",
 templates: "Templates",
 links: "LP links",
 channels: "Channels",
 automations: "Automations",
 journeys: "Journeys",
 email: "Email",
 ai: "AI Studio",
 workspaces: "Workspaces",
 status: "Status",
 logs: "Logs",
 api: "API",
 guides: "Guides",
 team: "Team",
 settings: "Settings",
 profile: "Profile",
};

/** Breadcrumb: Workspace / Section — Stripe-style wayfinding. */
export function ConsoleBreadcrumb({ workspaceName }: { workspaceName: string | null }) {
 const pathname = usePathname();
 const seg = pathname.split("/").filter(Boolean)[1] ?? "";
 const section = LABELS[seg] ?? (seg ? seg.replace(/-/g, " ") : "Dashboard");

 return (
  <nav aria-label="Breadcrumb" className="crumb flex min-w-0 items-center gap-1.5">
   <Link href="/dashboard/workspaces" className="max-w-40 truncate hover:text-[var(--ink)]">
    {workspaceName ?? "Workspace"}
   </Link>
   <span aria-hidden className="shrink-0 opacity-50">/</span>
   <span aria-current="page" className="truncate font-medium text-[var(--ink)]">
    {seg ? section : "Dashboard"}
   </span>
  </nav>
 );
}
