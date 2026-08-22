import { and, eq, sql } from "drizzle-orm";
import { automations } from "@pushpanel/db";
import { assertPublicHttpUrl, hasCronSchedule, nextCronRun, parseAutomationConfig, sha256Hex, type AutomationConfig } from "@pushpanel/core";
import { enqueueAutomationCampaign, recordAutomationRun, type AutomationPayload, type PushDb } from "@pushpanel/db";
import Parser from "rss-parser";

export interface AutomationRunStats {
  ran: number;
  ok: number;
  failed: number;
  campaigns: number;
}

interface AutomationRow {
  id: number;
  workspace_id: number;
  domain_id: number | null;
  type: string;
  config_json: string | null;
  consecutive_failures: number;
}

/** C4: auto-pause an automation after this many consecutive poll failures. */
export const MAX_CONSECUTIVE_FAILURES = 3;
/** C4: how soon a failed poll is retried (a dead source is probed quickly, not after the full interval). */
export const FAILURE_RETRY_MINUTES = 3;

/**
 * M4 automation runner — runs once per worker tick.
 * Picks active automations whose `next_run_at` is due, dispatches the type
 * handler, re-arms the interval, and records a run in automation_runs.
 * `push_on_publish`/`welcome_push` are event-driven: the webhook/subscribe
 * path sets `next_run_at` to now; after a run their slot is cleared.
 */
export async function runAutomations(db: PushDb, now: Date = new Date()): Promise<AutomationRunStats> {
  const nowIso = now.toISOString();
  const stats: AutomationRunStats = { ran: 0, ok: 0, failed: 0, campaigns: 0 };

  const rows = db
    .select({
      id: automations.id,
      workspace_id: automations.workspace_id,
      domain_id: automations.domain_id,
      type: automations.type,
      config_json: automations.config_json,
      consecutive_failures: automations.consecutive_failures,
    })
    .from(automations)
    .where(
      and(
        eq(automations.status, "active"),
        sql`(${automations.next_run_at} IS NOT NULL AND ${automations.next_run_at} <= ${nowIso})`,
      ),
    )
    .orderBy(automations.id)
    .all();

  for (const row of rows) {
    const config = parseAutomationConfig(row.config_json);
    const outcome = await handleAutomation(db, row, config, now);
    stats.ran++;
    if (outcome.ok) {
      stats.ok++;
      stats.campaigns += outcome.campaigns;
    } else {
      stats.failed++;
    }

    const next = outcome.ok ? nextRunAt(row, config, now) : new Date(now.getTime() + FAILURE_RETRY_MINUTES * 60_000);
    const fails = outcome.ok ? 0 : (row.consecutive_failures ?? 0) + 1;
    const autoPaused = !outcome.ok && fails >= MAX_CONSECUTIVE_FAILURES;
    const error = outcome.ok ? null : autoPaused ? `Auto-paused after ${fails} consecutive failures: ${outcome.error}` : outcome.error;
    // Bookkeeping is inside per-row isolation: if the automation row was
    // deleted concurrently (or the run insert hits a lock), one bad row must
    // not abort the rest of the tick.
    try {
      db.update(automations)
        .set({
          last_run_at: nowIso,
          next_run_at: autoPaused ? null : next ? next.toISOString() : null,
          status: autoPaused ? "paused" : "active",
          consecutive_failures: fails,
          error,
        })
        .where(eq(automations.id, row.id))
        .run();
      recordAutomationRun(db, row.id, outcome.ok ? "ok" : "error", outcome.ok ? `queued ${outcome.queued} deliveries` : outcome.error);
    } catch {
      void 0;
    }
  }

  return stats;
}

interface HandlerResult {
  ok: boolean;
  campaigns: number;
  queued: number;
  error?: string;
}

function ok(campaigns: number, queued: number): HandlerResult {
  return { ok: true, campaigns, queued };
}

