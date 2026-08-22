/**
 * LumaPush AI Studio — 8 tools.
 * All functions are pure/offline-safe: when no AI key is configured they
 * fall back to deterministic heuristics so the panel stays usable offline.
 * Plug in OpenAI/Anthropic by setting `AI_API_KEY` + `AI_MODEL`.
 */

/** AI feature kinds: hook | spam_score | translate | url_to_campaign | automagic | smart_send */

export interface HookAngle {
  angle: string;
  title: string;
  message?: string;
}

const FALLBACK_HOOKS: Record<string, HookAngle[]> = {
  deals: [
    { angle: "curiosity", title: "You won't believe this deal", message: "Tap to see what's waiting" },
    { angle: "pain", title: "Still paying full price?", message: "This ends tonight" },
    { angle: "proof", title: "12,400 people claimed today", message: "Your turn" },
  ],
  news: [
    { angle: "outcome", title: "Breaking: what changes today", message: "Read the 2-min summary" },
    { angle: "contrast", title: "What media won't tell you", message: "The full story inside" },
    { angle: "curiosity", title: "This just happened", message: "Why it matters for you" },
  ],
};

export function generateHookAngles(topic: string, count = 3): HookAngle[] {
  const key = topic.toLowerCase().includes("deal") || topic.toLowerCase().includes("sale") ? "deals" : "news";
  const base = FALLBACK_HOOKS[key] ?? FALLBACK_HOOKS.news!;
  // deterministic rotation + topic injection
  return base.slice(0, count).map((h) => ({
    angle: h.angle,
    title: h.title.replace("this", topic.slice(0, 24) || "this"),
    message: h.message,
  }));
}

export interface AiConfig {
  apiKey?: string | null;
  model?: string | null;
  baseUrl?: string | null;
}

function resolveAiConfig(overrides?: AiConfig): { key: string | null; model: string; baseUrl: string } {
  const key = overrides?.apiKey ?? process.env.AI_API_KEY ?? null;
  const model = overrides?.model ?? process.env.AI_MODEL ?? "gpt-4o-mini";
  const baseUrl = overrides?.baseUrl ?? process.env.AI_BASE_URL ?? "https://api.openai.com/v1";
  return { key: key || null, model, baseUrl };
}

/** Async LLM variant — uses OpenAI-compatible chat completions when AI_API_KEY is set */
export async function generateHookAnglesAI(topic: string, count = 3, config?: AiConfig): Promise<HookAngle[]> {
  const { key, model, baseUrl } = resolveAiConfig(config);
  if (!key) return generateHookAngles(topic, count);

  const prompt = `Generate ${count} high-converting push notification hook angles for topic "${topic}".
Angles must be one of: curiosity, contrast, proof, pain, outcome.
Return JSON array of {angle, title, message} where title 30-45 chars, message 50-90 chars, on-brand, no spam words.`;

  try {
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model,
        temperature: 0.7,
        messages: [
          { role: "system", content: "You are a push notification copy expert. Return valid JSON only." },
          { role: "user", content: prompt },
        ],
        max_tokens: 600,
      }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) throw new Error(`LLM ${res.status}`);
    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const content = data.choices?.[0]?.message?.content?.trim() ?? "";
    const jsonStr = content.match(/\[.*\]/s)?.[0] ?? content;
    const parsed = JSON.parse(jsonStr) as HookAngle[];
    if (Array.isArray(parsed) && parsed.length > 0) return parsed.slice(0, count);
  } catch {
    // fall through to heuristic
  }
  return generateHookAngles(topic, count);
}

export interface SpamScore {
  score: number; // 0-100, lower is better
  risk: "low" | "medium" | "high";
  issues: string[];
}

/** Heuristic spam check (offline fallback mirrors LumaPush Spam Score Checker) */
export function checkSpamScore(title: string, body?: string): SpamScore {
  const text = `${title} ${body ?? ""}`.toLowerCase();
  const issues: string[] = [];
  let score = 0;
  if (/\b(free|winner|urgent|act now|click here)\b/.test(text)) {
    score += 30;
    issues.push("Spam trigger words (free/winner/urgent)");
  }
  if ((text.match(/!/g) ?? []).length >= 3) {
    score += 20;
    issues.push("Excessive exclamation marks");
  }
  if (text.includes("$$$") || /\b(buy now|limited time)\b/.test(text)) {
    score += 15;
    issues.push("Sales pressure language");
  }
  if (title.length > 60) {
    score += 10;
    issues.push("Title over 60 chars may truncate");
  }
  if (title === title.toUpperCase() && title.length > 5) {
    score += 15;
    issues.push("All caps title");
  }
  const risk = score < 30 ? "low" : score < 60 ? "medium" : "high";
  return { score: Math.min(score, 100), risk, issues };
}

export async function translateText(text: string, targetLang: string, config?: AiConfig): Promise<string> {
  const { key, model, baseUrl } = resolveAiConfig(config);
  if (!key) return `[${targetLang}] ${text}`;

  try {
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        messages: [
          { role: "system", content: `Translate to ${targetLang}. Return only the translated text, no quotes.` },
          { role: "user", content: text },
        ],
        max_tokens: 500,
      }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) throw new Error(`LLM ${res.status}`);
    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const out = data.choices?.[0]?.message?.content?.trim();
    if (out) return out;
  } catch {
    // fallback
  }
  return `[${targetLang}] ${text}`;
}

export interface SmartSendSlot {
  hour: number; // 0-23 local
  score: number;
}

/** LumaPush Smart Send: histogram of last_active hour → best slot */
export function smartSendSlot(hours: number[]): SmartSendSlot | null {
  if (hours.length === 0) return null;
  const hist = new Array(24).fill(0) as number[];
  for (const h of hours) if (h >= 0 && h < 24) hist[h]!++;
  let best = 0;
  for (let i = 1; i < 24; i++) if (hist[i]! > hist[best]!) best = i;
  return { hour: best, score: hist[best]! / hours.length };
}

/** Fatigue shield: should we suppress this send? */
export function shouldSuppressByFatigue(sentToday: number, dailyCap = 3, isTransactional = false): boolean {
  if (isTransactional) return false;
  return sentToday >= dailyCap;
}
