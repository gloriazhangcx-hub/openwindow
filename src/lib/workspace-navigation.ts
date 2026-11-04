export type WorkspaceTab = "discover" | "calendar" | "my-events";
export type EventView = "list" | "calendar";

export const INITIAL_WORKSPACE_TAB: WorkspaceTab = "discover";

export function getEventView(tab: WorkspaceTab): EventView {
  return tab === "calendar" ? "calendar" : "list";
}
