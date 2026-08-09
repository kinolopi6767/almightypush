import { db } from "@/lib/db";
import { domains } from "@pushpanel/db/schema";
import { CampaignForm } from "../campaign-form";

export const metadata = { title: "New campaign" };

export default async function NewCampaignPage() {
  const domainRows = db.select({ id: domains.id, name: domains.name }).from(domains).all();

  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">New campaign</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Send a push to every active subscriber of a domain — immediately or on a schedule.
      </p>
      <div className="mt-8 max-w-xl">
        <CampaignForm domains={domainRows} />
      </div>
    </>
  );
}
