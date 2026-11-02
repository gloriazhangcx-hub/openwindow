import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import {
  createAuthorizationServerMetadataUrl,
  createLumaClientMetadata,
  makeLumaAuthorizationUrl,
  createPkcePair,
  findPublicEventSearchTools,
  isValidLumaAuthorization,
  parseResourceMetadataUrl,
  parseMcpResponseBody,
  readLumaSessionCookie,
  signLumaSessionCookie,
  summarizePublicEventSearchTools,
  validateLumaOAuthDiscovery,
} from "./luma";

test("Luma client metadata uses the app origin and a public callback", () => {
  const metadata = createLumaClientMetadata("https://openwindow.example/path");
  assert.equal(metadata.client_id, "https://openwindow.example/oauth/luma/client-metadata.json");
  assert.equal(metadata.client_uri, "https://openwindow.example");
  assert.deepEqual(metadata.redirect_uris, ["https://openwindow.example/api/luma/callback"]);
  assert.equal(metadata.token_endpoint_auth_method, "none");
  assert.equal(metadata.grant_types.includes("authorization_code"), true);
});

test("OAuth discovery parses the MCP resource challenge and authorization-server URL", () => {
  assert.equal(
    parseResourceMetadataUrl(
      'Bearer realm="Luma", resource_metadata="https://mcp.luma.com/.well-known/oauth-protected-resource"',
    ),
    "https://mcp.luma.com/.well-known/oauth-protected-resource",
  );
  assert.equal(parseResourceMetadataUrl("Bearer realm=\"Luma\""), null);
  assert.equal(
    createAuthorizationServerMetadataUrl("https://api.luma.com"),
    "https://api.luma.com/.well-known/oauth-authorization-server",
  );
  assert.throws(() => createAuthorizationServerMetadataUrl("https://untrusted.example"));
});

test("OAuth discovery validates Luma's resource, public-client support, and endpoints", () => {
  const config = validateLumaOAuthDiscovery(
    {
      resource: "https://mcp.luma.com",
      authorization_servers: ["https://api.luma.com"],
    },
    {
      issuer: "https://api.luma.com",
      authorization_endpoint: "https://luma.com/oauth/consent?credential_type=personal",
      token_endpoint: "https://api.luma.com/oauth/token",
      response_types_supported: ["code"],
      token_endpoint_auth_methods_supported: ["client_secret_basic", "none"],
      code_challenge_methods_supported: ["S256"],
      client_id_metadata_document_supported: true,
    },
  );
  assert.deepEqual(config, {
    resource: "https://mcp.luma.com",
    authorizationEndpoint: "https://luma.com/oauth/consent?credential_type=personal",
    tokenEndpoint: "https://api.luma.com/oauth/token",
  });
  assert.throws(() => validateLumaOAuthDiscovery(
    { resource: "https://mcp.luma.com", authorization_servers: ["https://api.luma.com"] },
    {
      issuer: "https://api.luma.com",
      authorization_endpoint: "https://untrusted.example/oauth/consent",
      token_endpoint: "https://api.luma.com/oauth/token",
      client_id_metadata_document_supported: true,
    },
  ));
  assert.throws(() => validateLumaOAuthDiscovery(
    { resource: "https://mcp.luma.com", authorization_servers: ["https://api.luma.com"] },
    {
      issuer: "https://api.luma.com",
      authorization_endpoint: "https://luma.com/oauth/consent",
      token_endpoint: "https://api.luma.com/oauth/token",
      client_id_metadata_document_supported: false,
    },
  ));
});

test("OAuth authorization request preserves Luma's endpoint query and includes resource", () => {
  const { authorizationUrl } = makeLumaAuthorizationUrl(
    "https://openwindow.example",
    "csrf-state",
    "pkce-challenge",
    {
      resource: "https://mcp.luma.com",
      authorizationEndpoint: "https://luma.com/oauth/consent?credential_type=personal",
      tokenEndpoint: "https://api.luma.com/oauth/token",
    },
  );
  assert.equal(authorizationUrl.searchParams.get("credential_type"), "personal");
  assert.equal(authorizationUrl.searchParams.get("resource"), "https://mcp.luma.com");
  assert.equal(authorizationUrl.searchParams.get("code_challenge_method"), "S256");
  assert.equal(authorizationUrl.searchParams.get("client_id"), "https://openwindow.example/oauth/luma/client-metadata.json");
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
