import { describe, expect, it } from "vitest";
import { sayDateValue, spokenDateValue } from "./dates";

const NOW = new Date(2026, 9, 25, 10, 0); // Sunday, October 25 2026
const date = (s: string) => spokenDateValue(s, "date", NOW);

describe("spokenDateValue", () => {
  it("reads month and day, in either order, with or without a year", () => {
    expect(date("November 3")).toBe("2026-11-03");
    expect(date("Nov 3rd, 2027")).toBe("2027-11-03");
    expect(date("the third of November")).toBe("2026-11-03");
    expect(date("November twenty third")).toBe("2026-11-23");
    expect(date("3 December")).toBe("2026-12-03");
    expect(date("11/3")).toBe("2026-11-03");
    expect(date("2026-11-03")).toBe("2026-11-03");
  });

  it("puts a date without a year in the future", () => {
    expect(date("March 1")).toBe("2027-03-01");
    expect(date("October 25")).toBe("2026-10-25"); // today
  });

  it("reads relative dates", () => {
    expect(date("today")).toBe("2026-10-25");
    expect(date("tomorrow")).toBe("2026-10-26");
    expect(date("Friday")).toBe("2026-10-30");
    expect(date("next Friday")).toBe("2026-10-30");
    expect(date("Sunday")).toBe("2026-11-01"); // the coming one, not today
    expect(date("in two weeks")).toBe("2026-11-08");
    expect(date("in 3 days")).toBe("2026-10-28");
  });

  it("adds a time for date and time fields", () => {
    expect(spokenDateValue("November 3 at 2 pm", "datetime-local", NOW)).toBe("2026-11-03T14:00");
    expect(spokenDateValue("tomorrow at 10:30 a.m.", "datetime-local", NOW)).toBe("2026-10-26T10:30");
    expect(spokenDateValue("Friday at 2", "datetime-local", NOW)).toBe("2026-10-30T14:00"); // afternoon
    expect(spokenDateValue("November 3", "datetime-local", NOW)).toBe("2026-11-03T09:00");
    expect(spokenDateValue("at noon", "time", NOW)).toBe("12:00");
  });

  it("rejects what is not a date", () => {
    expect(date("called the recruiter")).toBeNull();
    expect(date("November 31")).toBeNull();
    expect(date("soon")).toBeNull();
  });
});

describe("sayDateValue", () => {
  it("reads a value back in words", () => {
    expect(sayDateValue("2026-11-03")).toMatch(/Tuesday.*November.*3/);
    expect(sayDateValue("2026-11-03T14:00")).toMatch(/November.*3.*2:00/);
  });
});
