/**
 * Central RBAC helpers for server actions and pages.
 *
 * Roles: owner > admin > editor > viewer (read-only).
 * Fail closed: unknown/missing role is treated as viewer.
 */
export type Role = "owner" | "admin" | "editor" | "viewer";

const RANK: Record<string, number> = {
  viewer: 0,
  editor: 1,
  admin: 2,
  owner: 3,
};

export function normalizeRole(role: string | null | undefined): Role {
  const r = (role ?? "viewer").toLowerCase();
  if (r === "owner" || r === "admin" || r === "editor" || r === "viewer") return r;
  return "viewer";
}

/** True if role can mutate content (campaigns, segments, templates, links, channels, automations, email, domains). */
export function canEdit(role: string | null | undefined): boolean {
  return (RANK[normalizeRole(role)] ?? 0) >= (RANK.editor ?? 1);
}

/** True for owner/admin only (API keys, team invites, test-connection, metrics). */
export function canManage(role: string | null | undefined): boolean {
  return (RANK[normalizeRole(role)] ?? 0) >= (RANK.admin ?? 2);
}

/** True for owner only (settings, secrets, backups, outbound). */
export function isOwner(role: string | null | undefined): boolean {
  return normalizeRole(role) === "owner";
}

/** Error message or null when allowed to edit. */
export function requireEditorRole(role: string | null | undefined): string | null {
  if (!canEdit(role)) return "Viewers cannot create or manage content";
  return null;
}

/** Error message or null when owner/admin required. */
export function requireManagerRole(role: string | null | undefined): string | null {
  if (!canManage(role)) return "Only owners and admins can perform this action";
  return null;
}

/** Error message or null when owner required. */
export function requireOwnerRole(role: string | null | undefined): string | null {
  if (!isOwner(role)) return "Only owners can perform this action";
  return null;
}
