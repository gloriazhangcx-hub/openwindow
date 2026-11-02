import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import type { Express, Request, Response } from "express";

const LUMA_MCP_URL = "https://mcp.luma.com";
const LUMA_MCP_ORIGIN = new URL(LUMA_MCP_URL).origin;
const LUMA_AUTHORIZATION_ORIGIN = "https://luma.com";
const LUMA_AUTHORIZATION_SERVER = "https://api.luma.com";
const CLIENT_METADATA_PATH = "/oauth/luma/client-metadata.json";
const CALLBACK_PATH = "/api/luma/callback";
const SESSION_COOKIE = "__Host-openwindow_luma";
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;
const AUTH_TRANSACTION_TTL_MS = 10 * 60 * 1000;
const MCP_PROTOCOL_VERSION = "2025-11-25";

type TokenSet = {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number;
  clientId?: string;
  tokenEndpoint?: string;
  resource?: string;
};

type PendingAuthorization = {
  sessionId: string;
  verifier: string;
  clientId: string;
  redirectUri: string;
  tokenEndpoint: string;
  resource: string;
  expiresAt: number;
};

export type LumaOAuthDiscovery = {
  resource: string;
  authorizationEndpoint: string;
  tokenEndpoint: string;
};

type JsonRpcMessage = {
  jsonrpc?: string;
  id?: number | string | null;
  result?: Record<string, unknown>;
  error?: { code?: number; message?: string };
};

type McpTool = {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
};

const sessions = new Map<string, TokenSet>();
const pendingAuthorizations = new Map<string, PendingAuthorization>();

export class LumaAuthorizationRequiredError extends Error {
  constructor() {
    super("Luma authorization is required.");
    this.name = "LumaAuthorizationRequiredError";
  }
}

export function createPkcePair(): { verifier: string; challenge: string } {
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}

export function createLumaClientMetadata(origin: string) {
  const normalizedOrigin = new URL(origin).origin;
  const clientId = `${normalizedOrigin}${CLIENT_METADATA_PATH}`;
  return {
    client_id: clientId,
    client_name: "OpenWindow",
    client_uri: normalizedOrigin,
    redirect_uris: [`${normalizedOrigin}${CALLBACK_PATH}`],
    grant_types: ["authorization_code", "refresh_token"],
    response_types: ["code"],
    token_endpoint_auth_method: "none",
    application_type: "web",
  };
}

export function parseResourceMetadataUrl(wwwAuthenticate: string | null): string | null {
  if (!wwwAuthenticate) return null;
  const match = wwwAuthenticate.match(/(?:^|[,\s])resource_metadata\s*=\s*(?:"([^"]+)"|([^,\s]+))/i);
  return match?.[1] ?? match?.[2] ?? null;
}

export function createAuthorizationServerMetadataUrl(issuer: string): string {
  const url = new URL(issuer);
  if (
    url.protocol !== "https:" ||
    url.origin !== LUMA_AUTHORIZATION_SERVER ||
    url.pathname !== "/" ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  ) {
    throw new Error("Luma advertised an unsupported authorization server.");
  }
  const issuerPath = url.pathname.replace(/\/+$/, "");
  return `${url.origin}/.well-known/oauth-authorization-server${issuerPath}`;
}

function asJsonObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Luma returned invalid OAuth metadata.");
  }
  return value as Record<string, unknown>;
}

