import { ChannelForm } from "./channel-form";
import { deleteChannelAction, listChannels, toggleChannelAction, type Channel } from "./actions";

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
          <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
            No channels yet — add one to start capturing subscribers.
          </div>
        )}
        {rows.map((row) => (
          <div key={row.id} className="rounded-xl border bg-card p-4">
            <div className="flex flex-wrap items-center gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{row.title ?? row.channel_url}</span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs ${
                      row.status === "active" ? "bg-emerald-500/15 text-emerald-700" : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {row.status}
                  </span>
                </div>
                <p className="mt-0.5 break-all text-sm text-muted-foreground">
                  <a href={row.channel_url} target="_blank" rel="noreferrer" className="text-primary hover:underline">
                    {row.channel_url}
                  </a>
                </p>
                {row.lp_code && (
                  <a href={`/p/${row.lp_code}`} className="mt-0.5 inline-block text-sm text-primary hover:underline">
                    /p/{row.lp_code}
                  </a>
                )}
                {row.prompt_text && <p className="mt-0.5 text-sm text-muted-foreground">“{row.prompt_text}”</p>}
                <p className="mt-0.5 text-xs text-muted-foreground">
                  last video {row.last_video_at ?? "—"} · last polled {row.last_polled_at ?? "—"}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-4 text-sm text-muted-foreground">
                <span>{row.clicks_count} clicks</span>
                <span>{row.desktop_subs + row.mobile_subs} subs</span>
                <form action={toggleChannelAction.bind(null, row.id)}>
                  <button type="submit" className="hover:text-foreground">
                    {row.status === "active" ? "Pause" : "Resume"}
                  </button>
                </form>
                <form action={deleteChannelAction.bind(null, row.id)}>
                  <button type="submit" className="text-muted-foreground hover:text-destructive">
                    Delete
                  </button>
                </form>
              </div>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}