import { OPENAPI_SPEC } from "@/lib/openapi";

export const metadata = { title: "API reference" };

function methodColor(method: string): string {
  switch (method) {
    case "get":
      return "bg-emerald-500/15 text-emerald-600";
    case "post":
      return "bg-sky-500/15 text-sky-600";
    default:
      return "bg-muted text-muted-foreground";
  }
}

export default function ApiDocsPage() {
  const paths = OPENAPI_SPEC.paths;

  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">API reference</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Public PushPanel API v1 — the client SDK, webhooks and CMS integrations use these endpoints.
      </p>

      <div className="mt-8 space-y-4">
        {Object.entries(paths).map(([path, operations]) =>
          Object.entries(operations).map(([method, op]) => {
            const typed = op as { summary?: string; description?: string; responses?: Record<string, { description?: string }> };
            return (
              <div key={`${method}-${path}`} className="rounded-xl border bg-card p-5">
                <div className="flex items-center gap-3">
                  <span className={`rounded-md px-2 py-0.5 text-xs font-semibold uppercase ${methodColor(method)}`}>{method}</span>
                  <code className="font-mono text-sm">{path}</code>
                </div>
                <p className="mt-2 text-sm font-medium">{typed.summary}</p>
                {typed.description && <p className="mt-1 text-sm text-muted-foreground">{typed.description}</p>}
                <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Responses</p>
                <ul className="mt-1 space-y-0.5">
                  {typed.responses &&
                    Object.entries(typed.responses).map(([code, r]) => (
                      <li key={code} className="text-sm text-muted-foreground">
                        <span className="font-mono text-foreground">{code}</span> — {r.description ?? ""}
                      </li>
                    ))}
                </ul>
              </div>
            );
          }),
        )}
        <p className="text-sm text-muted-foreground">
          Machine-readable spec:{" "}
          <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">GET /api/v1/openapi.json</code>
        </p>
      </div>
    </>
  );
}