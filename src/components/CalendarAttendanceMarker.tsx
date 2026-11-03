import { Check, CircleDot, Heart } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { ATTENDANCE_STATUS_LABELS, type AttendanceStatus } from "../types";

const statusIcons: Record<AttendanceStatus, LucideIcon> = {
  interested: Heart,
  planning_to_attend: CircleDot,
  registered: Check,
};

export function CalendarAttendanceMarker({ status }: { status: AttendanceStatus }) {
  const Icon = statusIcons[status];
  const accessibleLabel = `Attendance status: ${ATTENDANCE_STATUS_LABELS[status]}`;
  return (
    <span
      className="calendar-attendance-marker"
      role="img"
      aria-label={accessibleLabel}
      title={accessibleLabel}
    >
      <Icon size={10} strokeWidth={2.2} aria-hidden="true" focusable="false" />
    </span>
  );
}
