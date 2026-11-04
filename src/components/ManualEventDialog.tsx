import { useState, type FormEvent } from "react";
import { Link } from "wouter";
import type { EventItem, Format, ManualEventInput, Topic } from "../types";
import { FORMATS, TOPICS } from "../types";
import { X } from "lucide-react";

type ManualEventDialogProps = {
  initialEvent?: EventItem;
  isAuthenticated: boolean;
  accountReady: boolean;
  onClose: () => void;
  onSave: (input: ManualEventInput) => Promise<void>;
};

function localDateTime(value?: string): string {
  if (!value) return "";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function ManualEventDialog({
  initialEvent,
  isAuthenticated,
  accountReady,
  onClose,
  onSave,
}: ManualEventDialogProps) {
  const [title, setTitle] = useState(initialEvent?.title ?? "");
  const [start, setStart] = useState(localDateTime(initialEvent?.start));
  const [end, setEnd] = useState(localDateTime(initialEvent?.end));
  const [location, setLocation] = useState(initialEvent?.location ?? initialEvent?.venue ?? "");
  const [eventUrl, setEventUrl] = useState(initialEvent?.eventUrl ?? "");
  const [description, setDescription] = useState(initialEvent?.description ?? "");
  const [topics, setTopics] = useState<Topic[]>(initialEvent?.topics ?? []);
  const [formats, setFormats] = useState<Format[]>(initialEvent?.formats ?? []);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const toggleTopic = (topic: Topic) => setTopics((current) =>
    current.includes(topic) ? current.filter((item) => item !== topic) : [...current, topic],
  );
  const toggleFormat = (format: Format) => setFormats((current) =>
    current.includes(format) ? current.filter((item) => item !== format) : [...current, format],
  );

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextErrors: Record<string, string> = {};
    const trimmedTitle = title.trim();
    const startDate = start ? new Date(start) : null;
    const endDate = end ? new Date(end) : null;
    if (!trimmedTitle) nextErrors.title = "Enter an event title.";
    else if (trimmedTitle.length > 240) nextErrors.title = "Use 240 characters or fewer.";
    if (!startDate || !Number.isFinite(startDate.getTime())) nextErrors.start = "Choose a valid start time.";
    if (!endDate || !Number.isFinite(endDate.getTime())) nextErrors.end = "Choose a valid end time.";
    else if (startDate && Number.isFinite(startDate.getTime()) && endDate <= startDate) {
      nextErrors.end = "End time must be after the start time.";
    }
    if (location.trim().length > 240) nextErrors.location = "Use 240 characters or fewer.";
    if (description.trim().length > 8_000) nextErrors.description = "Use 8,000 characters or fewer.";
    if (eventUrl.trim()) {
      try {
        const url = new URL(eventUrl.trim());
        if (!["http:", "https:"].includes(url.protocol) || !url.hostname) {
          nextErrors.eventUrl = "Use a valid http or https URL.";
        }
      } catch {
        nextErrors.eventUrl = "Use a valid http or https URL.";
      }
    }
    if (Object.keys(nextErrors).length) {
      setErrors(nextErrors);
      return;
    }
    if (!isAuthenticated || !accountReady || !startDate || !endDate) return;

    setErrors({});
    setSaving(true);
    try {
      await onSave({
        title: trimmedTitle,
        description: description.trim(),
        start: startDate.toISOString(),
        end: endDate.toISOString(),
        timeZone: initialEvent?.timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone ?? "UTC",
        location: location.trim(),
        eventUrl: eventUrl.trim(),
        topics,
        formats,
      });
      onClose();
    } catch (error) {
      setErrors({
        form: error instanceof Error ? error.message : "Could not save this event. Try again.",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-backdrop" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <section className="modal manual-event-dialog" role="dialog" aria-modal="true" aria-labelledby="manual-event-title">
        <div className="modal-header">
          <div>
            <div className="eyebrow">{initialEvent ? "Personal event" : "Add to My Events"}</div>
            <h2 id="manual-event-title">{initialEvent ? "Edit event" : "Add an event"}</h2>
          </div>
          <button className="modal-close" type="button" aria-label="Close event form" onClick={onClose}><X size={17} /></button>
        </div>
        {!isAuthenticated || !accountReady ? (
          <div className="modal-content">
            <div className="status-box">
              <strong>{isAuthenticated ? "Your account is loading" : "Sign in to add a personal event"}</strong>
              <br />
              {isAuthenticated
                ? "Your private events will be available as soon as your account is ready."
                : "Personal events are saved to your account. Your existing signed-out bookmarks stay on this device."}
            </div>
            {!isAuthenticated && <Link className="button primary" href="/sign-in">Sign in</Link>}
            <div className="modal-actions">
              <button className="button secondary" type="button" onClick={onClose}>Close</button>
            </div>
          </div>
        ) : (
          <form className="modal-content manual-event-form" onSubmit={(event) => void submit(event)} noValidate>
            {errors.form && <p className="form-error" role="alert">{errors.form}</p>}
            <div className="form-field">
              <label htmlFor="manual-title">Event title <span aria-hidden="true">*</span></label>
              <input id="manual-title" value={title} maxLength={240} aria-invalid={Boolean(errors.title)}
                aria-describedby={errors.title ? "manual-title-error" : undefined}
                onChange={(event) => setTitle(event.target.value)} required autoFocus />
              {errors.title && <p className="form-error" id="manual-title-error">{errors.title}</p>}
            </div>
            <div className="manual-event-date-grid">
              <div className="form-field">
                <label htmlFor="manual-start">Starts <span aria-hidden="true">*</span></label>
                <input id="manual-start" type="datetime-local" value={start} aria-invalid={Boolean(errors.start)}
                  aria-describedby={errors.start ? "manual-start-error" : undefined}
                  onChange={(event) => setStart(event.target.value)} required />
                {errors.start && <p className="form-error" id="manual-start-error">{errors.start}</p>}
              </div>
              <div className="form-field">
                <label htmlFor="manual-end">Ends <span aria-hidden="true">*</span></label>
                <input id="manual-end" type="datetime-local" value={end} aria-invalid={Boolean(errors.end)}
                  aria-describedby={errors.end ? "manual-end-error" : undefined}
                  onChange={(event) => setEnd(event.target.value)} required />
                {errors.end && <p className="form-error" id="manual-end-error">{errors.end}</p>}
              </div>
            </div>
            <div className="form-field">
              <label htmlFor="manual-location">Location <span className="optional-label">Optional</span></label>
              <input id="manual-location" value={location} maxLength={240} aria-invalid={Boolean(errors.location)}
                onChange={(event) => setLocation(event.target.value)} placeholder="Venue or city" />
              {errors.location && <p className="form-error">{errors.location}</p>}
            </div>
            <div className="form-field">
              <label htmlFor="manual-url">Event URL <span className="optional-label">Optional</span></label>
              <input id="manual-url" type="url" value={eventUrl} maxLength={2_000} aria-invalid={Boolean(errors.eventUrl)}
                onChange={(event) => setEventUrl(event.target.value)} placeholder="https://example.com/event" />
              {errors.eventUrl && <p className="form-error">{errors.eventUrl}</p>}
            </div>
            <div className="form-field">
              <label htmlFor="manual-description">Description <span className="optional-label">Optional</span></label>
              <textarea id="manual-description" value={description} maxLength={8_000}
                onChange={(event) => setDescription(event.target.value)} rows={4} />
            </div>
            <fieldset className="manual-event-fieldset">
              <legend>Topics <span className="optional-label">Optional</span></legend>
              <div className="pref-chips">
                {TOPICS.map((topic) => <button type="button" key={topic} aria-pressed={topics.includes(topic)}
                  className={`chip ${topics.includes(topic) ? "active" : ""}`} onClick={() => toggleTopic(topic)}>{topic}</button>)}
              </div>
            </fieldset>
            <fieldset className="manual-event-fieldset">
              <legend>Format <span className="optional-label">Optional</span></legend>
              <div className="pref-chips">
                {FORMATS.map((format) => <button type="button" key={format} aria-pressed={formats.includes(format)}
                  className={`chip ${formats.includes(format) ? "active" : ""}`} onClick={() => toggleFormat(format)}>{format}</button>)}
              </div>
            </fieldset>
            <p className="filter-note">This event is a suggestion you’re considering, not an existing calendar commitment. Times use {initialEvent?.timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone}.</p>
            <div className="modal-actions">
              <button className="button primary" type="submit" disabled={saving}>{saving ? "Saving…" : initialEvent ? "Save changes" : "Add event"}</button>
              <button className="button secondary" type="button" onClick={onClose} disabled={saving}>Cancel</button>
            </div>
          </form>
        )}
      </section>
    </div>
  );
}