export function validateLumaOAuthDiscovery(
  resourceMetadataInput: unknown,
  authorizationMetadataInput: unknown,
): LumaOAuthDiscovery {
  const resourceMetadata = asJsonObject(resourceMetadataInput);
  const authorizationMetadata = asJsonObject(authorizationMetadataInput);
  if (resourceMetadata.resource !== LUMA_MCP_URL) {
    throw new Error("Luma advertised an unexpected protected resource.");
  }
  const issuers = Array.isArray(resourceMetadata.authorization_servers)
    ? resourceMetadata.authorization_servers.filter((issuer): issuer is string => typeof issuer === "string")
    : [];
  if (!issuers.includes(LUMA_AUTHORIZATION_SERVER)) {
    throw new Error("Luma did not advertise its supported authorization server.");
  }
  if (authorizationMetadata.issuer !== LUMA_AUTHORIZATION_SERVER) {
    throw new Error("Luma authorization-server metadata has an unexpected issuer.");
  }
  if (authorizationMetadata.client_id_metadata_document_supported !== true) {
    throw new Error("Luma does not advertise Client ID Metadata Document support.");
  }
  const responseTypes = authorizationMetadata.response_types_supported;
  if (Array.isArray(responseTypes) && !responseTypes.includes("code")) {
    throw new Error("Luma does not advertise the authorization-code flow.");
  }
  const authMethods = authorizationMetadata.token_endpoint_auth_methods_supported;
  if (Array.isArray(authMethods) && !authMethods.includes("none")) {
    throw new Error("Luma does not allow public OAuth clients.");
  }
  const codeChallenges = authorizationMetadata.code_challenge_methods_supported;
  if (Array.isArray(codeChallenges) && !codeChallenges.includes("S256")) {
    throw new Error("Luma does not advertise the required S256 PKCE method.");
  }

  const authorizationEndpoint = new URL(String(authorizationMetadata.authorization_endpoint ?? ""));
  const tokenEndpoint = new URL(String(authorizationMetadata.token_endpoint ?? ""));
  if (
    authorizationEndpoint.protocol !== "https:" ||
    authorizationEndpoint.origin !== LUMA_AUTHORIZATION_ORIGIN ||
    authorizationEndpoint.pathname !== "/oauth/consent" ||
    authorizationEndpoint.username ||
    authorizationEndpoint.password ||
    authorizationEndpoint.hash
  ) {
    throw new Error("Luma advertised an unsupported authorization endpoint.");
  }
  if (
    tokenEndpoint.protocol !== "https:" ||
    tokenEndpoint.origin !== LUMA_AUTHORIZATION_SERVER ||
    tokenEndpoint.pathname !== "/oauth/token" ||
    tokenEndpoint.username ||
    tokenEndpoint.password ||
    tokenEndpoint.search ||
    tokenEndpoint.hash
  ) {
    throw new Error("Luma advertised an unsupported token endpoint.");
  }
  return {
    resource: LUMA_MCP_URL,
    authorizationEndpoint: authorizationEndpoint.toString(),
    tokenEndpoint: tokenEndpoint.toString(),
  };
}

async function fetchLumaMetadata(url: string, expectedOrigin: string): Promise<Record<string, unknown>> {
  const parsedUrl = new URL(url);
  if (
    parsedUrl.protocol !== "https:" ||
    parsedUrl.origin !== expectedOrigin ||
    parsedUrl.search ||
    parsedUrl.username ||
    parsedUrl.password ||
    parsedUrl.hash
  ) {
    throw new Error("Luma metadata URL is not trusted.");
  }
  const response = await fetch(parsedUrl.toString(), {
    headers: { Accept: "application/json" },
    redirect: "error",
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`Luma metadata request failed with HTTP ${response.status}.`);
  return asJsonObject(await response.json());
}

export async function discoverLumaOAuth(): Promise<LumaOAuthDiscovery> {
  const challengeResponse = await fetch(LUMA_MCP_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: MCP_PROTOCOL_VERSION,
        capabilities: {},
        clientInfo: { name: "OpenWindow", version: "0.1.0" },
      },
    }),
    redirect: "error",
    signal: AbortSignal.timeout(10_000),
  });
  if (challengeResponse.status !== 401) {
    throw new Error(`Luma MCP authorization discovery expected HTTP 401, got ${challengeResponse.status}.`);
  }

  const resourceMetadataUrl = parseResourceMetadataUrl(challengeResponse.headers.get("www-authenticate"));
  if (!resourceMetadataUrl) throw new Error("Luma MCP did not provide protected-resource metadata.");
  const resourceMetadata = await fetchLumaMetadata(resourceMetadataUrl, LUMA_MCP_ORIGIN);
  const issuers = Array.isArray(resourceMetadata.authorization_servers)
    ? resourceMetadata.authorization_servers.filter((issuer): issuer is string => typeof issuer === "string")
    : [];
  const issuer = issuers.find((candidate) => candidate === LUMA_AUTHORIZATION_SERVER);
  if (!issuer) throw new Error("Luma MCP did not advertise its supported authorization server.");
  const authorizationMetadataUrl = createAuthorizationServerMetadataUrl(issuer);
  const authorizationMetadata = await fetchLumaMetadata(
    authorizationMetadataUrl,
    LUMA_AUTHORIZATION_SERVER,
  );
  return validateLumaOAuthDiscovery(resourceMetadata, authorizationMetadata);
}

