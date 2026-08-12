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
            description: "sha256=hex(HMAC-SHA256(secret, rawBody))",
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
          "404": { description: "Unknown automation" },
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
                    maxItems: 3,
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
        },
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

export type OpenApiSpec = typeof OPENAPI_SPEC;