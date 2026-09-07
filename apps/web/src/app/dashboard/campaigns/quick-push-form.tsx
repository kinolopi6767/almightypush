"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * B8 Quick Push: paste a page URL → jump to the campaign composer with the
 * URL prefilled and OG content auto-fetched. One paste, one click to send.
 */
export function QuickPushForm() {
  const router = useRouter();
  const [url, setUrl] = useState("");

  return (
    <form
      className="panel flex flex-col gap-2 p-4 sm:flex-row sm:items-end"
      onSubmit={(e) => {
        e.preventDefault();
        const trimmed = url.trim();
        if (!trimmed) return;
        router.push(`/dashboard/campaigns/new?url=${encodeURIComponent(trimmed)}&autofetch=1`);
      }}
    >
      <div className="min-w-0 flex-1">
        <label htmlFor="quick-push-url" className="micro-label">
          Quick push — paste a page URL
        </label>
        <input
          id="quick-push-url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://example.com/new-post"
          inputMode="url"
          autoComplete="off"
          spellCheck={false}
          className="input mt-1"
        />
      </div>
      <button type="submit" disabled={!url.trim()} className="btn btn-secondary shrink-0">
        Quick push →
      </button>
    </form>
  );
}