export function signLumaSessionCookie(sessionId: string, secret: string): string {
  const signature = createHmac("sha256", secret).update(sessionId).digest("base64url");
  return `${sessionId}.${signature}`;
}

export function readLumaSessionCookie(cookieHeader: string | undefined, secret: string): string | null {
  if (!cookieHeader) return null;
  const cookie = cookieHeader.split(";").map((part) => part.trim())
    .find((part) => part.startsWith(`${SESSION_COOKIE}=`));
  if (!cookie) return null;

  const value = cookie.slice(SESSION_COOKIE.length + 1);
  const separator = value.lastIndexOf(".");
  if (separator <= 0) return null;
  const sessionId = value.slice(0, separator);
  const receivedSignature = Buffer.from(value.slice(separator + 1));
  const expectedSignature = Buffer.from(
    createHmac("sha256", secret).update(sessionId).digest("base64url"),
  );
  if (
    receivedSignature.length !== expectedSignature.length ||
    !timingSafeEqual(receivedSignature, expectedSignature)
  ) {
    return null;
  }
  return sessionId;
}

export function isValidLumaAuthorization(
  transaction: Pick<PendingAuthorization, "sessionId" | "expiresAt"> | undefined,
  sessionId: string | null,
  now = Date.now(),
): boolean {
  return Boolean(
    transaction &&
    sessionId &&
    transaction.sessionId === sessionId &&
    transaction.expiresAt > now,
  );
}

export function parseMcpResponseBody(body: string, contentType: string | null): JsonRpcMessage | null {
  if (!body.trim()) return null;

  if (!contentType?.includes("text/event-stream")) {
    return JSON.parse(body) as JsonRpcMessage;
  }

  const messages: JsonRpcMessage[] = [];
  for (const block of body.split(/\r?\n\r?\n/)) {
    const data = block.split(/\r?\n/)
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trimStart())
      .join("\n");
    if (!data || data === "[DONE]") continue;
    try {
      messages.push(JSON.parse(data) as JsonRpcMessage);
    } catch {
      // Ignore non-JSON SSE frames; the matching JSON-RPC frame is used below.
    }
  }
  return messages.find((message) => message.id !== undefined) ?? messages.at(-1) ?? null;
}

export function findPublicEventSearchTools(tools: McpTool[]): McpTool[] {
  const excludedName = /(create|update|delete|cancel|guest|invite|register|approve|submit|manage)/i;
  return tools.filter((tool) => {
    const name = typeof tool.name === "string" ? tool.name : "";
    const description = typeof tool.description === "string" ? tool.description : "";
    const searchableText = `${name} ${description}`.toLowerCase();
    return (
      !excludedName.test(name) &&
      /(?:^|[^a-z])events?(?:$|[^a-z])/.test(searchableText) &&
      /(?:^|[^a-z])(search|discover|find)(?:$|[^a-z])/.test(searchableText)
    );
  });
}

export function summarizePublicEventSearchTools(tools: McpTool[]) {
  return findPublicEventSearchTools(tools).map((tool) => {
    const schema = tool.inputSchema ?? {};
    const properties =
      schema.properties && typeof schema.properties === "object"
        ? schema.properties as Record<string, unknown>
        : {};
    const required = Array.isArray(schema.required)
      ? schema.required.filter((key): key is string => typeof key === "string")
      : [];
    return {
      name: tool.name.replace(/[^a-zA-Z0-9_.-]/g, "_").slice(0, 100),
      inputProperties: Object.entries(properties).slice(0, 30).map(([name, value]) => {
        const definition = value && typeof value === "object"
          ? value as Record<string, unknown>
          : {};
        const type = typeof definition.type === "string"
          ? definition.type.replace(/[^a-zA-Z0-9_.-]/g, "").slice(0, 30)
          : "unknown";
        return {
          name: name.replace(/[^a-zA-Z0-9_.-]/g, "_").slice(0, 80),
          type,
          required: required.includes(name),
        };
      }),
    };
  });
}

function getSessionSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("Luma connection requires SESSION_SECRET.");
  return secret;
}

function getAppOrigin(req: Request): string {
  const configured = process.env.OPENWINDOW_PUBLIC_URL;
  if (configured) {
    const origin = new URL(configured).origin;
    if (!origin.startsWith("https://")) {
      throw new Error("OPENWINDOW_PUBLIC_URL must use HTTPS.");
    }
    return origin;
  }

  const devDomain = process.env.REPLIT_DEV_DOMAIN;
  if (devDomain && process.env.NODE_ENV !== "production") {
    const url = new URL(devDomain.includes("://") ? devDomain : `https://${devDomain}`);
    return url.origin;
  }

  const host = req.get("host");
  if (
    process.env.NODE_ENV !== "production" &&
    host &&
    /^(localhost|127\.0\.0\.1)(:\d+)?$/i.test(host)
  ) {
    return `http://${host}`;
  }

  throw new Error("Set OPENWINDOW_PUBLIC_URL to the public HTTPS app origin before connecting Luma.");
}

function setSessionCookie(res: Response, sessionId: string, secret: string): void {
  const value = signLumaSessionCookie(sessionId, secret);
  res.setHeader(
    "Set-Cookie",
    `${SESSION_COOKIE}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_MAX_AGE_SECONDS}`,
  );
}

function clearSessionCookie(res: Response): void {
  res.setHeader(
    "Set-Cookie",
    `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`,
  );
}

function getSessionId(req: Request, create = false, res?: Response): string | null {
  const secret = getSessionSecret();
  const existing = readLumaSessionCookie(req.headers.cookie, secret);
  if (existing || !create || !res) return existing;

  const sessionId = randomBytes(32).toString("base64url");
  setSessionCookie(res, sessionId, secret);
  return sessionId;
}

function cleanExpiredAuthorizations(): void {
  const now = Date.now();
  for (const [state, transaction] of pendingAuthorizations) {
    if (transaction.expiresAt <= now) pendingAuthorizations.delete(state);
  }
}

export function makeLumaAuthorizationUrl(
  origin: string,
  state: string,
  challenge: string,
  discovery: LumaOAuthDiscovery,
) {
  const metadata = createLumaClientMetadata(origin);
  const authorizationUrl = new URL(discovery.authorizationEndpoint);
  authorizationUrl.searchParams.set("response_type", "code");
  authorizationUrl.searchParams.set("client_id", metadata.client_id);
  authorizationUrl.searchParams.set("redirect_uri", metadata.redirect_uris[0]);
  authorizationUrl.searchParams.set("code_challenge", challenge);
  authorizationUrl.searchParams.set("code_challenge_method", "S256");
  authorizationUrl.searchParams.set("state", state);
  authorizationUrl.searchParams.set("resource", discovery.resource);
  return { authorizationUrl, metadata };
}

async function exchangeAuthorizationCode(
  code: string,
  verifier: string,
  clientId: string,
  redirectUri: string,
  discovery: Pick<LumaOAuthDiscovery, "resource" | "tokenEndpoint">,
): Promise<TokenSet> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    code_verifier: verifier,
    client_id: clientId,
    redirect_uri: redirectUri,
    resource: discovery.resource,
  });
  const response = await fetch(discovery.tokenEndpoint, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    signal: AbortSignal.timeout(15_000),
  });
  const payload = await response.json().catch(() => null) as Record<string, unknown> | null;
  if (!response.ok || typeof payload?.access_token !== "string") {
    throw new Error("Luma token exchange failed.");
  }
  return {
    accessToken: payload.access_token,
    ...(typeof payload.refresh_token === "string" ? { refreshToken: payload.refresh_token } : {}),
    ...(typeof payload.expires_in === "number" ? { expiresAt: Date.now() + payload.expires_in * 1000 } : {}),
  };
}

