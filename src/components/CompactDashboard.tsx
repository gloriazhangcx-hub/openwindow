import type { AttendanceStatus } from "../types";
import type { DiscoverSummary, MyEventsSummary } from "../lib/dashboard";

const attendanceSegments: {
  key: AttendanceStatus;
  label: string;
  tone: string;
}[] = [
  { key: "interested", label: "Interested", tone: "interested" },
  { key: "planning_to_attend", label: "Planning", tone: "planning" },
  { key: "registered", label: "Registered", tone: "registered" },
];

type ChartSegment = {
  key: string;
  label: string;
  count: number;
  tone: string;
};

function StackedBar({ title, total, segments }: {
  title: string;
  total: number;
  segments: ChartSegment[];
}) {
  const description = total === 0
    ? `${title}: no events`
    : `${title}: ${segments.map((segment) => `${segment.label}, ${segment.count}`).join("; ")}; ${total} events total`;

  return (
    <section className="my-events-chart" aria-label={title}>
      <h3>{title}</h3>
      <div className={`dashboard-stack${total === 0 ? " empty" : ""}`} role="img" aria-label={description}>
        {segments.filter((segment) => segment.count > 0).map((segment) => (
          <span
            key={segment.key}
            className={`dashboard-stack-segment ${segment.tone}`}
            style={{ width: `${(segment.count / total) * 100}%` }}
          />
        ))}
      </div>
      <div className="dashboard-legend">
        {segments.map((segment) => (
          <span className="dashboard-legend-item" key={segment.key}>
            <i className={`dashboard-legend-swatch ${segment.tone}`} aria-hidden="true" />
            <span>{segment.label}</span>
            <strong>{segment.count}</strong>
          </span>
        ))}
      </div>
    </section>
  );
}

export function DiscoverSummaryStrip({ summary }: { summary: DiscoverSummary }) {
  return (
    <section className="discover-summary" aria-label="Discover event summary">
      <div className="discover-summary-stat total">
        <span>Total Events</span>
        <strong>{summary.totalEvents}</strong>
      </div>
      <div className="discover-summary-stat conflicts">
        <span>Conflicts</span>
        <strong>{summary.conflicts}</strong>
      </div>
      <div className="discover-summary-stat no-conflicts">
        <span>No Conflicts</span>
        <strong>{summary.noConflicts}</strong>
      </div>
      <p className="discover-summary-note">
        No overlap detected in current calendar data; availability is not guaranteed.
      </p>
    </section>
  );
}

export function MyEventsDashboard({ summary }: { summary: MyEventsSummary }) {
  const eventWord = summary.totalEvents === 1 ? "event" : "events";

  return (
    <section className="my-events-dashboard" aria-labelledby="my-events-dashboard-title">
      <h2 id="my-events-dashboard-title">
        My Events <span>— {summary.totalEvents} {eventWord}</span>
      </h2>
      <div className="my-events-chart-grid">
        <StackedBar
          title="By Source"
          total={summary.totalEvents}
          segments={[
            { key: "from-discover", label: "From Discover", count: summary.fromDiscover, tone: "discover" },
            { key: "added-by-me", label: "Added by Me", count: summary.addedByMe, tone: "manual" },
          ]}
        />
        <StackedBar
          title="By Attendance Status"
          total={summary.totalEvents}
          segments={attendanceSegments.map((segment) => ({
            ...segment,
            count: summary.attendance[segment.key],
          }))}
        />
      </div>
    </section>
  );
}
