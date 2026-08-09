import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { users } from "@pushpanel/db/schema";
import { count } from "drizzle-orm";
import { AuthCard } from "@/components/auth-card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { setupAction } from "./setup-action";

export const metadata = { title: "Setup" };

// Reads user count from SQLite — must not be prerendered at build time
// (the build-time "no users yet" state would be baked in forever).
export const dynamic = "force-dynamic";

export default async function SetupPage() {
  const [row] = await db.select({ value: count() }).from(users);
  if ((row?.value ?? 0) > 0) redirect("/login");

  return (
    <AuthCard
      title="Set up PushPanel"
      description="Create the owner account. Only available on first run."
      action={setupAction}
      submitLabel="Finish setup"
      onSuccess="/login"
    >
      <div className="space-y-2">
        <Label htmlFor="name">Name</Label>
        <Input id="name" name="name" required autoComplete="name" placeholder="Jane Doe" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input id="email" name="email" type="email" required autoComplete="email" placeholder="you@example.com" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          name="password"
          type="password"
          required
          autoComplete="new-password"
          placeholder="At least 10 characters"
        />
      </div>
    </AuthCard>
  );
}