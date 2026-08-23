import Link from "next/link";
import { getInvitePreview } from "@/app/dashboard/team/actions";
import { InviteAcceptForm } from "@/components/invite-accept-form";

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
    <div className="app-shell relative flex min-h-svh items-center justify-center px-4 py-12">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-64 bg-gradient-to-b from-primary/10 to-transparent" />
      <div className="relative w-full max-w-sm space-y-6">
        <div className="space-y-3 text-center">
          <span className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-primary/55 text-base font-bold text-primary-foreground shadow-[0_8px_24px_-6px_color-mix(in_oklab,var(--primary)_60%,transparent)]">
            P
          </span>
          <div className="space-y-1.5">
            <h1 className="text-2xl font-semibold tracking-tight">Join PushPanel</h1>
            <p className="text-sm text-muted-foreground">
              {preview.valid ? "You've been invited to a workspace." : "This invite is invalid, expired, or already used."}
            </p>
          </div>
        </div>
        {preview.valid ? (
          <div className="surface space-y-4 rounded-2xl p-6 [box-shadow:var(--shadow-pop)]">
            <InviteAcceptForm token={token} email={preview.email} role={preview.role} />
          </div>
        ) : (
          <div className="surface rounded-2xl p-6 text-center text-sm text-muted-foreground">
            Ask the workspace owner to resend the invitation, then open the new link.
          </div>
        )}
        <p className="text-center text-xs text-muted-foreground">
          Already have an account?{" "}
          <Link href="/login" className="underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