async function handleAutomation(db: PushDb, row: AutomationRow, config: AutomationConfig, now: Date): Promise<HandlerResult> {
  if (!row.domain_id) return { ok: false, campaigns: 0, queued: 0, error: "No domain assigned" };

  try {
    switch (row.type) {
      case "welcome_push":
      case "push_on_publish": {
        const result = enqueueAutomationCampaign({
          db,
          workspaceId: row.workspace_id,
          domainId: row.domain_id,
          automationId: row.id,
          payload: config.payload,
          now,
        });
        return ok(1, result.queued);
      }
      case "automagic_dynamic": {
        const post = await pickRandomPost(config);
        if (!post) return { ok: false, campaigns: 0, queued: 0, error: "No posts available from source" };
        const result = enqueueAutomationCampaign({
          db,
          workspaceId: row.workspace_id,
          domainId: row.domain_id,
          automationId: row.id,
          payload: post,
          now,
        });
        return ok(1, result.queued);
      }
      case "automagic_static": {
        const picked = pickStaticPost(config);
        if (!picked) return { ok: false, campaigns: 0, queued: 0, error: "Rotation list is empty" };
        const result = enqueueAutomationCampaign({
          db,
          workspaceId: row.workspace_id,
          domainId: row.domain_id,
          automationId: row.id,
          payload: { ...config.payload, title: picked.post.title ?? config.payload.title, message: picked.post.body ?? config.payload.message, launch_url: picked.post.url ?? config.payload.launch_url },
          now,
        });
        // Persist the rotation cursor only after the enqueue succeeded —
        // otherwise a failed send loses the rotated item forever.
        saveAutomationConfig(db, row.id, picked.updated);
        return ok(1, result.queued);
      }
      case "youtube_push": {
        const video = await latestVideo(config);
        if (!video.item) return ok(0, 0);
        const result = enqueueAutomationCampaign({
          db,
          workspaceId: row.workspace_id,
          domainId: row.domain_id,
          automationId: row.id,
          payload: { ...config.payload, title: video.item.title ?? config.payload.title, launch_url: video.item.url ?? config.payload.launch_url },
          now,
        });
        saveAutomationConfig(db, row.id, video.updated!);
        return ok(1, result.queued);
      }
      case "rss_push": {
        const feed = await latestFeedItem(config);
        if (!feed.item) return ok(0, 0);
        const result = enqueueAutomationCampaign({
          db,
          workspaceId: row.workspace_id,
          domainId: row.domain_id,
          automationId: row.id,
          payload: { ...config.payload, title: feed.item.title ?? config.payload.title, message: feed.item.body ?? config.payload.message, launch_url: feed.item.url ?? config.payload.launch_url },
          now,
        });
        saveAutomationConfig(db, row.id, feed.updated!);
        return ok(1, result.queued);
      }
      case "drip": {
        // Normally fired by the subscribe hook per subscriber; this path
        // covers manual "run now" triggers — enqueue to every active sub.
        const steps = config.steps ?? [];
        if (steps.length === 0) return { ok: false, campaigns: 0, queued: 0, error: "Drip sequence has no steps" };
        let queued = 0;
        let cumulativeSeconds = 0;
        for (const step of steps) {
          cumulativeSeconds += (step.delay_days ?? 0) * 86_400;
          const result = enqueueAutomationCampaign({
            db,
            workspaceId: row.workspace_id,
            domainId: row.domain_id,
            automationId: row.id,
            payload: { ...config.payload, title: step.title, message: step.message, launch_url: step.launch_url },
            delaySeconds: cumulativeSeconds,
            now,
          });
          queued += result.queued;
        }
        return ok(steps.length, queued);
      }
      default:
        return { ok: false, campaigns: 0, queued: 0, error: `Unknown automation type: ${row.type}` };
    }
  } catch (error) {
    const err = error as Error & { cause?: unknown };
    const cause = err.cause instanceof Error ? ` (cause: ${err.cause.message})` : err.cause ? ` (cause: ${String(err.cause)})` : "";
    return { ok: false, campaigns: 0, queued: 0, error: `${err.message}${cause}` };
  }
}

