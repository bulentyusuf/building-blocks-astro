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

export function formatLongDate(dateString: string, german = false): string {
  return (german ? LONG_DE : LONG).format(new Date(dateString));
}

// Archive rows, where the year heading carries the year.
const DAY_MONTH = new Intl.DateTimeFormat(DEFAULT_LOCALE, {
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});

export function formatDayMonth(dateString: string): string {
  return DAY_MONTH.format(new Date(dateString));
}
