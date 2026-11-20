import { DEFAULT_LOCALE } from "./constants";

// Built once at module scope. UTC, because a date-only value parses as UTC
// midnight and would show the previous day west of UTC.
const LONG = new Intl.DateTimeFormat(DEFAULT_LOCALE, {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

// German posts only; everything else follows DEFAULT_LOCALE.
const LONG_DE = new Intl.DateTimeFormat("de-DE", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

// The day as picked in Contentful. "2026-11-18T00:30+01:00" is 17 November in
// UTC, so the offset is dropped rather than converted.
function calendarDay(dateString: string): Date {
  return new Date(dateString.slice(0, 10));
}

export function formatLongDate(dateString: string, german = false): string {
  return (german ? LONG_DE : LONG).format(calendarDay(dateString));
}

// Archive rows, where the year heading carries the year.
const DAY_MONTH = new Intl.DateTimeFormat(DEFAULT_LOCALE, {
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});

export function formatDayMonth(dateString: string): string {
  return DAY_MONTH.format(calendarDay(dateString));
}

export function calendarYear(dateString: string): number {
  return calendarDay(dateString).getUTCFullYear();
}
