import { auth } from "@/auth";
import { db } from "@/lib/db";
import { users } from "@pushpanel/db/schema";
import { eq } from "drizzle-orm";
import { ProfileForm } from "./profile-form";

export const metadata = { title: "Profile" };

export default async function ProfilePage() {
  const session = await auth();
  if (!session?.user) return <p className="text-sm text-muted-foreground">Not signed in.</p>;

  const [user] = db
    .select({ name: users.name, email: users.email })
    .from(users)
    .where(eq(users.email, session.user.email ?? ""))
    .limit(1)
    .all();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Profile</h1>
        <p className="text-sm text-muted-foreground">{user?.email}</p>
      </div>
      <ProfileForm name={user?.name ?? ""} />
    </div>
  );
}