async function getAccessToken(sessionId: string): Promise<string> {
  const current = sessions.get(sessionId);
  if (!current) throw new LumaAuthorizationRequiredError();
  if (!current.expiresAt || current.expiresAt > Date.now() + 60_000) return current.accessToken;
  if (!current.refreshToken || !current.clientId || !current.tokenEndpoint || !current.resource) {
    sessions.delete(sessionId);
    throw new LumaAuthorizationRequiredError();
  }

  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: current.refreshToken,
    client_id: current.clientId,
    resource: current.resource,
  });
  const response = await fetch(current.tokenEndpoint, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    signal: AbortSignal.timeout(15_000),
  });
  const payload = await response.json().catch(() => null) as Record<string, unknown> | null;
  if (!response.ok || typeof payload?.access_token !== "string") {
    sessions.delete(sessionId);
    throw new LumaAuthorizationRequiredError();
  }
  const updated: TokenSet = {
    accessToken: payload.access_token,
    clientId: current.clientId,
    tokenEndpoint: current.tokenEndpoint,
    resource: current.resource,
    ...(typeof payload.refresh_token === "string"
      ? { refreshToken: payload.refresh_token }
      : current.refreshToken ? { refreshToken: current.refreshToken } : {}),
    ...(typeof payload.expires_in === "number"
      ? { expiresAt: Date.now() + payload.expires_in * 1000 }
      : {}),
  };
  sessions.set(sessionId, updated);
  return updated.accessToken;
}

async function mcpRequest(
  accessToken: string,
  message: Record<string, unknown>,
  options: { sessionId?: string; protocolVersion?: string } = {},
) {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
    Accept: "application/json, text/event-stream",
  };
  if (options.sessionId) headers["Mcp-Session-Id"] = options.sessionId;
  if (options.protocolVersion) headers["Mcp-Protocol-Version"] = options.protocolVersion;

  const response = await fetch(LUMA_MCP_URL, {
    method: "POST",
    headers,
    body: JSON.stringify(message),
    signal: AbortSignal.timeout(20_000),
  });
  const responseText = await response.text();
  if (response.status === 401) throw new LumaAuthorizationRequiredError();
  if (!response.ok && response.status !== 202) {
    throw new Error(`Luma MCP request failed with HTTP ${response.status}.`);
  }

  const parsed = parseMcpResponseBody(responseText, response.headers.get("content-type"));
  if (parsed?.error) {
    throw new Error(parsed.error.message || "Luma MCP returned an error.");
  }
  return {
    message: parsed,
    sessionId: response.headers.get("mcp-session-id") ?? options.sessionId,
  };
}

async function listLumaTools(accessToken: string): Promise<McpTool[]> {
  const initialized = await mcpRequest(accessToken, {
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      protocolVersion: MCP_PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: { name: "OpenWindow", version: "0.1.0" },
    },
  });
  const protocolVersion =
    typeof initialized.message?.result?.protocolVersion === "string"
      ? initialized.message.result.protocolVersion
      : MCP_PROTOCOL_VERSION;

  const initializedNotification = await mcpRequest(
    accessToken,
    { jsonrpc: "2.0", method: "notifications/initialized" },
    { sessionId: initialized.sessionId, protocolVersion },
  );
  const sessionId = initializedNotification.sessionId ?? initialized.sessionId;

  const collected: McpTool[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < 10; page += 1) {
    const response = await mcpRequest(
      accessToken,
      { jsonrpc: "2.0", id: page + 2, method: "tools/list", params: cursor ? { cursor } : {} },
      { sessionId, protocolVersion },
    );
    const result = response.message?.result;
    const tools = result?.tools;
    if (!Array.isArray(tools)) throw new Error("Luma returned an unexpected tools/list response.");
    collected.push(...tools.filter((tool): tool is McpTool =>
      Boolean(tool && typeof tool === "object" && typeof (tool as McpTool).name === "string"),
    ));
    cursor = typeof result?.nextCursor === "string" ? result.nextCursor : undefined;
    if (!cursor) break;
  }
  return collected;
}

