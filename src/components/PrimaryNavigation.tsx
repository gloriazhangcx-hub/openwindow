import { CalendarDays, LayoutList, Star } from "lucide-react";
import type { WorkspaceTab } from "../lib/workspace-navigation";

type PrimaryNavigationProps = {
  activeTab: WorkspaceTab;
  eventCount: number;
  onSelect: (tab: WorkspaceTab) => void;
};

const tabs: { id: WorkspaceTab; label: string; Icon: typeof LayoutList }[] = [
  { id: "discover", label: "Discover", Icon: LayoutList },
  { id: "calendar", label: "Calendar", Icon: CalendarDays },
  { id: "my-events", label: "My Events", Icon: Star },
];

export function PrimaryNavigation({ activeTab, eventCount, onSelect }: PrimaryNavigationProps) {
  return (
    <div className="view-switch" role="group" aria-label="Primary event views">
      {tabs.map(({ id, label, Icon }) => {
        const selected = activeTab === id;
        return (
          <button
            key={id}
            type="button"
            className={selected ? "selected" : ""}
            aria-pressed={selected}
            aria-label={id === "my-events" ? `${label}, ${eventCount} events` : label}
            onClick={() => onSelect(id)}
          >
            <Icon size={15} aria-hidden="true" />
            <span>{label}</span>
            {id === "my-events" && <span className="view-tab-count" aria-hidden="true">{eventCount}</span>}
          </button>
        );
      })}
    </div>
  );
}
