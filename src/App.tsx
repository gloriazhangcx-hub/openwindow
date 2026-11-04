import { useEffect, useMemo, useRef, useState } from "react";
import {
  Bookmark, CalendarDays, Check, ChevronLeft, ChevronRight, ExternalLink, Heart, Plus,
  LayoutList, MapPin, Settings2, Sparkles, X, Download, Upload, Pencil, Trash2,
  RotateCcw, SlidersHorizontal,
} from "lucide-react";
import { useClerk, useUser } from "@clerk/react";
import { Link } from "wouter";
import { basePath } from "./lib/clerk-config";
import { useOpenWindow } from "./lib/useOpenWindow";
import { clipIntervalToCalendarDay, getVisibleMinuteRange } from "./lib/calendar-grid-layout";
import {
  atCalendarNoon,
  getCalendarViewDays,
  navigateCalendarDate,
  type CalendarMode,
} from "./lib/calendar-views";
import { findNearestUpcomingSavedEvent } from "./lib/saved-events";
import { filterEvents } from "./lib/event-filtering";
import {
  countCalendarBusyIntervalsForDay,
  getCalendarAttendanceStatus,
  getCalendarDayBlocks,
  getCalendarEventAccessibleLabel,
} from "./lib/calendar-blocks";
import { CalendarAttendanceMarker } from "./components/CalendarAttendanceMarker";
import { ManualEventDialog } from "./components/ManualEventDialog";
import {
  ATTENDANCE_STATUSES,
  ATTENDANCE_STATUS_LABELS,
  type AttendanceStatus,
  type AttendanceStatusFilter,
  type Availability,
  type BusyInterval,
  type EventItem,
  type Format,
  type ManualEventInput,
  type Preferences,
  type Topic,
} from "./types";
import { FORMATS, TOPICS } from "./types";

type View = "list" | "calendar";
type AvailabilityFilter = "all" | Availability;
type AttendanceEditorProps = {
  eventId: string;
  eventTitle: string;
  status: AttendanceStatus;
  isAuthenticated: boolean;
  accountReady: boolean;
  onChange: (status: AttendanceStatus) => void;
};

const fmtDate = (date: Date, options: Intl.DateTimeFormatOptions, zone = "America/Los_Angeles") =>
  new Intl.DateTimeFormat("en-US", { ...options, timeZone: zone }).format(date);
const dayKey = (date: Date, zone = "America/Los_Angeles") =>
  new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
const availabilityLabel: Record<Availability, string> = {
  available: "Available", conflict: "Conflict", unknown: "Unknown",
};
const safeDate = (date: string) => new Date(date);
const eventLocation = (event: EventItem) =>
  event.source === "Manual"
    ? event.location || event.venue || "Location not specified"
    : [event.venue, event.city].filter(Boolean).join(" · ");

function eventClock(event: EventItem, end = false) {
  const value = fmtDate(safeDate(end ? event.end : event.start), { hour: "numeric", minute: "2-digit", timeZoneName: "short" }, event.timeZone);
  return value;
}

function formatLongDate(date: Date) {
  return fmtDate(date, { weekday: "long", month: "long", day: "numeric" });
}

function escapeIcs(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");
}

