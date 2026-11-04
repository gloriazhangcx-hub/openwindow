import express, { type Request, type RequestHandler } from "express";
import type { AttendanceStatus, BusyInterval, EventItem, Preferences } from "../src/types";
import type { AccountStore, LegacyRawValues } from "./account-store";
import {
  isAttendanceStatus,
  isPreferences,
  parseBusyIntervals,
  parseEventItem,
  parseManualEventInput,
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

function validManualEventId(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
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

  router.post("/manual-events", async (request, response) => {
    const input = parseManualEventInput(request.body);
    if (!input) return response.status(400).json({ error: "Check the event details and try again." });
    try {
      const event = await store.createManualEvent(accountId(response), input);
      return response.status(201).json({ event });
    } catch (error) {
      return sendFailure(response, error);
    }
  });

  router.put("/manual-events/:eventId", async (request, response) => {
    const input = parseManualEventInput(request.body);
    if (!validManualEventId(request.params.eventId) || !input) {
      return response.status(400).json({ error: "Check the event details and try again." });
    }
    try {
      const event = await store.updateManualEvent(accountId(response), request.params.eventId, input);
      if (!event) return response.status(404).json({ error: "Personal event was not found." });
      return response.json({ event });
    } catch (error) {
      return sendFailure(response, error);
    }
  });

  router.delete("/manual-events/:eventId", async (request, response) => {
    if (!validManualEventId(request.params.eventId)) {
      return response.status(400).json({ error: "Personal event ID is invalid." });
    }
    try {
      const deleted = await store.deleteManualEvent(accountId(response), request.params.eventId);
      if (!deleted) return response.status(404).json({ error: "Personal event was not found." });
      return response.json({ deleted: true });
    } catch (error) {
      return sendFailure(response, error);
    }
  });

  router.put("/manual-events/:eventId/attendance", async (request, response) => {
    if (
      !validManualEventId(request.params.eventId) ||
      !record(request.body) ||
      Object.keys(request.body).some((key) => key !== "status") ||
      !isAttendanceStatus(request.body.status)
    ) {
      return response.status(400).json({ error: "Attendance status update is invalid." });
    }
    try {
      const updated = await store.updateManualEventAttendance(
        accountId(response),
        request.params.eventId,
        request.body.status,
      );
      if (!updated) return response.status(404).json({ error: "Personal event was not found." });
      return response.json({ updated: true, status: request.body.status });
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

  router.put("/saved-events/attendance", async (request, response) => {
    if (
      !record(request.body) ||
      Object.keys(request.body).some((key) => !["eventId", "status"].includes(key)) ||
      typeof request.body.eventId !== "string" ||
      request.body.eventId.length < 1 ||
      request.body.eventId.length > 180 ||
      !isAttendanceStatus(request.body.status)
    ) {
      return response.status(400).json({ error: "Attendance status update is invalid." });
    }
    try {
      const updated = await store.updateAttendanceStatus(
        accountId(response),
        request.body.eventId,
        request.body.status as AttendanceStatus,
      );
      if (!updated) return response.status(404).json({ error: "Saved event was not found." });
      return response.json({ saved: true, eventId: request.body.eventId, status: request.body.status });
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