/** AutoMagic dynamic: newest `range` posts from a WordPress REST API, random pick. */
async function pickRandomPost(config: AutomationConfig): Promise<AutomationPayload | null> {
  if (!config.source_url) throw new Error("source_url is required");
  const posts = await fetchPosts(config.source_url, config.range ?? 10);
  if (posts.length === 0) return null;
  const pick = posts[Math.floor(Math.random() * posts.length)]!;
  return normalizePost(pick as Record<string, unknown>);
}

interface FeedItem {
  title?: string;
  body?: string;
  url?: string;
}

/** AutoMagic static: round-robin over the curated rotation list (pure — caller persists cursor). */
function pickStaticPost(config: AutomationConfig): { post: FeedItem; updated: AutomationConfig } | null {
  let list: FeedItem[] = [];
  try {
    const parsed = config.rotation_json ? JSON.parse(config.rotation_json) : [];
    list = Array.isArray(parsed) ? parsed : [];
  } catch {
    list = [];
  }
  if (list.length === 0) return null;

  const idx = config.rotation_index ?? 0;
  const post = list[idx % list.length] ?? null;
  if (!post) return null;
  return { post, updated: { ...config, rotation_index: idx + 1 } };
}

/** Persist automation config (dedupe cursors). Call only after successful dispatch. */
function saveAutomationConfig(db: PushDb, id: number, config: AutomationConfig): void {
  db.update(automations)
    .set({ config_json: JSON.stringify(config) })
    .where(eq(automations.id, id))
    .run();
}

/** YouTube push: RSS feed poll; only fires when a newer video appears (pure — caller persists cursor). */
async function latestVideo(config: AutomationConfig): Promise<{ item: FeedItem | null; updated?: AutomationConfig }> {
  if (!config.feed_url) throw new Error("feed_url is required");
  const xml = await fetchText(config.feed_url);
  const parser = new Parser();
  const feed = await parser.parseString(xml);
  const entry = feed.items[0];
  if (!entry) return { item: null };

  const videoId = entry.guid?.replace("yt:video:", "") ?? entry.link ?? null;
  const lastId = config.last_video_id ?? null;
  if (lastId && (!videoId || videoId === lastId)) return { item: null };

  return {
    item: { title: entry.title ?? undefined, body: undefined, url: entry.link ?? undefined },
    updated: { ...config, last_video_id: videoId ?? undefined },
  };
}

/** C5: generic RSS/Atom publish poll — dedupe key is guid ?? id ?? link (pure — caller persists cursor). */
export interface RssFeedItem {
  title?: string;
  guid?: string;
  id?: string;
  link?: string;
  isoDate?: string;
  contentSnippet?: string;
  summary?: string;
}

export async function latestFeedItem(config: AutomationConfig): Promise<{ item: FeedItem | null; updated?: AutomationConfig }> {
  const xml = await fetchText(config.feed_url ?? "");
  const parser = new Parser();
  const feed = await parser.parseString(xml);
  const entry = pickNewestChangedItem(feed.items as RssFeedItem[], config.last_item_guid);
  if (!entry) return { item: null };

  return {
    item: {
      title: entry.title ?? undefined,
      body: entry.contentSnippet ?? entry.summary ?? undefined,
      url: entry.link ?? undefined,
    },
    updated: { ...config, last_item_guid: itemGuid(entry) },
  };
}

export function itemGuid(item: RssFeedItem): string {
  const stable = item.guid?.trim() || item.id?.trim() || item.link?.trim() || item.isoDate || "";
  if (stable) return stable;
  // Never fall back to a random value: a random key would never match the
  // next poll, so the same guid-less item would be pushed again and again.
  // Hash the content instead — stable per item.
  return sha256Hex(`${item.title ?? ""}|${item.contentSnippet ?? item.summary ?? ""}`);
}