function downloadIcs(event: EventItem) {
  const stamp = (value: string) => new Date(value).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const body = [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//OpenWindow//Event//EN", "CALSCALE:GREGORIAN",
    "BEGIN:VEVENT", `UID:${event.id}@openwindow.local`, `DTSTAMP:${stamp(new Date().toISOString())}`,
    `DTSTART:${stamp(event.start)}`, `DTEND:${stamp(event.end)}`, `SUMMARY:${escapeIcs(event.title)}`,
    `DESCRIPTION:${escapeIcs(event.description)}`, `LOCATION:${escapeIcs(event.location || [event.venue, event.city].filter(Boolean).join(", "))}`,
    `URL:${event.eventUrl ?? event.lumaUrl}`, "END:VEVENT", "END:VCALENDAR",
  ].join("\r\n");
  const blob = new Blob([body], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${event.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}.ics`;
  anchor.click();
  URL.revokeObjectURL(url);
}

function initialCalendarDate() {
  const value = new URLSearchParams(window.location.search).get("week");
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return atCalendarNoon(new Date());
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day, 12);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return atCalendarNoon(new Date());
  }
  return date;
}

function initialCalendarMode(): CalendarMode {
  const value = new URLSearchParams(window.location.search).get("mode");
  return value === "day" || value === "month" ? value : "week";
}

function App() {
  const { user, isLoaded } = useUser();
  const { signOut } = useClerk();
  const model = useOpenWindow();
  const [view, setView] = useState<View>(() =>
    new URLSearchParams(window.location.search).get("view") === "calendar" ? "calendar" : "list",
  );
  const [calendarMode, setCalendarMode] = useState<CalendarMode>(initialCalendarMode);
  const [calendarDate, setCalendarDate] = useState(initialCalendarDate);
  const [selectedTopics, setSelectedTopics] = useState<Topic[]>(model.preferences.topics);
  const [selectedFormats, setSelectedFormats] = useState<Format[]>(model.preferences.formats);
  const [availabilityFilter, setAvailabilityFilter] = useState<AvailabilityFilter>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [attendanceStatusFilter, setAttendanceStatusFilter] = useState<AttendanceStatusFilter>("all");
  const [savedOnly, setSavedOnly] = useState(false);
  const [activeEvent, setActiveEvent] = useState<EventItem | null>(null);
  const [manualEventEditor, setManualEventEditor] = useState<{ event?: EventItem } | null>(null);
  const [preferencesOpen, setPreferencesOpen] = useState(false);
  const [toast, setToast] = useState("");
  const toastTimer = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (!model.accountReady) return;
    setSelectedTopics(model.preferences.topics);
    setSelectedFormats(model.preferences.formats);
  }, [model.accountReady, model.preferences.topics, model.preferences.formats]);

  useEffect(() => {
    if (model.accountReady) return;
    setActiveEvent(null);
    setManualEventEditor(null);
  }, [model.accountReady]);

  const showToast = (message: string) => {
    setToast(message);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(""), 2600);
  };

  const toggleIn = <T,>(list: T[], item: T, setter: (next: T[]) => void) =>
    setter(list.includes(item) ? list.filter((value) => value !== item) : [...list, item]);

  const eventsForView = useMemo(
    () => view === "calendar" || savedOnly
      ? model.events
      : model.events.filter((event) => event.source !== "Manual"),
    [model.events, savedOnly, view],
  );

  const filteredEvents = useMemo(() => filterEvents(eventsForView, {
    preferences: model.preferences,
    availabilityByEvent: model.availabilityByEvent,
    attendanceByEventId: model.attendanceByEventId,
    savedEventIds: model.savedEventIds,
    selectedTopics,
    selectedFormats,
    availabilityFilter,
    searchQuery,
    attendanceStatusFilter,
    savedOnly,
  }), [eventsForView, model.preferences, model.availabilityByEvent, model.attendanceByEventId, model.savedEventIds, selectedTopics, selectedFormats, availabilityFilter, searchQuery, attendanceStatusFilter, savedOnly]);

  const dateGroups = useMemo(() => {
    const groups = new Map<string, EventItem[]>();
    filteredEvents.forEach((event) => {
      const key = dayKey(safeDate(event.start), event.timeZone);
      groups.set(key, [...(groups.get(key) ?? []), event]);
    });
    return [...groups.entries()];
  }, [filteredEvents]);

  const calendarDays = useMemo(
    () => getCalendarViewDays(calendarDate, calendarMode),
    [calendarDate, calendarMode],
  );

  const calendarEvents = useMemo(() => {
    return filteredEvents.filter((event) => calendarDays.some((date) =>
      clipIntervalToCalendarDay(
        safeDate(event.start),
        safeDate(event.end),
        date,
        event.timeZone || "America/Los_Angeles",
      ) !== null,
    ));
  }, [filteredEvents, calendarDays]);

  const saveEvent = (event: EventItem) => {
    const wasSaved = model.savedEventIds.includes(event.id);
    model.saveEvent(event);
    if (!wasSaved && view === "calendar") {
      const candidates = [
        ...filteredEvents.filter((candidate) => candidate.id !== event.id),
        event,
      ];
      const nearest = findNearestUpcomingSavedEvent(
        candidates,
        [...model.savedEventIds, event.id],
      );
      if (nearest) setCalendarDate(atCalendarNoon(safeDate(nearest.start)));
    }
    showToast(wasSaved
      ? "Removed from saved events"
      : model.isAuthenticated ? "Saved to your account" : "Saved on this device · Sign in to sync");
  };

  const toggleMyEvents = () => {
    const nextSavedOnly = !savedOnly;
    if (nextSavedOnly && view === "calendar") {
      const nearest = findNearestUpcomingSavedEvent(filteredEvents, [...model.savedEventIds, ...model.manualEventIds]);
      if (nearest) setCalendarDate(atCalendarNoon(safeDate(nearest.start)));
    }
    setSavedOnly(nextSavedOnly);
  };

  const saveManualEvent = async (input: ManualEventInput) => {
    if (manualEventEditor?.event) {
      await model.updateManualEvent(manualEventEditor.event.id, input);
      showToast("Personal event updated");
    } else {
      const event = await model.createManualEvent(input);
      if (view === "calendar") {
        setCalendarDate(atCalendarNoon(safeDate(event.start)));
        setCalendarMode("day");
      }
      showToast("Personal event added to My Events");
    }
  };

  const deleteManualEvent = async (event: EventItem) => {
    try {
      await model.deleteManualEvent(event.id);
      setActiveEvent(null);
      showToast("Personal event deleted");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Could not delete this event.");
    }
  };

  const clearFilters = () => {
    setSelectedTopics([]);
    setSelectedFormats([]);
    setAvailabilityFilter("all");
    setSearchQuery("");
    setAttendanceStatusFilter("all");
    setSavedOnly(false);
  };

  const openCalendar = () => {
    setCalendarDate(atCalendarNoon(new Date()));
    setCalendarMode("week");
    setView("calendar");
  };

  const onImport = async (file?: File) => {
    if (!file) return;
    try {
      const parsed: unknown = JSON.parse(await file.text());
      const count = model.importBusyIntervals(parsed);
      showToast(`${count} calendar ${count === 1 ? "commitment" : "commitments"} imported locally`);
    } catch (error) {
      showToast(error instanceof Error ? error.message : "That file could not be imported.");
      throw error;
    }
  };

  return (
    <div className="app-shell">
      <header className="topbar">
        <button className="brand" aria-label="OpenWindow home" onClick={() => { clearFilters(); setView("list"); }}>
          <span className="brand-mark" aria-hidden="true" />
          <span className="brand-name">openwindow</span>
        </button>
        <div className="top-actions">
          <span className="source-pill" title="Events currently come from the local demo dataset">
            <span className="source-dot" /> Demo mode
          </span>
          <div className="account-links" aria-label="Account">
            {isLoaded && user ? (
              <>
                <span className="account-name">{user.firstName || "Your account"}</span>
                <button className="text-button account-button" type="button" onClick={() => void signOut({ redirectUrl: basePath || "/" })}>Sign out</button>
              </>
            ) : (
              <>
                <Link className="text-button account-button" href="/sign-in">Sign in</Link>
                <Link className="button primary account-signup" href="/sign-up">Sign up</Link>
              </>
            )}
          </div>
          <button className="text-button" onClick={() => setPreferencesOpen(true)}><Settings2 size={16} /> Preferences</button>
        </div>
      </header>

      <main className="page">
        <div className="workspace">
          <aside className="sidebar" aria-label="Event filters">
            <div className="sidebar-head">
              <div className="sidebar-title"><SlidersHorizontal size={14} style={{ verticalAlign: "-2px", marginRight: 7 }} /> Refine your window</div>
              <button className="reset-button" onClick={clearFilters}>Reset</button>
            </div>
            <section className="filter-section search-filter-section">
              <label className="filter-label" htmlFor="event-search">Search events</label>
              <input
                id="event-search"
                className="event-search-input"
                type="search"
                aria-label="Search events by title or description"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Title or description"
                autoComplete="off"
              />
            </section>
            <section className="filter-section">
              <div className="filter-label">Topics <small>{selectedTopics.length ? `${selectedTopics.length} selected` : "choose any"}</small></div>
              <div className="chips">{TOPICS.map((topic) => <button key={topic} className={`chip ${selectedTopics.includes(topic) ? "active" : ""}`} aria-pressed={selectedTopics.includes(topic)} onClick={() => toggleIn(selectedTopics, topic, setSelectedTopics)}>{topic}</button>)}</div>
            </section>
            <section className="filter-section">
              <div className="filter-label">Format <small>{selectedFormats.length ? `${selectedFormats.length} selected` : "choose any"}</small></div>
              <div className="chips">{FORMATS.map((format) => <button key={format} className={`chip ${selectedFormats.includes(format) ? "active" : ""}`} aria-pressed={selectedFormats.includes(format)} onClick={() => toggleIn(selectedFormats, format, setSelectedFormats)}>{format}</button>)}</div>
            </section>
            <section className="filter-section">
              <label className="filter-label" htmlFor="availability-filter">Availability</label>
              <select id="availability-filter" className="availability-select" value={availabilityFilter} onChange={(event) => setAvailabilityFilter(event.target.value as AvailabilityFilter)}>
                <option value="all">All availability</option>
                <option value="available">Available</option>
                <option value="conflict">Conflicts</option>
                <option value="unknown">Unknown</option>
              </select>
            </section>
            <section className="filter-section">
              <div className="filter-label">Calendar context <small>{model.busyOrigin}</small></div>
            </section>
          </aside>

          <section className="main-panel" aria-label="Event opportunities">
            <div className="panel-toolbar">
              <div className="view-switch" role="tablist" aria-label="Event view">
                <button role="tab" aria-selected={view === "list"} className={view === "list" ? "selected" : ""} onClick={() => setView("list")}><LayoutList size={15} /> List</button>
                <button role="tab" aria-selected={view === "calendar"} className={view === "calendar" ? "selected" : ""} onClick={openCalendar}><CalendarDays size={15} /> Calendar</button>
              </div>
              <div className="toolbar-right">
                <button
                  className={`saved-toggle ${savedOnly ? "active" : ""}`}
                  aria-pressed={savedOnly}
                  aria-label={savedOnly ? "My Events selected" : "Show My Events"}
                  onClick={toggleMyEvents}
                >
                  <Heart size={15} fill={savedOnly ? "currentColor" : "none"} /> My Events <span>{model.savedEventIds.length + model.manualEventIds.length}</span>
                </button>
                {savedOnly && (
                  <button className="text-button my-events-return" type="button" onClick={() => setSavedOnly(false)}>
                    <ChevronLeft size={14} /> Full Discover
                  </button>
                )}
                {savedOnly && (
                  <label className="attendance-filter">
                    <span>Status</span>
                    <select
                      aria-label="Filter My Events by attendance status"
                      value={attendanceStatusFilter}
                      onChange={(event) => setAttendanceStatusFilter(event.target.value as AttendanceStatusFilter)}
                    >
                      <option value="all">All</option>
                      {ATTENDANCE_STATUSES.map((status) => (
                        <option key={status} value={status}>{ATTENDANCE_STATUS_LABELS[status]}</option>
                      ))}
                    </select>
                  </label>
                )}
                {savedOnly && (
                  <button className="button primary add-event-button" type="button" onClick={() => setManualEventEditor({})}>
                    <Plus size={14} /> Add Event
                  </button>
                )}
                <span className="count-label">
                  {view === "calendar"
                    ? `${calendarEvents.length} ${calendarMode === "week" ? "this week" : calendarMode === "day" ? "in day" : "in month view"} · ${filteredEvents.length} total`
                    : savedOnly
                      ? `${filteredEvents.length} ${filteredEvents.length === 1 ? "event" : "events"}`
                      : `${filteredEvents.length} ${filteredEvents.length === 1 ? "event" : "events"}`}
                </span>
              </div>
            </div>
            {view === "list" ? (
              filteredEvents.length ? <div className="events-list">
                {dateGroups.map(([date, events]) => (
                  <section className="date-group" key={date}>
                    <h2 className="date-heading">{formatLongDate(safeDate(events[0].start))}{events.length > 1 && <span>{events.length} events</span>}</h2>
                    {events.map((event) => <EventRow
                      key={event.id}
                      event={event}
                      availability={model.availabilityByEvent[event.id] ?? "unknown"}
                      saved={model.savedEventIds.includes(event.id)}
                      attendance={savedOnly ? {
                        eventId: event.id,
                        eventTitle: event.title,
                        status: model.attendanceByEventId[event.id] ?? "interested",
                        isAuthenticated: model.isAuthenticated,
                        accountReady: model.accountReady,
                        onChange: (status) => model.updateAttendanceStatus(event.id, status),
                      } : undefined}
                      onSave={() => saveEvent(event)}
                      onDetails={() => setActiveEvent(event)}
                    />)}
                  </section>
                ))}
                <div className="footer-note"><span>Local times · Suggestions, not bookings.</span></div>
              </div> : <EmptyState
                savedOnly={savedOnly}
                attendanceFiltered={attendanceStatusFilter !== "all"}
                searchActive={Boolean(searchQuery.trim())}
                onReset={() => {
                  if (savedOnly && attendanceStatusFilter !== "all") setAttendanceStatusFilter("all");
                  else clearFilters();
                }}
                onClearSearch={() => setSearchQuery("")}
                onPreferences={() => setPreferencesOpen(true)}
              />
            ) : (
              <>
              {calendarEvents.length === 0 && (
                <div className="calendar-empty-note" role="status">
                  <div>
                    <strong>No suggested events match this calendar view.</strong>
                    <p>Your personal calendar commitments are still shown. Adjust your filters or search for another event.</p>
                  </div>
                  {searchQuery.trim() && (
                    <button className="text-button" type="button" onClick={() => setSearchQuery("")}>Clear search</button>
                  )}
                </div>
              )}
              <CalendarView
                date={calendarDate}
                mode={calendarMode}
                days={calendarDays}
                events={calendarEvents}
                busyIntervals={model.busyIntervals}
                availability={model.availabilityByEvent}
                savedEventIds={model.savedEventIds}
                attendanceByEventId={model.attendanceByEventId}
                onModeChange={setCalendarMode}
                onNavigate={(amount) => setCalendarDate((date) => navigateCalendarDate(date, calendarMode, amount))}
                onToday={() => setCalendarDate(atCalendarNoon(new Date()))}
                onSelectDate={(date) => { setCalendarDate(atCalendarNoon(date)); setCalendarMode("day"); }}
                onEvent={setActiveEvent}
              />
              </>
            )}
          </section>
        </div>
      </main>

      {activeEvent && <EventModal
        event={activeEvent}
        availability={model.availabilityByEvent[activeEvent.id] ?? "unknown"}
        saved={model.savedEventIds.includes(activeEvent.id)}
        attendance={activeEvent.source === "Manual" || (savedOnly && model.savedEventIds.includes(activeEvent.id)) ? {
          eventId: activeEvent.id,
          eventTitle: activeEvent.title,
          status: model.attendanceByEventId[activeEvent.id] ?? "interested",
          isAuthenticated: model.isAuthenticated,
          accountReady: model.accountReady,
          onChange: (status) => model.updateAttendanceStatus(activeEvent.id, status),
        } : undefined}
        onSave={() => saveEvent(activeEvent)}
        onEdit={activeEvent.source === "Manual" ? () => {
          setManualEventEditor({ event: activeEvent });
          setActiveEvent(null);
        } : undefined}
        onDelete={activeEvent.source === "Manual" ? () => void deleteManualEvent(activeEvent) : undefined}
        onClose={() => setActiveEvent(null)}
      />}
      {manualEventEditor && <ManualEventDialog
        initialEvent={manualEventEditor.event}
        isAuthenticated={model.isAuthenticated}
        accountReady={model.accountReady}
        onClose={() => setManualEventEditor(null)}
        onSave={saveManualEvent}
      />}
      {preferencesOpen && <PreferencesModal preferences={model.preferences} syncStatus={model.syncStatus} busyOrigin={model.busyOrigin} onSave={(preferences) => { model.updatePreferences(preferences); setSelectedTopics(preferences.topics); setSelectedFormats(preferences.formats); setPreferencesOpen(false); showToast("Your preferences are saved"); }} onClose={() => setPreferencesOpen(false)} onImport={onImport} onClearImport={() => { model.clearImportedBusyIntervals(); showToast("Demo calendar sample restored"); }} />}
      {model.isAuthenticated && model.persistenceStatus === "error" && <div className="sync-alert" role="status">
        <span>Account sync needs attention. Your local data is still preserved.</span>
        <button type="button" onClick={model.retryAccountSync}>Retry</button>
      </div>}
      {toast && <div role="status" className="toast">{toast}</div>}
    </div>
  );
}

function EventRow({ event, availability, saved, attendance, onSave, onDetails }: {
  event: EventItem; availability: Availability; saved: boolean; attendance?: AttendanceEditorProps;
  onSave: () => void; onDetails: () => void;
}) {
  return (
    <article className="event-row">
      <div className="event-time">{eventClock(event)}<small>to {fmtDate(safeDate(event.end), { hour: "numeric", minute: "2-digit" }, event.timeZone)}</small></div>
      <div className="event-main">
        <h3 className="event-title">{event.title}{event.source === "Manual" && <span className="manual-event-tag">Added by you</span>}</h3>
        <div className="event-sub"><MapPin size={11} style={{ verticalAlign: "-2px", marginRight: 3 }} />{eventLocation(event)}</div>
        <div className="event-tags">
          {event.topics[0] && <span className="mini-tag topic">{event.topics[0]}</span>}
          {event.formats[0] && <span className="mini-tag">{event.formats[0]}</span>}
        </div>
        {attendance && <AttendanceControl {...attendance} />}
      </div>
      <div className="event-actions">
        <span className={`availability ${availability}`}>{availabilityLabel[availability]}</span>
        {event.source !== "Manual" && <button className={`save-btn ${saved ? "saved" : ""}`} onClick={onSave} aria-label={saved ? `Remove ${event.title} from saved` : `Save ${event.title}`} aria-pressed={saved}><Bookmark size={15} fill={saved ? "currentColor" : "none"} /></button>}
        <button className="details-btn" onClick={onDetails}>Details</button>
        {event.source === "Luma" && event.lumaUrl !== "https://lu.ma" && <a className="list-luma-link" href={event.lumaUrl} target="_blank" rel="noreferrer">Open on Luma <ExternalLink size={11} /></a>}
      </div>
    </article>
  );
}

function AttendanceControl({
  eventId,
  eventTitle,
  status,
  isAuthenticated,
  accountReady,
  onChange,
}: AttendanceEditorProps) {
  return (
    <div className="attendance-control">
      <label>
        <span>Attendance</span>
        <select
          aria-label={`Attendance status for ${eventTitle}`}
          value={status}
          disabled={!isAuthenticated || !accountReady}
          onChange={(event) => onChange(event.target.value as AttendanceStatus)}
        >
          {ATTENDANCE_STATUSES.map((value) => (
            <option key={`${eventId}-${value}`} value={value}>{ATTENDANCE_STATUS_LABELS[value]}</option>
          ))}
        </select>
      </label>
      {!isAuthenticated && <Link className="attendance-sign-in" href="/sign-in">Sign in to edit</Link>}
      {isAuthenticated && !accountReady && <span className="attendance-status-note" role="status">Loading account…</span>}
    </div>
  );
}

function EmptyState({ savedOnly, attendanceFiltered, searchActive, onReset, onClearSearch, onPreferences }: {
  savedOnly: boolean;
  attendanceFiltered: boolean;
  searchActive: boolean;
  onReset: () => void;
  onClearSearch: () => void;
  onPreferences: () => void;
}) {
  const title = searchActive
    ? savedOnly ? "No events in My Events match these filters." : "No events match these filters."
    : savedOnly
      ? attendanceFiltered ? "No events match this status." : "No events in My Events yet."
      : "A little quiet in this window.";
  const description = searchActive
    ? "Try another keyword or clear your search. Your other filters will stay in place."
    : savedOnly
      ? attendanceFiltered ? "Choose All or another status to see more of your events." : "Save an event with its bookmark or add a personal event."
      : "Try a broader topic, or open your preferences to make room for more kinds of events.";
  return <div className="empty-state">
    <div><div className="empty-orbit"><Sparkles size={22} /></div>
      <h3>{title}</h3>
      <p>{description}</p>
      {searchActive && <button className="button secondary" onClick={onClearSearch}>Clear search</button>}
      {!searchActive && !savedOnly && <button className="button secondary" onClick={onPreferences}>Adjust preferences</button>}
      {!searchActive && savedOnly && <button className="button secondary" onClick={onReset}>{attendanceFiltered ? "Show all My Events" : "Show all events"}</button>}
    </div>
  </div>;
}

function CalendarView({ date, mode, days, events, busyIntervals, availability, savedEventIds, attendanceByEventId, onModeChange, onNavigate, onToday, onSelectDate, onEvent }: {
  date: Date; mode: CalendarMode; days: Date[]; events: EventItem[]; busyIntervals: BusyInterval[] | null;
  availability: Record<string, Availability>; savedEventIds: string[];
  attendanceByEventId: Record<string, AttendanceStatus>; onModeChange: (mode: CalendarMode) => void;
  onNavigate: (direction: number) => void; onToday: () => void; onSelectDate: (date: Date) => void;
  onEvent: (event: EventItem) => void;
}) {
  const rangeLabel = mode === "day"
    ? fmtDate(date, { weekday: "long", month: "short", day: "numeric", year: "numeric" })
    : mode === "week"
      ? `${fmtDate(days[0], { month: "short", day: "numeric" })} – ${fmtDate(days[6], { month: "short", day: "numeric", year: "numeric" })}`
      : fmtDate(date, { month: "long", year: "numeric" });
  const hourStart = 0;
  const hourEnd = 24;
  const hourCount = hourEnd - hourStart;
  const defaultScrollHour = 8;
  const pxPerMinute = 48 / 60;
  const calendarTimeScrollRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (mode !== "month" && calendarTimeScrollRef.current) {
      calendarTimeScrollRef.current.scrollTop = defaultScrollHour * 48;
    }
  }, [date, mode, defaultScrollHour]);
  const columns = mode === "day"
    ? "48px minmax(240px, 1fr)"
    : "48px repeat(7, minmax(80px, 1fr))";
  const monthWeekdays = days.slice(0, 7);

  return <div className="calendar-wrap">
    <div className="calendar-top">
      <div className="calendar-controls">
        <div className="calendar-mode-switch" role="tablist" aria-label="Calendar mode">
          {(["day", "week", "month"] as const).map((calendarMode) => (
            <button key={calendarMode} type="button" role="tab" aria-selected={mode === calendarMode}
              className={mode === calendarMode ? "selected" : ""}
              onClick={() => onModeChange(calendarMode)}>
              {calendarMode[0].toUpperCase() + calendarMode.slice(1)}
            </button>
          ))}
        </div>
        <div className="calendar-range">
          <div className="calendar-nav">
            <button className="icon-button" aria-label={`Previous ${mode}`} onClick={() => onNavigate(-1)}><ChevronLeft size={16} /></button>
            <button className="icon-button" aria-label={`Next ${mode}`} onClick={() => onNavigate(1)}><ChevronRight size={16} /></button>
          </div>
          <strong>{rangeLabel}</strong>
          <button className="text-button" style={{ fontSize: 10, padding: 6 }} onClick={onToday}>Today</button>
        </div>
      </div>
      <div className="calendar-legend">
        <span className="legend-item"><i className="legend-swatch" />Existing</span>
        <span className="legend-item"><i className="legend-swatch suggested" />Suggested</span>
        <span className="legend-item"><i className="legend-swatch conflict" />Conflict</span>
      </div>
    </div>
    {mode === "month" ? (
      <div className="calendar-grid month-view">
        <div className="calendar-month-weekdays">
          {monthWeekdays.map((day) => <div key={day.toISOString()}>{fmtDate(day, { weekday: "short" })}</div>)}
        </div>
        <div className="calendar-month-grid">
          {days.map((day) => {
            const dayEvents = events.filter((event) =>
              dayKey(safeDate(event.start), event.timeZone) === dayKey(day),
            );
            const dayBusyCount = countCalendarBusyIntervalsForDay(day, busyIntervals);
            const currentMonth = day.getMonth() === date.getMonth() && day.getFullYear() === date.getFullYear();
            const today = dayKey(day) === dayKey(new Date());
            return <section className={`month-cell ${currentMonth ? "" : "outside-month"}`} key={day.toISOString()}>
              <button type="button" className={`month-date ${today ? "today" : ""}`}
                aria-label={`Open ${fmtDate(day, { weekday: "long", month: "long", day: "numeric" })} in day view`}
                onClick={() => onSelectDate(day)}>
                {fmtDate(day, { day: "numeric" })}
              </button>
              <div className="month-day-events">
                {dayEvents.slice(0, 3).map((event) => {
                  const attendanceStatus = getCalendarAttendanceStatus(event.id, savedEventIds, attendanceByEventId, event.source === "Manual");
                  const accessibleLabel = getCalendarEventAccessibleLabel(
                    event,
                    availability[event.id] ?? "unknown",
                    attendanceStatus,
                  );
                  return <button type="button" key={event.id}
                    className={`month-event ${availability[event.id] === "conflict" ? "conflict" : ""}`}
                    aria-label={accessibleLabel}
                    title={attendanceStatus
                      ? `${event.title} · Attendance status: ${ATTENDANCE_STATUS_LABELS[attendanceStatus]}`
                      : event.title}
                    onClick={() => onEvent(event)}>
                    {attendanceStatus && <CalendarAttendanceMarker status={attendanceStatus} />}
                    <span>{fmtDate(safeDate(event.start), { hour: "numeric", minute: "2-digit" }, event.timeZone)}</span>
                    <strong>{event.title}</strong>
                  </button>;
                })}
                {dayEvents.length > 3 && <span className="month-more">+{dayEvents.length - 3} more</span>}
                {dayBusyCount > 0 && <span className="month-busy">{dayBusyCount} existing</span>}
              </div>
            </section>;
          })}
        </div>
      </div>
    ) : (
      <div className={`calendar-grid ${mode}-view`}>
        <div className="calendar-days" style={{ gridTemplateColumns: columns }}>
          <div className="day-cell" aria-hidden="true" />
          {days.map((day) => <div className={`day-cell ${dayKey(day) === dayKey(new Date()) ? "today" : ""}`} key={day.toISOString()}>
            {mode === "week" && fmtDate(day, { weekday: "short" })}
            <strong>{fmtDate(day, { day: "numeric" })}</strong>
          </div>)}
        </div>
        <div className="calendar-time-scroll" ref={calendarTimeScrollRef}>
          <div className="time-grid" style={{ gridTemplateColumns: columns }}>
            <div className="hours-col">{Array.from({ length: hourCount }, (_, index) => <div className="hour-label" key={index}>{new Intl.DateTimeFormat("en-US", { hour: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(2024, 0, 1, hourStart + index)))}</div>)}</div>
            {days.map((day) => {
              const blocks = getCalendarDayBlocks(
                day,
                events,
                busyIntervals,
                availability,
                savedEventIds,
                attendanceByEventId,
              )
                .flatMap((block) => {
                  const timeRange = getVisibleMinuteRange(
                    block.start,
                    block.end,
                    block.zone,
                    hourStart,
                    hourStart + hourCount,
                  );
                  return timeRange ? [{ ...block, timeRange }] : [];
                })
                .sort((a, b) => a.start.getTime() - b.start.getTime());
              const lanes: number[] = [];
              const allocated = blocks.map((block) => {
                let lane = lanes.findIndex((laneEnd) => laneEnd <= block.timeRange.visibleStartMinute);
                if (lane < 0) lane = lanes.length;
                lanes[lane] = block.timeRange.visibleEndMinute;
                return { ...block, lane };
              });
              const laneCount = Math.max(1, lanes.length);
              return <div className="calendar-day-col" key={day.toISOString()}>
                {allocated.map((block) => {
                  const top = (block.timeRange.visibleStartMinute - hourStart * 60) * pxPerMinute;
                  const height = Math.max(
                    18,
                    (block.timeRange.visibleEndMinute - block.timeRange.visibleStartMinute) * pxPerMinute,
                  );
                  const busy = block.kind === "busy";
                  const attendanceStatus = block.kind === "event" ? block.attendanceStatus : null;
                  const accessibleLabel = block.kind === "busy"
                    ? "Existing calendar commitment"
                    : getCalendarEventAccessibleLabel(block.event, block.availability, block.attendanceStatus);
                  return <button key={block.key} type="button" className={`cal-block ${busy ? "busy" : `suggested ${block.availability === "conflict" ? "conflict" : ""}`}`}
                    style={{ top, height, left: `calc(${block.lane} * (100% - 8px) / ${laneCount} + 4px)`, width: `calc((100% - 8px) / ${laneCount} - 3px)` }}
                    onClick={() => { if (block.kind === "event") onEvent(block.event); }} disabled={busy}
                    aria-label={accessibleLabel}
                    title={block.kind === "event" && attendanceStatus
                      ? `${block.event.title} · Attendance status: ${ATTENDANCE_STATUS_LABELS[attendanceStatus]}`
                      : undefined}>
                    <strong className={busy ? undefined : "calendar-event-title"}>
                      {busy
                        ? "Existing commitment"
                        : <>
                          {attendanceStatus && <CalendarAttendanceMarker status={attendanceStatus} />}
                          <span className="calendar-event-title-text">{block.event.title}</span>
                        </>}
                    </strong>
                    <span>{fmtDate(block.start, { hour: "numeric", minute: "2-digit" }, block.zone)}{!busy && eventLocation(block.event) ? ` · ${eventLocation(block.event)}` : ""}</span>
                  </button>;
                })}
              </div>;
            })}
          </div>
        </div>
      </div>
    )}
    <p className="calendar-foot">
      {mode === "month"
        ? "Select a date for Day view, or select an event for details."
        : `Showing ${mode === "week" ? "this week" : "this day"}. Scroll vertically to see earlier or later hours. Select an event for details; nothing is added automatically.`}
    </p>
  </div>;
}

function EventModal({ event, availability, saved, attendance, onSave, onEdit, onDelete, onClose }: {
  event: EventItem; availability: Availability; saved: boolean; attendance?: AttendanceEditorProps;
  onSave: () => void; onEdit?: () => void; onDelete?: () => void; onClose: () => void;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  return <div className="modal-backdrop" onMouseDown={(eventClick) => { if (eventClick.target === eventClick.currentTarget) onClose(); }}>
    <section className="modal" role="dialog" aria-modal="true" aria-labelledby="event-dialog-title">
      <div className="modal-header"><div><div className="eyebrow">{event.source === "Manual" ? "Personal event · Suggested" : "Event details"}</div><h2 id="event-dialog-title">{event.title}</h2></div><button className="modal-close" aria-label="Close details" onClick={onClose}><X size={17} /></button></div>
      <div className="modal-content">
        <div className="detail-meta">
          <div className="meta-block"><small>When</small><strong>{formatLongDate(safeDate(event.start))}<br />{eventClock(event)} – {eventClock(event, true).replace(/ [A-Z]{2,5}$/, "")}</strong></div>
          <div className="meta-block"><small>Where</small><strong>{eventLocation(event)}</strong></div>
        </div>
        <div className="detail-fit"><span>Calendar fit</span><strong className={`availability ${availability}`}>{availabilityLabel[availability]}</strong></div>
        {attendance && <AttendanceControl {...attendance} />}
        <p className="detail-description">{event.description}</p>
        <div className="detail-tag-list">
          {event.topics[0] && <span className="mini-tag topic">{event.topics[0]}</span>}
          {event.formats[0] && <span className="mini-tag">{event.formats[0]}</span>}
        </div>
        <div className="modal-actions">
          <button className="button primary" onClick={() => downloadIcs(event)}><Download size={14} /> Download .ics</button>
          {event.source === "Manual" ? (
            <>
              <button className="button secondary" type="button" onClick={onEdit}><Pencil size={14} /> Edit event</button>
              {!confirmDelete ? (
                <button className="button danger" type="button" onClick={() => setConfirmDelete(true)}><Trash2 size={14} /> Delete</button>
              ) : (
                <div className="delete-confirm" role="group" aria-label="Confirm delete personal event">
                  <span>Delete this event?</span>
                  <button className="button danger" type="button" onClick={onDelete}>Delete event</button>
                  <button className="button secondary" type="button" onClick={() => setConfirmDelete(false)}>Cancel</button>
                </div>
              )}
            </>
          ) : <button className="button secondary" onClick={onSave}><Bookmark size={14} fill={saved ? "currentColor" : "none"} /> {saved ? "Saved" : "Save event"}</button>}
          {event.source === "Luma" && event.lumaUrl !== "https://lu.ma" && <a className="external-link" href={event.lumaUrl} target="_blank" rel="noreferrer">Open on Luma <ExternalLink size={13} /></a>}
          {event.source === "Manual" && event.eventUrl && <a className="external-link" href={event.eventUrl} target="_blank" rel="noreferrer">Open event link <ExternalLink size={13} /></a>}
        </div>
        <p className="filter-note" style={{ marginTop: 12 }}>Download the calendar file to add this event yourself.</p>
      </div>
    </section>
  </div>;
}

function PreferencesModal({ preferences, syncStatus, busyOrigin, onSave, onClose, onImport, onClearImport }: {
  preferences: Preferences; syncStatus: { lastSyncedAt: string | null; sourceCount: number; isStale: boolean };
  busyOrigin: string; onSave: (preferences: Preferences) => void; onClose: () => void;
  onImport: (file?: File) => Promise<void>; onClearImport: () => void;
}) {
  const [cities, setCities] = useState(preferences.cities.join(", "));
  const [horizon, setHorizon] = useState(String(preferences.dateHorizonDays));
  const [topics, setTopics] = useState<Topic[]>(preferences.topics);
  const [formats, setFormats] = useState<Format[]>(preferences.formats);
  const [importMessage, setImportMessage] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const toggleTopic = (topic: Topic) => setTopics((current) => current.includes(topic) ? current.filter((item) => item !== topic) : [...current, topic]);
  const toggleFormat = (format: Format) => setFormats((current) => current.includes(format) ? current.filter((item) => item !== format) : [...current, format]);
  const submitImport = async (file?: File) => {
    if (!file) return;
    setImportMessage("");
    try {
      await onImport(file);
      setImportMessage(`${file.name} imported successfully. Times remain local.`);
    } catch (error) {
      setImportMessage(error instanceof Error ? error.message : "Could not import this file.");
    }
    if (inputRef.current) inputRef.current.value = "";
  };
  const syncText = syncStatus.lastSyncedAt
    ? `Last imported ${new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(new Date(syncStatus.lastSyncedAt))}${syncStatus.sourceCount ? ` · ${syncStatus.sourceCount} source${syncStatus.sourceCount === 1 ? "" : "s"}` : ""}`
    : "No personal calendar file has been imported.";

  return <div className="modal-backdrop" onMouseDown={(eventClick) => { if (eventClick.target === eventClick.currentTarget) onClose(); }}>
    <section className="modal" role="dialog" aria-modal="true" aria-labelledby="preferences-title">
      <div className="modal-header"><div><div className="eyebrow">Make it yours</div><h2 id="preferences-title">Your preferences</h2></div><button className="modal-close" aria-label="Close preferences" onClick={onClose}><X size={17} /></button></div>
      <div className="modal-content">
        <div className="form-field"><label htmlFor="cities">Cities</label><input id="cities" value={cities} onChange={(event) => setCities(event.target.value)} placeholder="San Francisco, Berkeley" /><p className="help">Leave empty to include every available Bay Area city.</p></div>
        <div className="form-field"><label htmlFor="horizon">Look ahead</label><select id="horizon" value={horizon} onChange={(event) => setHorizon(event.target.value)}>{Array.from({ length: 30 }, (_, index) => <option value={index + 1} key={index}>{index + 1} days</option>)}</select></div>
        <h3 className="pref-section-title">Optional topic defaults</h3>
        <div className="pref-chips">{TOPICS.map((topic) => <button type="button" key={topic} aria-pressed={topics.includes(topic)} className={`chip ${topics.includes(topic) ? "active" : ""}`} onClick={() => toggleTopic(topic)}>{topics.includes(topic) && <Check size={10} style={{ marginRight: 3, verticalAlign: "-1px" }} />}{topic}</button>)}</div>
        <h3 className="pref-section-title">Optional format defaults</h3>
        <div className="pref-chips">{FORMATS.map((format) => <button type="button" key={format} aria-pressed={formats.includes(format)} className={`chip ${formats.includes(format) ? "active" : ""}`} onClick={() => toggleFormat(format)}>{formats.includes(format) && <Check size={10} style={{ marginRight: 3, verticalAlign: "-1px" }} />}{format}</button>)}</div>

        <h3 className="pref-section-title">Calendar context</h3>
        <div className={`status-box ${syncStatus.isStale ? "warning" : ""}`}>
          <strong>{busyOrigin}</strong><br />{syncText}
          {syncStatus.isStale && <><br />This calendar file may be out of date. Import a fresh one when you’re ready.</>}
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <input ref={inputRef} className="file-input" type="file" accept=".json,application/json" aria-label="Choose local calendar JSON" onChange={(event) => void submitImport(event.target.files?.[0])} />
          <button type="button" className="button secondary" onClick={() => inputRef.current?.click()}><Upload size={14} /> Import calendar JSON</button>
          {busyOrigin === "Imported locally" && <button type="button" className="button secondary" onClick={onClearImport}><RotateCcw size={14} /> Restore demo sample</button>}
        </div>
        {importMessage && <p className={`import-message ${importMessage.includes("successfully") ? "" : "error"}`} role="status">{importMessage}</p>}
         <p className="filter-note">Imported calendar times stay on this device while signed out. When signed in, they are saved privately to your account.</p>
        <div className="modal-actions" style={{ marginTop: 19 }}>
          <button className="button primary" onClick={() => onSave({
            keywords: preferences.keywords,
            cities: cities.split(",").map((value) => value.trim()).filter(Boolean),
            dateHorizonDays: Math.max(1, Math.min(30, Number(horizon) || 1)),
            topics, formats,
          })}>Save preferences</button>
          <button className="button secondary" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </section>
  </div>;
}

export default App;
