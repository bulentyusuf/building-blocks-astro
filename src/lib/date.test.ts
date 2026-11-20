import { describe, expect, it } from "vitest";
import { calendarYear, formatDayMonth, formatLongDate } from "./date";

describe("dates", () => {
  it("are British by default: day, month in words, year", () => {
    expect(formatLongDate("2026-03-02")).toBe("2 March 2026");
    // The American order would be "March 2, 2026".
    expect(formatLongDate("2026-03-02")).not.toMatch(/^March/);
  });

  it("are German on a German post, and only there", () => {
    expect(formatLongDate("2026-03-02", true)).toBe("2. März 2026");
  });

  it("drop the year in an archive row, under its year heading", () => {
    expect(formatDayMonth("2026-03-02")).toBe("2 Mar");
  });

  it("show the day that was entered, whatever the build machine's time zone", () => {
    // A date-only value is UTC midnight, the previous evening west of UTC.
    const zone = process.env.TZ;
    process.env.TZ = "America/Los_Angeles";
    try {
      expect(new Date("2026-03-02").getDate()).toBe(1);
      expect(formatLongDate("2026-03-02")).toBe("2 March 2026");
      expect(formatDayMonth("2026-03-02T00:00:00.000Z")).toBe("2 Mar");
    } finally {
      process.env.TZ = zone;
    }
  });

  it("show the day picked in Contentful, not the day in UTC", () => {
    // Just after midnight in Berlin is still the previous day in UTC.
    expect(formatLongDate("2026-11-18T00:30+01:00")).toBe("18 November 2026");
    expect(formatLongDate("2026-11-18T00:30+01:00", true)).toBe(
      "18. November 2026",
    );
    expect(formatDayMonth("2026-07-01T01:30+02:00")).toBe("1 Jul");
    expect(calendarYear("2027-01-01T00:30+01:00")).toBe(2027);
  });

  it("leave an evening post on its own day", () => {
    expect(formatLongDate("2026-11-18T22:00+01:00")).toBe("18 November 2026");
    expect(calendarYear("2026-12-31T23:30+01:00")).toBe(2026);
  });
});