/**
 * Newest item from a parsed feed whose guid differs from the last sent one
 * (mirrors the YouTube dedupe: only the newest entry is considered).
 */
export function pickNewestChangedItem(items: RssFeedItem[], lastGuid?: string | null): RssFeedItem | null {
  const first = items[0];
  if (!first) return null;
  if (lastGuid && itemGuid(first) === lastGuid) return null;
  return first;
}

function nextRunAt(row: AutomationRow, config: AutomationConfig, now: Date): Date | null {
  if (row.type === "push_on_publish" || row.type === "welcome_push" || row.type === "drip") return null;
  if (hasCronSchedule(config)) {
    const cronNext = nextCronRun(config.schedule_cron ?? "", now);
    if (cronNext) return cronNext;
  }
  return new Date(now.getTime() + (config.interval_minutes ?? 15) * 60_000);
}

const MAX_FETCH_BYTES = 1024 * 1024;
const MAX_REDIRECTS = 3;

/**
 * SSRF-aware fetch: every hop (including redirect targets) is re-validated
 * with assertPublicHttpUrl before the request is made, redirects are capped
 * (the default `redirect: "follow"` would skip re-validation), and the
 * response body is size-capped so a hostile feed cannot exhaust memory.
 */
async function safeFetch(sourceUrl: string, path: (base: URL) => URL): Promise<{ text: string; url: URL }> {
  let current = new URL(sourceUrl);
  for (let hops = 0; ; hops++) {
    const checked = await assertPublicHttpUrl(current.toString());
    if (!checked.ok || !checked.url) throw new Error(checked.error ?? "Invalid source URL");
    const target = path(checked.url);
    const res = await fetch(target, { signal: AbortSignal.timeout(10_000), redirect: "manual" });
    if ([301, 302, 303, 307, 308].includes(res.status)) {
      const location = res.headers.get("location");
      if (!location) throw new Error("Redirect without location");
      if (hops >= MAX_REDIRECTS) throw new Error("Too many redirects");
      current = new URL(location, target);
      continue;
    }
    if (!res.ok) throw new Error(`Source returned HTTP ${res.status}`);
    // Stream with a cumulative byte cap: res.text() would buffer the whole
    // body BEFORE the size check — a hostile source could OOM the worker.
    const reader = res.body?.getReader();
    if (!reader) throw new Error("Source returned no body");
    const chunks: Uint8Array[] = [];
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_FETCH_BYTES) {
        void reader.cancel();
        throw new Error("Source response too large");
      }
      chunks.push(value);
    }
    const text = Buffer.concat(chunks).toString("utf8");
    return { text, url: target };
  }
}

async function fetchPosts(sourceUrl: string, range: number): Promise<unknown[]> {
  const { text } = await safeFetch(sourceUrl, (_base) => {
    const url = new URL(`${sourceUrl.replace(/\/+$/, "")}/wp-json/wp/v2/posts`);
    url.searchParams.set("per_page", String(Math.min(range, 100)));
    return url;
  });
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("Source did not return valid JSON");
  }
  if (!Array.isArray(data)) throw new Error("Source did not return a post array");
  return data.slice(0, range);
}

async function fetchText(sourceUrl: string): Promise<string> {
  const { text } = await safeFetch(sourceUrl, (base) => new URL(base.toString()));
  return text;
}

function normalizePost(item: Record<string, unknown>): AutomationPayload {
  const title = typeof item.title === "object" && item.title !== null
    ? (item.title as Record<string, unknown>).rendered
    : item.title;
  const excerpt = typeof item.excerpt === "object" && item.excerpt !== null
    ? (item.excerpt as Record<string, unknown>).rendered
    : null;
  const body = typeof excerpt === "string" ? stripHtml(excerpt) : "";
  return {
    title: stripHtml(String(title ?? "Update")).slice(0, 200),
    message: body.slice(0, 500) || null,
    launch_url: typeof item.link === "string" ? item.link : null,
  };
}

function stripHtml(input: string): string {
  return input
    .replace(/<[^>]*>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
