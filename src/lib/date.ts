// Built once at module scope. UTC, because a date-only value parses as UTC
// midnight and would show the previous day west of UTC.
const LONG = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

// German posts only; everything else on the site stays en-GB.
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
const DAY_MONTH = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});

export function formatDayMonth(dateString: string): string {
  return DAY_MONTH.format(new Date(dateString));
}
