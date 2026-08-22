import { redirect } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { auth } from "@/auth";
import { apiKeys, domains } from "@pushpanel/db/schema";
import { OPENAPI_SPEC } from "@/lib/openapi";
import { readApiAccessEnabled } from "@/lib/api-auth";
import { CreateApiKeyForm, RevokeApiKeyButton } from "./key-form";

export const metadata = { title: "API" };

export default async function ApiPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const workspaceId = session.user.workspaceId ? Number(session.user.workspaceId) : null;
  if (!workspaceId) redirect("/setup");

  const accessEnabled = readApiAccessEnabled();

  const keys = workspaceId
    ? db
        .select({
          id: apiKeys.id,
          label: apiKeys.label,
          domain_id: apiKeys.domain_id,
          expires_at: apiKeys.expires_at,
          last_used_at: apiKeys.last_used_at,
          created_at: apiKeys.created_at,
        })
        .from(apiKeys)
        .where(eq(apiKeys.workspace_id, workspaceId))
        .orderBy(desc(apiKeys.id))
        .all()
    : [];

  const wsDomains = workspaceId
    ? db.select({ id: domains.id, name: domains.name }).from(domains).where(eq(domains.workspace_id, workspaceId)).orderBy(domains.name).all()
    : [];

  const paths = OPENAPI_SPEC.paths;
  const pathCount = Object.keys(paths).length;

  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">API</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        REST API v1 for developers — unlimited calls, key-authenticated with per-key rate limiting.
      </p>

      {!accessEnabled && (
        <p className="mt-4 rounded-md bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-300">
          API access is currently disabled (Settings → Advanced). Existing keys are kept but all v1 key-authenticated
          requests are refused until you turn it back on.
        </p>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_360px]">
        <div>
          <div className="rounded-xl border bg-card p-4">
            <h2 className="text-sm font-medium">API keys</h2>
            {keys.length === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">
                No keys yet — create one below and use it as the <code className="rounded bg-muted px-1 font-mono text-xs">X-Api-Key</code> header.
              </p>
            ) : (
              <ul className="mt-3 space-y-2 text-sm">
                {keys.map((k) => (
                  <li key={k.id} className="flex items-center justify-between gap-3 rounded-md border px-3 py-2">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{k.label}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        created {new Date(k.created_at).toLocaleDateString()}
                        {k.domain_id ? " · scoped to one domain" : " · all domains"}
                        {k.expires_at && ` · expires ${new Date(k.expires_at).toLocaleDateString()}`}
                        {k.last_used_at ? ` · last used ${new Date(k.last_used_at).toLocaleString()}` : " · never used"}
                      </p>
                    </div>
                    <RevokeApiKeyButton keyId={k.id} label={k.label} />
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="mt-4 rounded-xl border bg-card p-4">
            <h2 className="text-sm font-medium">Usage</h2>
            <pre className="mt-3 overflow-x-auto rounded-md bg-muted p-3 text-xs">
{`curl -X POST https://panel.example.com/api/v1/send \\
  -H "Content-Type: application/json" \\
  -H "X-Api-Key: ppk_live_..." \\
  -d '{ "domain": "example.com", "title": "Hello", "message": "World" }'`}
            </pre>
            <p className="mt-3 text-xs text-muted-foreground">
              Machine-readable spec:{" "}
              <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">GET /api/v1/openapi.json</code> · {pathCount} endpoints documented.
            </p>
          </div>
        </div>

        <div className="space-y-4">
          <CreateApiKeyForm domains={wsDomains} disabled={!accessEnabled} />
          <div className="rounded-xl border bg-card p-4 text-sm text-muted-foreground">
            <h3 className="font-medium text-foreground">Endpoint list</h3>
            <ul className="mt-2 space-y-1">
              {Object.entries(paths).map(([path]) => (
                <li key={path} className="font-mono text-xs">
                  {path}
                </li>
              ))}
            </ul>
            <a href="/api/v1/openapi.json" target="_blank" rel="noreferrer" className="mt-3 inline-block text-xs text-primary hover:underline">
              OpenAPI spec →
            </a>
          </div>
        </div>
      </div>
    </>
  );
}