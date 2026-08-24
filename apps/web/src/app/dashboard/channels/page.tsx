import { ChannelForm } from "./channel-form";
import { deleteChannelAction, listChannels, toggleChannelAction, type Channel } from "./actions";
import { SubmitButton } from "@/components/submit-button";
import { EmptyState } from "@/components/empty-state";

export const metadata = { title: "YouTube channels" };

export default async function ChannelsPage() {
  const rows: Channel[] = await listChannels();

  return (
    <>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">YouTube channels</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Channel landing pages that capture push subscribers before sending visitors to YouTube.
          </p>
        </div>
        <ChannelForm />
      </div>

      <div className="mt-8 space-y-3">
        {rows.length === 0 && (
          <EmptyState
            icon={<path d="M22.54 6.42a2.78 2.78 0 0 1-1.94 2C18.88 9 12 9 12 9s-6.88 0-8.6-.46a2.78 2.78 0 0 1-1.94-2A29 29 0 0 1 1 11.75a29 29 0 0 1 .46-5.33A2.78 2.78 0 0 1 3.4 2c1.72-.46 8.6-.46 8.6-.46z" />}
            title="No channels yet"
            description="Add a YouTube channel to create a landing page that captures push subscribers before sending visitors to YouTube."
          />
        )}
        {rows.map((row) => (
          <div key={row.id} className="card-lift rounded-xl border bg-card p-5 shadow-[var(--shadow-card)] transition-colors hover:bg-accent/30">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="truncate font-medium">{row.title ?? row.channel_url}</span>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${
                      row.status === "active" ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400" : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {row.status}
                  </span>
                  <span className="shrink-0 rounded-full bg-muted px-2.5 py-1 text-xs tabular-nums text-muted-foreground">
                    {(row.clicks_count ?? 0).toLocaleString()} clicks · {(row.desktop_subs + row.mobile_subs).toLocaleString()} subs
                  </span>
                </div>
                <p className="mt-1 break-all text-sm text-muted-foreground">
                  <a href={row.channel_url} target="_blank" rel="noreferrer" className="break-all text-primary hover:underline">
                    {row.channel_url}
                  </a>
                </p>
                {row.lp_code && (
                  <a href={`/p/${row.lp_code}`} className="mt-1 inline-block break-all font-mono text-xs text-primary hover:underline">
                    /p/{row.lp_code}
                  </a>
                )}
                {row.prompt_text && <p className="mt-1 break-words text-sm text-muted-foreground">“{row.prompt_text}”</p>}
                <p className="mt-1 text-xs text-muted-foreground">
                  last video {row.last_video_at ? new Date(row.last_video_at).toLocaleString() : "—"} · last polled{" "}
                  {row.last_polled_at ? new Date(row.last_polled_at).toLocaleString() : "—"}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2 self-start">
                <form action={toggleChannelAction.bind(null, row.id)}>
                  <SubmitButton
                    pendingLabel="Deleting…"
                    className="inline-flex h-8 items-center rounded-md border border-input bg-background px-3 text-xs font-medium shadow-sm transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
                  >
                    {row.status === "active" ? "Pause" : "Resume"}
                  </SubmitButton>
                </form>
                <form action={deleteChannelAction.bind(null, row.id)}>
                  <SubmitButton
                    confirm={`Delete channel "${row.title}"? This cannot be undone.`}
                    pendingLabel="Deleting…"
                    className="inline-flex h-8 items-center rounded-md border border-destructive/30 bg-background px-3 text-xs font-medium text-destructive shadow-sm transition-colors hover:bg-destructive/10 disabled:opacity-50"
                  >
                    Delete
                  </SubmitButton>
                </form>
              </div>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}