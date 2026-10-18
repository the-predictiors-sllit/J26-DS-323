const formatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Colombo", year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
});

// SVAR displays browser-local Date fields. These synthetic display dates hold
// Colombo wall time, not instants. Keep original timestamps for APIs and export.
export function ganttWallTime(iso: string): Date {
  const instant = new Date(iso);
  if (!Number.isFinite(instant.valueOf())) throw new Error("Invalid schedule timestamp.");
  const parts = formatter.formatToParts(instant);
  const number = (type: string) => Number(parts.find(part => part.type === type)?.value);
  return new Date(number("year"), number("month") - 1, number("day"), number("hour"), number("minute"), number("second"));
}

export function clockLabel(value: Date) {
  return `${String(value.getHours()).padStart(2, "0")}:${String(value.getMinutes()).padStart(2, "0")}`;
}
