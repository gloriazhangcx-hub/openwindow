import express from "express";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createServer as createViteServer } from "vite";
import { registerLumaRoutes } from "./luma";

const app = express();
const httpServer = createServer(app);
const port = Number(process.env.PORT ?? 5000);
const here = path.dirname(fileURLToPath(import.meta.url));
const maxPayloadBytes = 64 * 1024;
const maxIntervals = 500;

type BusyInterval = {
  start: string;
  end: string;
  timeZone?: string;
  sourceId?: string;
};

let latestBusyIntervals: BusyInterval[] = [];
let lastSyncedAt: string | null = null;

app.disable("x-powered-by");
app.use(express.json({ limit: maxPayloadBytes, strict: true }));
registerLumaRoutes(app);

function validTimeZone(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 100) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

function isValidInterval(value: unknown): value is BusyInterval {
  if (!value || typeof value !== "object") return false;
  const item = value as Record<string, unknown>;
  const allowedKeys = new Set(["start", "end", "timeZone", "sourceId"]);
  if (Object.keys(item).some((key) => !allowedKeys.has(key))) return false;
  const timestampPattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/i;
  if (
    typeof item.start !== "string" ||
    typeof item.end !== "string" ||
    !timestampPattern.test(item.start) ||
    !timestampPattern.test(item.end)
  ) return false;
  const start = typeof item.start === "string" ? Date.parse(item.start) : NaN;
  const end = typeof item.end === "string" ? Date.parse(item.end) : NaN;
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return false;
  const earliest = Date.now() - 366 * 24 * 60 * 60 * 1000;
  const latest = Date.now() + 366 * 24 * 60 * 60 * 1000;
  if (start < earliest || end > latest) return false;
  if (item.timeZone !== undefined && !validTimeZone(item.timeZone)) return false;
  if (item.sourceId !== undefined && (typeof item.sourceId !== "string" || item.sourceId.length > 80)) return false;
  return true;
}

function authorized(req: express.Request): boolean {
  const expected = process.env.CALENDAR_SYNC_TOKEN;
  const authorization = req.header("authorization");
  return Boolean(expected && authorization === `Bearer ${expected}`);
}

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, mode: "demo", eventSource: "mock" });
});

app.get("/api/calendar/config", (_req, res) => {
  res.json({
    shortcutUploadEnabled: Boolean(process.env.CALENDAR_SYNC_TOKEN),
    endpoint: "/api/calendar/busy",
    maxIntervals,
    maxPayloadBytes,
  });
});

app.get("/api/calendar/status", (_req, res) => {
  res.json({
    lastSyncedAt,
    intervalCount: latestBusyIntervals.length,
    retention: "in-memory",
  });
});

app.post("/api/calendar/busy", (req, res) => {
  if (!process.env.CALENDAR_SYNC_TOKEN) {
    return res.status(503).json({
      error: "Calendar upload is not configured. Set CALENDAR_SYNC_TOKEN in the server environment.",
    });
  }
  if (!authorized(req)) return res.status(401).json({ error: "Unauthorized." });
  if (
    !req.body ||
    typeof req.body !== "object" ||
    Array.isArray(req.body) ||
    Object.keys(req.body).some((key) => key !== "busy") ||
    !Array.isArray(req.body.busy)
  ) {
    return res.status(400).json({ error: "Expected JSON with a busy array." });
  }
  if (req.body.busy.length > maxIntervals) {
    return res.status(413).json({ error: `At most ${maxIntervals} busy intervals are accepted.` });
  }
  if (!req.body.busy.every(isValidInterval)) {
    return res.status(400).json({
      error: "Each interval needs valid start and end timestamps, end after start, and optional valid timeZone/sourceId fields.",
    });
  }

  latestBusyIntervals = req.body.busy.map((item: BusyInterval) => ({
    start: new Date(item.start).toISOString(),
    end: new Date(item.end).toISOString(),
    ...(item.timeZone ? { timeZone: item.timeZone } : {}),
    ...(item.sourceId ? { sourceId: item.sourceId } : {}),
  }));
  lastSyncedAt = new Date().toISOString();
  return res.status(202).json({
    accepted: true,
    intervalCount: latestBusyIntervals.length,
    lastSyncedAt,
  });
});

if (process.env.NODE_ENV === "production") {
  const dist = path.resolve(here, "../dist");
  app.use(express.static(dist));
  app.use((req, res, next) => {
    if (req.method === "GET" && req.accepts("html")) return res.sendFile(path.join(dist, "index.html"));
    next();
  });
} else {
  const vite = await createViteServer({
    configFile: path.resolve(here, "../vite.config.ts"),
    server: { middlewareMode: true, hmr: { server: httpServer } },
    appType: "spa",
  });
  app.use(vite.middlewares);
}

app.use((error: unknown, _req: express.Request, res: express.Response, next: express.NextFunction) => {
  const bodyError = error as { type?: string; status?: number };
  if (bodyError?.type === "entity.too.large") {
    return res.status(413).json({ error: `Request body exceeds ${maxPayloadBytes} bytes.` });
  }
  if (error instanceof SyntaxError && bodyError?.status === 400) {
    return res.status(400).json({ error: "Request body must be valid JSON." });
  }
  next(error);
});

httpServer.listen(port, "0.0.0.0", () => {
  console.log(`OpenWindow running on port ${port} (${process.env.NODE_ENV ?? "development"})`);
});
