import type { EventItem } from "../types";
import { isValidLumaEventUrl } from "../lib/luma-event-url";

export function LumaEventLink({ event }: { event: EventItem }) {
  const isDemoLink = event.source === "Demo";
  const href = isDemoLink ? "https://lu.ma/" : event.sourceUrl;
  if (!href || (!isDemoLink && (event.source !== "Luma" || !isValidLumaEventUrl(href)))) return null;

  return (
    <a
      className="button secondary luma-event-button"
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={isDemoLink
        ? "Explore the Luma website (demo link, opens in a new tab)"
        : `View ${event.title} on Luma (opens in a new tab)`}
    >
      {isDemoLink ? "Explore Luma (Demo) ↗" : "View on Luma ↗"}
    </a>
  );
}
