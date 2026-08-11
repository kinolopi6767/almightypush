import { db } from "@/lib/db";
import { domains, segments, templates } from "@pushpanel/db/schema";
import { auth } from "@/auth";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { CampaignForm } from "../campaign-form";

export const metadata = { title: "New campaign" };

export default async function NewCampaignPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const workspaceId = Number(session?.user?.workspaceId ?? 0);
  if (!workspaceId) redirect("/setup");
  const domainRows = db.select({ id: domains.id, name: domains.name }).from(domains).where(eq(domains.workspace_id, workspaceId)).all();
  const segmentRows = db
    .select({ id: segments.id, name: segments.name, estimate_count: segments.estimate_count })
    .from(segments)
    .where(eq(segments.workspace_id, workspaceId))
    .all();
  const templateRows = db
    .select({ id: templates.id, name: templates.name, title: templates.title, message: templates.message, launch_url: templates.launch_url })
    .from(templates)
    .where(eq(templates.workspace_id, workspaceId))
    .all();

  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">New campaign</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Send a push to every active subscriber of a domain — or to a saved segment — immediately or on a schedule.
      </p>
      <div className="mt-8 max-w-xl">
        <CampaignForm domains={domainRows} segments={segmentRows} templates={templateRows} />
      </div>
    </>
  );
}
