import express, { type Request, type RequestHandler } from "express";
import type { BusyInterval, EventItem, Preferences } from "../src/types";
import type { AccountStore, LegacyRawValues } from "./account-store";
import {
  isPreferences,
  parseBusyIntervals,
  parseEventItem,
  validRawValues,
} from "./account-validation";

export type UserIdResolver = (request: Request) => string | null | Promise<string | null>;

export function requireAuthenticatedUser(resolveUserId: UserIdResolver): RequestHandler {
  return async (request, response, next) => {
    try {
      const clerkUserId = await resolveUserId(request);
      if (!clerkUserId) return response.status(401).json({ error: "Sign in to access saved account data." });
      response.locals.clerkUserId = clerkUserId;
      return next();
    } catch {
      return response.status(401).json({ error: "Sign in to access saved account data." });
    }
  };
}

function accountId(response: express.Response): string {
  const id = response.locals.clerkUserId;
  if (typeof id !== "string" || id.length < 1 || id.length > 255) {
    throw new Error("Verified account identity is missing.");
  }
  return id;
}

function record(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function sendFailure(response: express.Response, error: unknown) {
  if (error instanceof Error && error.message.includes("DATABASE_URL")) {
    return response.status(503).json({ error: "Private account storage is not configured in this environment." });
  }
  console.error("OpenWindow account operation failed", error instanceof Error ? error.message : "unknown error");
  return response.status(500).json({ error: "Could not save account data right now." });
}

export function createAccountRouter(store: AccountStore, resolveUserId: UserIdResolver) {
  const router = express.Router();
  router.use(requireAuthenticatedUser(resolveUserId));
  router.use(express.json({ limit: "512kb", strict: true }));

  router.get("/data", async (_request, response) => {
    try {
      return response.json(await store.readAccount(accountId(response)));
    } catch (error) {
      return sendFailure(response, error);
    }
  });

  router.post("/migrate-local", async (request, response) => {
    if (
      !record(request.body) ||
      Object.keys(request.body).some((key) => !["rawValues", "eventSnapshots"].includes(key)) ||
      !validRawValues(request.body.rawValues) ||
      !Array.isArray(request.body.eventSnapshots) ||
      request.body.eventSnapshots.length > 500
    ) {
      return response.status(400).json({ error: "Local migration payload is invalid." });
    }
    const eventSnapshots = request.body.eventSnapshots.map(parseEventItem);
    if (eventSnapshots.some((event) => !event)) {
      return response.status(400).json({ error: "One or more saved event snapshots are invalid." });
    }
    try {
      const result = await store.migrateLocalStorage(
        accountId(response),
        request.body.rawValues as LegacyRawValues,
        eventSnapshots as EventItem[],
      );
      return response.json(result);
    } catch (error) {
      return sendFailure(response, error);
    }
  });

  router.put("/saved-events", async (request, response) => {
    if (!record(request.body) || typeof request.body.saved !== "boolean") {
      return response.status(400).json({ error: "Expected an event snapshot and saved boolean." });
    }
    const event = parseEventItem(request.body.event);
    if (!event) return response.status(400).json({ error: "Event snapshot is invalid." });
    try {
      await store.setSavedEvent(accountId(response), event, request.body.saved);
      return response.json({ saved: request.body.saved });
    } catch (error) {
      return sendFailure(response, error);
    }
  });

  router.put("/preferences", async (request, response) => {
    if (!isPreferences(request.body)) {
      return response.status(400).json({ error: "Preferences are invalid." });
    }
    try {
      await store.savePreferences(accountId(response), request.body as Preferences);
      return response.json({ saved: true });
    } catch (error) {
      return sendFailure(response, error);
    }
  });

  router.put("/busy", async (request, response) => {
    const intervals: BusyInterval[] | null = parseBusyIntervals(request.body);
    if (!intervals) return response.status(400).json({ error: "Calendar intervals are invalid." });
    try {
      await store.replaceBusyIntervals(accountId(response), intervals);
      return response.json({ saved: true, count: intervals.length });
    } catch (error) {
      return sendFailure(response, error);
    }
  });

  router.delete("/busy", async (_request, response) => {
    try {
      await store.clearBusyIntervals(accountId(response));
      return response.json({ saved: true });
    } catch (error) {
      return sendFailure(response, error);
    }
  });

  return router;
}
