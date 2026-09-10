/**
 * OpenAPI 3.1 description of the public PushPanel API v1.
 * Served at /api/v1/openapi.json and rendered on the panel docs page.
 */

export const OPENAPI_SPEC = {
  openapi: "3.1.0",
  info: {
    title: "PushPanel API",
    version: "0.1.0",
    description:
      "Public REST API for PushPanel. The client SDK talks to /subscribe, /info and /click; webhooks and CMS integrations use /automations/{id}/trigger.",
  },
  paths: {
    "/api/v1/subscribe": {
      post: {
        summary: "Register a browser push subscription",
        description: "Called by the client SDK after pushManager.subscribe. Idempotent per endpoint hash.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["domainId", "subscription"],
                properties: {
                  domainId: { type: "integer" },
                  subscription: {
                    type: "object",
                    required: ["endpoint", "keys"],
                    properties: {
                      endpoint: { type: "string", format: "uri" },
                      keys: {
                        type: "object",
                        required: ["p256dh", "auth"],
                        properties: { p256dh: { type: "string" }, auth: { type: "string" } },
                      },
                    },
                  },
                  device: { type: "string", maxLength: 40 },
                  browser: { type: "string", maxLength: 40 },
                  os: { type: "string", maxLength: 40 },
                  subscribeUrl: { type: "string", maxLength: 500 },
                },
              },
            },
          },
        },
        responses: {
          "200": { description: "Subscriber created or refreshed" },
          "400": { description: "Invalid payload" },
          "404": { description: "Unknown domain" },
        },
      },
    },
    "/api/v1/info": {
      get: {
        summary: "Domain VAPID public key",
        description: "Exposes only the VAPID public key a site needs before subscribing.",
        parameters: [
          { name: "domain", in: "query", required: true, schema: { type: "integer" } },
        ],
        responses: {
          "200": { description: "VAPID public key" },
          "404": { description: "Unknown domain" },
        },
      },
    },
    "/api/v1/click/{deliveryId}": {
      get: {
        summary: "Click beacon",
        description: "Records a notification click and redirects to the campaign URL.",
        parameters: [
          { name: "deliveryId", in: "path", required: true, schema: { type: "integer" } },
        ],
        responses: {
          "302": { description: "Redirect to launch URL" },
          "404": { description: "Unknown delivery" },
        },
      },
    },
    "/api/v1/unsubscribe": {
      post: {
        summary: "Remove a subscription",
        description: "Called by the SDK when the user unsubscribes. Marks the subscriber inactive.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["domainId", "endpoint"],
                properties: {
                  domainId: { type: "integer" },
                  endpoint: { type: "string", format: "uri" },
                },
              },
            },
          },
        },
        responses: {
          "200": { description: "Unsubscribed" },
          "404": { description: "Subscription not found" },
        },
      },
    },
    "/api/v1/automations/{id}/trigger": {
      post: {
        summary: "Trigger a push-on-publish automation",
        description:
          "Webhook entry point. Requires an HMAC-SHA256 signature header derived from the automation's secret. Signed requests only.",
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "integer" } },
          {
            name: "X-PushPanel-Signature",
            in: "header",
            required: true,
            schema: { type: "string" },
            description: "sha256=hex(HMAC-SHA256(secret, \"<timestamp>.<rawBody>\")) — timestamp from X-PushPanel-Timestamp (ms), within 5 min",
          },
          {
            name: "X-PushPanel-Timestamp",
            in: "header",
            required: true,
            schema: { type: "string" },
            description: "ms since epoch, within ±5min",
          },
        ],
        responses: {
          "200": { description: "Automation enqueued" },
          "401": { description: "Bad signature" },
          
          "409": { description: "Automation paused" },
        },
      },
    },
    "/api/v1/lp/subscribed": {
      post: {
        summary: "LP link subscriber counter",
        description: "Landing pages report a successful subscribe so the link can count conversions.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["code"],
                properties: { code: { type: "string" } },
              },
            },
          },
        },
        responses: {
          "200": { description: "Counted" },
          "404": { description: "Unknown link code" },
        },
      },
    },
    "/api/v1/stats": {
      get: {
        summary: "Analytics via REST (H7)",
        description:
          "Workspace analytics: subscriber + delivery/click totals, a 30-day growth and activity series, and the per-campaign rollup. Optionally scoped to one domain. Key-authenticated.",
        security: [{ apiKey: [] }],
        parameters: [
          { name: "domain", in: "query", required: false, schema: { type: "string" }, description: "domain id or name" },
          { name: "from", in: "query", required: false, schema: { type: "string", format: "date" }, description: "YYYY-MM-DD, inclusive" },
          { name: "to", in: "query", required: false, schema: { type: "string", format: "date" }, description: "YYYY-MM-DD, inclusive" },
        ],
        responses: {
          "200": { description: "Analytics payload (totals, series, campaigns)" },
          "401": { description: "Missing/invalid/expired API key" },
          "403": { description: "Domain not covered by this key" },
          "404": { description: "Unknown domain" },
          "429": { description: "Rate limited" },
        },
      },
    },
    "/api/v1/send": {
      post: {
        summary: "Send a campaign via REST (H6)",
        description:
          "Creates a campaign with an all / manual-id / segment audience and schedules it for now (default) or a given ISO time. The worker sends it on the next tick; per-campaign results appear under /api/v1/stats and in the panel.",
        security: [{ apiKey: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["domain", "title"],
                properties: {
                  domain: { type: "string", description: "domain id (number) or name" },
                  title: { type: "string", maxLength: 120 },
                  title_b: { type: "string", maxLength: 120, description: "optional second title for a 50/50 A/B test" },
                  message: { type: "string", maxLength: 500 },
                  url: { type: "string", format: "uri" },
                  icon_url: { type: "string", format: "uri" },
                  image_url: { type: "string", format: "uri" },
                  buttons: {
                    type: "array",
                    maxItems: 2,
                    description: "Browser notification actions render at most 2 (Chrome/Firefox limit, enforced by the API).",
                    items: {
                      type: "object",
                      required: ["label", "url"],
                      properties: { label: { type: "string", maxLength: 24 }, url: { type: "string", format: "uri" } },
                    },
                  },
                  audience: {
                    type: "object",
                    description: "defaults to { kind: \"all\" }",
                    properties: {
                      kind: { enum: ["all", "manual", "segment"] },
                      ids: { type: "array", items: { type: "integer" }, description: "required for kind=manual" },
                      segment_id: { type: "integer", description: "required for kind=segment" },
                    },
                  },
                  schedule: { type: "string", format: "date-time", description: "ISO timestamp; absent/past = send now" },
                  topic: { type: "string", maxLength: 64, description: "collapse key — replaces queued notifications with the same topic" },
                  ttl: { type: "integer", minimum: 0, maximum: 2419200, description: "time-to-live seconds (default 86400)" },
                  urgency: { type: "string", enum: ["very-low", "low", "normal", "high"], description: "push urgency (default normal)" },
                  channel: { type: "string", enum: ["push"], description: "delivery channel — only \"push\" is supported by this endpoint; email campaigns live in the email studio" },
                  variants: {
                    type: "array",
                    minItems: 2,
                    maxItems: 10,
                    description: "A/B/C… variants with weights; deterministic per-subscriber pick",
                    items: {
                      type: "object",
                      required: ["title"],
                      properties: {
                        title: { type: "string", maxLength: 120 },
                        message: { type: "string", maxLength: 500 },
                        image_url: { type: "string", format: "uri" },
                        weight: { type: "integer", minimum: 1, maximum: 100 },
                      },
                    },
                  },
                },
              },
            },
          },
        },
        responses: {
          "201": { description: "Campaign created and scheduled" },
          "400": { description: "Invalid payload" },
          "401": { description: "Missing/invalid/expired API key" },
          "403": { description: "Domain not covered by this key" },
          "404": { description: "Unknown domain or segment" },
          "409": { description: "Domain is not active" },
          "429": { description: "Rate limited" },
        },
      },
    },
    "/api/v1/resubscribe": {
      post: {
        summary: "Reconcile a rotated subscription",
        description: "Called by the SDK/service worker on pushsubscriptionchange or periodic sync. Idempotent per endpoint hash; 429 when the domain cap is reached.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["domainId", "subscription"],
                properties: {
                  domainId: { type: "integer" },
                  oldEndpoint: { type: "string", format: "uri" },
                  subscribeUrl: { type: "string" },
                  subscription: {
                    type: "object",
                    required: ["endpoint", "keys"],
                    properties: {
                      endpoint: { type: "string", format: "uri" },
                      keys: {
                        type: "object",
                        required: ["p256dh", "auth"],
                        properties: { p256dh: { type: "string" }, auth: { type: "string" } },
                      },
                    },
                  },
                },
              },
            },
          },
        },
        responses: {
          "200": { description: "Reconciled (migrated, refreshed, created or deduped)" },
          "400": { description: "Invalid payload" },
          "404": { description: "Unknown domain" },
          "429": { description: "Rate limited or subscriber cap reached" },
        },
      },
    },
    "/api/v1/optin": {
      post: {
        summary: "Prompt-funnel telemetry",
        description: "Records prompt_shown / prompt_allowed / prompt_denied / prompt_dismissed stages for funnel analytics.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["domainId", "stage"],
                properties: {
                  domainId: { type: "integer" },
                  stage: { enum: ["prompt_shown", "prompt_allowed", "prompt_denied", "prompt_dismissed"] },
                },
              },
            },
          },
        },
        responses: {
          "200": { description: "Recorded" },
          "400": { description: "Invalid payload" },
        },
      },
    },
    "/api/v1/tags": {
      post: {
        summary: "Replace subscriber tags",
        description: "Replace-all tag set for one endpoint (1-10 tags, key ≤64, value ≤200). Used for segmentation.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["domainId", "endpoint", "tags"],
                properties: {
                  domainId: { type: "integer" },
                  endpoint: { type: "string", format: "uri" },
                  tags: { type: "object", description: "key → value map" },
                },
              },
            },
          },
        },
        responses: {
          "200": { description: "Tags replaced" },
          "404": { description: "Subscription not found" },
        },
      },
    },
    "/api/v1/track": {
      post: {
        summary: "Custom event ingest",
        description: "Key-authenticated funnel events (e.g. cart_view). Resolves endpoint → subscriber when given, merges tags, writes an events row.",
        security: [{ apiKey: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["domain", "event"],
                properties: {
                  domain: { type: "string", description: "domain id or name" },
                  event: { type: "string" },
                  endpoint: { type: "string", format: "uri" },
                  tags: { type: "object" },
                },
              },
            },
          },
        },
        responses: {
          "200": { description: "{ ok, matched }" },
          "400": { description: "Invalid payload" },
          "401": { description: "Missing/invalid/expired API key" },
          "403": { description: "Domain not covered by this key" },
          "404": { description: "Unknown domain" },
          "429": { description: "Rate limited" },
        },
      },
    },
    "/api/v1/journeys": {
      post: {
        summary: "Create a journey",
        description: "Session-authenticated (owner/admin/editor). Stores a draft journey row; the worker executes active journeys on its tick.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["name"],
                properties: {
                  name: { type: "string", maxLength: 120 },
                  trigger_type: { enum: ["subscribe", "rss", "event", "api", "inactivity"] },
                  canvas_json: { type: "string" },
                  domain_id: { type: "integer" },
                },
              },
            },
          },
        },
        responses: {
          "201": { description: "Journey created" },
          "400": { description: "Invalid payload" },
          "401": { description: "Unauthorized" },
          "403": { description: "Viewers cannot create journeys" },
          "429": { description: "Rate limited" },
        },
      },
    },
    "/api/v1/plugin/wordpress": {
      get: {
        summary: "WordPress plugin zip",
        description: "Downloads the panel-generated WordPress plugin (push-on-publish webhook client). Rate-limited per IP + globally; ETag-cached.",
        responses: {
          "200": { description: "application/zip plugin bundle" },
          "304": { description: "Not modified (ETag match)" },
          "429": { description: "Rate limited" },
        },
      },
    },
    "/api/v1/test-connection": {
      post: {
        summary: "Test external provider connection",
        description: "Session-authenticated (owner/admin). Probes AI / you.com / mail / Drive configs with a lightweight call. Upstream details are never echoed.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["provider"],
                properties: { provider: { enum: ["ai", "you", "mail", "drive"] } },
              },
            },
          },
        },
        responses: {
          "200": { description: "Connection result" },
          "400": { description: "Invalid provider or SSRF-rejected URL" },
          "401": { description: "Unauthorized" },
          "403": { description: "Forbidden" },
          "429": { description: "Rate limited" },
          "502": { description: "Provider unreachable" },
        },
      },
    },
    "/api/v1/ai/hook": {
      post: {
        summary: "Hook angles",
        description: "Session-authenticated (editor+). Heuristic offline + LLM when AI_API_KEY is set.",
        requestBody: {
          required: true,
          content: { "application/json": { schema: { type: "object", required: ["topic"], properties: { topic: { type: "string" }, count: { type: "integer" } } } } },
        },
        responses: {
          "200": { description: "Angles + model" },
          "401": { description: "Unauthorized" },
          "403": { description: "Editors only" },
          "429": { description: "Rate limited" },
        },
      },
    },
    "/api/v1/ai/spam-score": {
      post: {
        summary: "Spam score",
        description: "Heuristic 0-100 + low/medium/high verdict. No LLM, no DB write.",
        requestBody: {
          required: true,
          content: { "application/json": { schema: { type: "object", required: ["title", "body"], properties: { title: { type: "string" }, body: { type: "string" } } } } },
        },
        responses: { "200": { description: "Score payload" } },
      },
    },
    "/api/v1/ai/translate": {
      post: {
        summary: "Translate",
        description: "Session-authenticated. LLM when configured, else [lang]-prefixed fallback.",
        requestBody: {
          required: true,
          content: { "application/json": { schema: { type: "object", required: ["text", "lang"], properties: { text: { type: "string" }, lang: { type: "string" } } } } },
        },
        responses: { "200": { description: "Translation" } },
      },
    },
    "/api/v1/ai/url-to-campaign": {
      post: {
        summary: "URL → campaign draft",
        description: "SSRF-safe OG scrape with streaming size cap. Session-authenticated.",
        requestBody: {
          required: true,
          content: { "application/json": { schema: { type: "object", required: ["url"], properties: { url: { type: "string", format: "uri" } } } } },
        },
        responses: { "200": { description: "{ title, description, image, url }" } },
      },
    },
    "/api/v1/ai/image": {
      post: {
        summary: "Placeholder image",
        description: "Deterministic local SVG placeholder (no external provider). Session-authenticated.",
        requestBody: {
          required: true,
          content: { "application/json": { schema: { type: "object", required: ["prompt"], properties: { prompt: { type: "string" }, width: { type: "integer" }, height: { type: "integer" } } } } },
        },
        responses: { "200": { description: "{ image (data URL), url (picsum fallback) }" } },
      },
    },
    "/api/v1/ai/research": {
      post: {
        summary: "Web research",
        description: "you.com search/research grounding. 503 without YDC/YOU key.",
        requestBody: {
          required: true,
          content: { "application/json": { schema: { type: "object", required: ["query"], properties: { query: { type: "string" }, mode: { type: "string" } } } } },
        },
        responses: { "200": { description: "Snippets or research answer" } },
      },
    },
  },
  components: {
    securitySchemes: {
      apiKey: {
        type: "apiKey",
        in: "header",
        name: "X-Api-Key",
        description: "Key created in the panel (API page). Stored hashed; show once at creation.",
      },
    },
  },
} as const;

