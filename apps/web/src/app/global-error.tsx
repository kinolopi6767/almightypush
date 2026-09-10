"use client";

/**
 * Last-resort boundary for errors thrown in the root layout itself. Must
 * render its own <html>/<body> (Next.js requirement) and cannot rely on the
 * app shell, so styles are inline and minimal.
 */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "system-ui, sans-serif",
          background: "#0b1210",
          color: "#e6efe9",
        }}
      >
        <main style={{ maxWidth: 420, padding: 32, textAlign: "center" }}>
          <h1 style={{ fontSize: 18, margin: "0 0 8px" }}>PushPanel failed to load</h1>
          <p style={{ fontSize: 14, opacity: 0.75, lineHeight: 1.5 }}>
            An unexpected error occurred while rendering the application shell.
          </p>
          {error.digest ? (
            <p style={{ fontFamily: "monospace", fontSize: 12, opacity: 0.6, wordBreak: "break-all" }}>Digest: {error.digest}</p>
          ) : null}
          <button
            type="button"
            onClick={() => reset()}
            style={{ marginTop: 20, padding: "10px 16px", borderRadius: 6, border: 0, cursor: "pointer", fontWeight: 600 }}
          >
            Reload
          </button>
        </main>
      </body>
    </html>
  );
}
