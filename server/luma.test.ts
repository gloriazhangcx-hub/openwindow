import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import {
  createLumaClientMetadata,
  createPkcePair,
  findPublicEventSearchTools,
  isValidLumaAuthorization,
  parseMcpResponseBody,
  readLumaSessionCookie,
  signLumaSessionCookie,
  summarizePublicEventSearchTools,
} from "./luma";

test("Luma client metadata uses the app origin and a public callback", () => {
  const metadata = createLumaClientMetadata("https://openwindow.example/path");
  assert.equal(metadata.client_id, "https://openwindow.example/oauth/luma/client-metadata.json");
  assert.equal(metadata.client_uri, "https://openwindow.example");
  assert.deepEqual(metadata.redirect_uris, ["https://openwindow.example/api/luma/callback"]);
  assert.equal(metadata.token_endpoint_auth_method, "none");
  assert.equal(metadata.grant_types.includes("authorization_code"), true);
});

test("PKCE creates a verifier and S256 challenge", () => {
  const pair = createPkcePair();
  assert.ok(pair.verifier.length >= 43);
  assert.equal(
    pair.challenge,
    createHash("sha256").update(pair.verifier).digest("base64url"),
  );
});

test("Luma session cookies reject altered signatures", () => {
  const signed = signLumaSessionCookie("session-123", "test-secret");
  const validCookie = `__Host-openwindow_luma=${signed}`;
  assert.equal(readLumaSessionCookie(validCookie, "test-secret"), "session-123");
  assert.equal(readLumaSessionCookie(`${validCookie}x`, "test-secret"), null);
  assert.equal(readLumaSessionCookie(validCookie, "wrong-secret"), null);
});

test("OAuth callbacks require matching session and unexpired state", () => {
  const transaction = { sessionId: "browser-session", expiresAt: 10_000 };
  assert.equal(isValidLumaAuthorization(transaction, "browser-session", 9_999), true);
  assert.equal(isValidLumaAuthorization(transaction, "another-session", 9_999), false);
  assert.equal(isValidLumaAuthorization(transaction, "browser-session", 10_000), false);
  assert.equal(isValidLumaAuthorization(undefined, "browser-session", 1), false);
});

test("MCP response parser reads JSON and Streamable HTTP SSE messages", () => {
  assert.deepEqual(
    parseMcpResponseBody('{"jsonrpc":"2.0","id":1,"result":{"tools":[]}}', "application/json"),
    { jsonrpc: "2.0", id: 1, result: { tools: [] } },
  );
  assert.deepEqual(
    parseMcpResponseBody(
      'event: message\ndata: {"jsonrpc":"2.0","id":2,"result":{"tools":[{"name":"search_events"}]}}\n\n',
      "text/event-stream",
    ),
    { jsonrpc: "2.0", id: 2, result: { tools: [{ name: "search_events" }] } },
  );
});

test("public search-tool selection excludes event-management actions", () => {
  const selected = findPublicEventSearchTools([
    { name: "discover_public_events", description: "Search upcoming public events." },
    { name: "create_event", description: "Create an event." },
    { name: "list_event_guests", description: "List guests on an event." },
    { name: "get_profile", description: "Read your profile." },
  ]);
  assert.deepEqual(selected.map((tool) => tool.name), ["discover_public_events"]);
});

test("public search-tool summaries expose only sanitized input names and types", () => {
  const summaries = summarizePublicEventSearchTools([{
    name: "discover_public_events",
    description: "Search upcoming public events.",
    inputSchema: {
      type: "object",
      properties: {
        city: { type: "string", description: "City query" },
        start_date: { type: "string" },
      },
      required: ["city"],
    },
  }]);
  assert.deepEqual(summaries, [{
    name: "discover_public_events",
    inputProperties: [
      { name: "city", type: "string", required: true },
      { name: "start_date", type: "string", required: false },
    ],
  }]);
});
