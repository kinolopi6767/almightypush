import { auth } from "@/auth";
import { db } from "@/lib/db";
import { users } from "@pushpanel/db/schema";
import { eq } from "drizzle-orm";
import { ProfileForm } from "./profile-form";
import { TfaPanel } from "./tfa-panel";

export const metadata = { title: "Profile" };

export default async function ProfilePage() {
  const session = await auth();
  if (!session?.user) return <p className="text-sm text-muted-foreground">Not signed in.</p>;

  const [user] = db
    .select({ name: users.name, email: users.email, totp_enabled: users.totp_enabled })
    .from(users)
    .where(eq(users.email, session.user.email ?? ""))
    .limit(1)
    .all();

  if (!user) {
    return (
      <div className="rounded-xl border border-dashed p-8 text-center">
        <p className="text-sm font-medium">Profile not found</p>
        <p className="mt-1 text-sm text-muted-foreground">Your session exists but the user record is missing. Try signing out and back in.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Profile</h1>
        <p className="mt-1 text-sm text-muted-foreground break-all">{user.email} · 2FA {user.totp_enabled ? "enabled ✓" : "off"}</p>
      </div>
      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <ProfileForm name={user.name ?? ""} />
        <TfaPanel initiallyEnabled={Boolean(user.totp_enabled)} />
      </div>
      <p className="text-xs text-muted-foreground">Password changes re-hash with Argon2id 64MB · TOTP RFC6238 30s · All profile actions are audit-logged.</p>
    </div>
  );
}