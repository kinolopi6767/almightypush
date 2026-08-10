import { notFound } from "next/navigation";
import Link from "next/link";
import { and, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { domains, segments } from "@pushpanel/db/schema";
import { SegmentForm } from "../segment-form";

export const metadata = { title: "Edit segment" };

export default async function SegmentEditPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const workspaceId = Number(session?.user?.workspaceId ?? 0);
  const id = Number((await params).id);

  const [row] = await db
    .select({
      id: segments.id,
      name: segments.name,
      domain_ids_json: segments.domain_ids_json,
      conditions_json: segments.conditions_json,
    })
    .from(segments)
    .where(and(eq(segments.id, id), eq(segments.workspace_id, workspaceId)))
    .limit(1)
    .all();
  if (!row) notFound();

  const wsDomains = await db
    .select({ id: domains.id, name: domains.name })
    .from(domains)
    .where(eq(domains.workspace_id, workspaceId))
    .orderBy(domains.name)
    .all();

  let domainIds: number[] = [];
  try {
    domainIds = row.domain_ids_json ? (JSON.parse(row.domain_ids_json) as number[]) : [];
  } catch {
    domainIds = [];
  }
  let groups: { logic: "AND" | "OR"; conditions: { field: string; op: string; value: string }[] }[] = [];
  try {
    const parsed = JSON.parse(row.conditions_json) as { groups?: unknown };
    if (Array.isArray(parsed.groups)) {
      groups = parsed.groups.map((g) => {
        const gg = g as { logic?: unknown; conditions?: unknown };
        return {
          logic: gg.logic === "OR" ? "OR" : "AND",
          conditions: Array.isArray(gg.conditions)
            ? (gg.conditions as { field: string; op: string; value: string }[])
            : [],
        };
      });
    }
  } catch {
    groups = [];
  }

  return (
    <>
      <Link href="/dashboard/segments" className="text-sm text-primary hover:underline">
        ← Back to segments
      </Link>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight">Edit segment</h1>
      <div className="mt-8 max-w-2xl">
        <SegmentForm domains={wsDomains} initial={{ id: row.id, name: row.name, domainIds, groups }} />
      </div>
    </>
  );
}