export function registerLumaRoutes(app: Express): void {
  app.get(CLIENT_METADATA_PATH, (req, res) => {
    try {
      res.setHeader("Cache-Control", "no-store");
      res.setHeader("Access-Control-Allow-Origin", "*");
      return res.json(createLumaClientMetadata(getAppOrigin(req)));
    } catch {
      return res.status(503).json({ error: "Luma OAuth is not configured for this app origin." });
    }
  });

  app.get("/api/luma/status", (req, res) => {
    try {
      const sessionId = getSessionId(req);
      res.setHeader("Cache-Control", "no-store");
      return res.json({ connected: Boolean(sessionId && sessions.has(sessionId)) });
    } catch {
      return res.status(503).json({ error: "Luma connection is not configured." });
    }
  });

  app.get("/api/luma/connect", async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Referrer-Policy", "no-referrer");
    try {
      const origin = getAppOrigin(req);
      const sessionId = getSessionId(req, true, res);
      if (!sessionId) return res.status(503).json({ error: "Could not start Luma authorization." });

      cleanExpiredAuthorizations();
      const state = randomBytes(32).toString("base64url");
      const { verifier, challenge } = createPkcePair();
      const discovery = await discoverLumaOAuth();
      const { authorizationUrl, metadata } = makeLumaAuthorizationUrl(
        origin,
        state,
        challenge,
        discovery,
      );
      pendingAuthorizations.set(state, {
        sessionId,
        verifier,
        clientId: metadata.client_id,
        redirectUri: metadata.redirect_uris[0],
        tokenEndpoint: discovery.tokenEndpoint,
        resource: discovery.resource,
        expiresAt: Date.now() + AUTH_TRANSACTION_TTL_MS,
      });
      return res.redirect(302, authorizationUrl.toString());
    } catch {
      return res.redirect("/?luma=error");
    }
  });

  app.get(CALLBACK_PATH, async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Referrer-Policy", "no-referrer");
    const state = typeof req.query.state === "string" ? req.query.state : "";
    const transaction = pendingAuthorizations.get(state);
    const secret = process.env.SESSION_SECRET;
    const sessionId = secret ? readLumaSessionCookie(req.headers.cookie, secret) : null;
    if (!transaction || !sessionId || !isValidLumaAuthorization(transaction, sessionId)) {
      return res.redirect("/?luma=error");
    }
    pendingAuthorizations.delete(state);

    const code = typeof req.query.code === "string" ? req.query.code : "";
    if (!code || typeof req.query.error === "string") return res.redirect("/?luma=error");

    try {
      const tokenSet = await exchangeAuthorizationCode(
        code,
        transaction.verifier,
        transaction.clientId,
        transaction.redirectUri,
        {
          resource: transaction.resource,
          tokenEndpoint: transaction.tokenEndpoint,
        },
      );
      sessions.set(sessionId, {
        ...tokenSet,
        clientId: transaction.clientId,
        tokenEndpoint: transaction.tokenEndpoint,
        resource: transaction.resource,
      });
      return res.redirect(`${new URL(transaction.redirectUri).origin}/?luma=connected`);
    } catch {
      return res.redirect("/?luma=error");
    }
  });

  app.get("/api/luma/tools", async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    try {
      const sessionId = getSessionId(req);
      if (!sessionId) return res.status(401).json({ error: "Connect Luma first." });
      const accessToken = await getAccessToken(sessionId);
      const tools = await listLumaTools(accessToken);
      const candidates = summarizePublicEventSearchTools(tools);
      console.info("[luma] Read-only event-search tool signatures:", JSON.stringify(candidates));
      return res.json({
        connected: true,
        tools: candidates,
      });
    } catch (error) {
      if (error instanceof LumaAuthorizationRequiredError) {
        return res.status(401).json({ error: "Luma sign-in expired. Reconnect and try again." });
      }
      console.error("[luma] Tool discovery failed.");
      return res.status(502).json({ error: "Could not inspect Luma's event-search tools." });
    }
  });

  app.post("/api/luma/disconnect", (req, res) => {
    try {
      const origin = req.get("origin");
      if (origin && origin !== getAppOrigin(req)) {
        return res.status(403).json({ error: "Cross-origin request rejected." });
      }
      const sessionId = getSessionId(req);
      if (sessionId) {
        sessions.delete(sessionId);
      }
      clearSessionCookie(res);
      return res.json({ connected: false });
    } catch {
      return res.status(503).json({ error: "Luma connection is not configured." });
    }
  });
}
