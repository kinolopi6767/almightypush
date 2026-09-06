import Link from "next/link";
import { getInvitePreview } from "@/app/dashboard/team/actions";
import { InviteAcceptForm } from "@/components/invite-accept-form";
import { AuthShell } from "@/components/auth-shell";

export const metadata = { title: "Team invite" };
export const dynamic = "force-dynamic";

/**
 * Invite redemption page — /invite/<token>. The token arrives in plaintext
 * (shared by the owner), validated against its stored SHA-256; the account
 * is created inside the inviting workspace with the invited role.
 */
export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  let preview: Awaited<ReturnType<typeof getInvitePreview>> = { valid: false };
  try {
    preview = await getInvitePreview(token);
  } catch {
    preview = { valid: false };
  }

  return (
    <AuthShell
      title="Join PushPanel"
      description={preview.valid ? "You've been invited to a workspace." : "This invite is invalid, expired, or already used."}
    >
      {preview.valid ? (
        <div className="auth-card">
          <InviteAcceptForm token={token} email={preview.email} role={preview.role} />
        </div>
      ) : (
        <div className="panel p-4 text-center text-[13px] text-[var(--ink-2)]">
          Ask the workspace owner to resend the invitation, then open the new link.
        </div>
      )}
      <p className="text-center text-xs text-[var(--ink-3)]">
        Already have an account?{" "}
        <Link href="/login" className="underline underline-offset-4 hover:text-[var(--ink)]">
          Sign in
        </Link>
      </p>
    </AuthShell>
  );
}
