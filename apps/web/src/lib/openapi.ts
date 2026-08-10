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
        ],
        headers: {
          "X-PushPanel-Signature": { schema: { type: "string" }, description: "sha256=hex(HMAC-SHA256(secret, rawBody))" },
          "X-PushPanel-Timestamp": { schema: { type: "string" }, description: "ms since epoch, within ±5min" },
        },
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
  },
} as const;

export type OpenApiSpec = typeof OPENAPI_SPEC;