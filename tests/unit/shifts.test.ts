import { describe, it, expect } from "vitest";
import {
  PRESETS,
  buildICS,
  isOnDate,
  parseCycle,
  parseFeedParams,
  parseYMD,
} from "@/lib/shifts";

const ymd = (s: string) => {
  const v = parseYMD(s);
  if (!v) throw new Error(`bad date ${s}`);
  return v;
};

describe("cycle arithmetic (spec hand-computed examples)", () => {
  it("4on4off anchored 2026-06-01: June 12 ON (day 11, mod 8 = 3), June 13 OFF", () => {
    const cycle = PRESETS["4on4off"];
    const anchor = ymd("2026-06-01");
    expect(isOnDate(cycle, anchor, ymd("2026-06-12"))).toBe(true);
    expect(isOnDate(cycle, anchor, ymd("2026-06-13"))).toBe(false);
    // June 2026: ON 1-4, OFF 5-8, ON 9-12, OFF 13-16
    for (const d of [1, 2, 3, 4, 9, 10, 11, 12])
      expect(isOnDate(cycle, anchor, ymd(`2026-06-${String(d).padStart(2, "0")}`))).toBe(true);
    for (const d of [5, 6, 7, 8, 13, 14, 15, 16])
      expect(isOnDate(cycle, anchor, ymd(`2026-06-${String(d).padStart(2, "0")}`))).toBe(false);
    // 2027-06-04 is cycle day 368, 368 mod 8 = 0 -> ON
    expect(isOnDate(cycle, anchor, ymd("2027-06-04"))).toBe(true);
  });

  it("custom 3,2,2,3: day 11 ON, day 12 ON, day 13 OFF", () => {
    const cycle = parseCycle("3,2,2,3")!;
    const anchor = ymd("2026-06-01");
    expect(isOnDate(cycle, anchor, ymd("2026-06-12"))).toBe(true);
    expect(isOnDate(cycle, anchor, ymd("2026-06-13"))).toBe(true);
    expect(isOnDate(cycle, anchor, ymd("2026-06-14"))).toBe(false);
  });

  it("223/pitman: day 4 ON, day 2 OFF; aliases identical", () => {
    const anchor = ymd("2026-06-01");
    expect(isOnDate(PRESETS["223"], anchor, ymd("2026-06-05"))).toBe(true);
    expect(isOnDate(PRESETS["223"], anchor, ymd("2026-06-03"))).toBe(false);
    expect(PRESETS["pitman"]).toEqual(PRESETS["223"]);
  });

  it("handles dates before the anchor (negative day index)", () => {
    const cycle = PRESETS["4on4off"];
    const anchor = ymd("2026-06-01");
    // 2026-05-31 is day -1, -1 mod 8 -> 7 -> OFF; 2026-05-28 is day -4 -> 4 -> OFF;
    // 2026-05-25 is day -7 -> 1 -> ON
    expect(isOnDate(cycle, anchor, ymd("2026-05-31"))).toBe(false);
    expect(isOnDate(cycle, anchor, ymd("2026-05-25"))).toBe(true);
  });
});

describe("ICS generation", () => {
  const today = ymd("2026-06-12");

  it("emits valid calendar with CRLF, rolling 2-year window, deterministic UIDs", () => {
    const ics = buildICS(
      {
        cycle: PRESETS["4on4off"],
        anchor: ymd("2026-06-01"),
        start: { h: 7, min: 0 },
        end: { h: 19, min: 0 },
        label: "",
      },
      today
    );
    expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
    expect(ics).toContain("VERSION:2.0");
    expect(ics).toContain("PRODID:");
    expect(ics).toContain("DTSTART:20260612T070000");
    expect(ics).toContain("DTEND:20260612T190000");
    expect(ics).not.toContain("DTSTART:20260613");
    expect(ics).toContain("DTSTART:20270604T070000"); // ~2 years out
    expect(ics).toContain("SUMMARY:Shift"); // default label

    const uids = ics
      .split("\r\n")
      .filter((l) => l.startsWith("UID:"));
    expect(uids.length).toBeGreaterThan(300);
    expect(new Set(uids).size).toBe(uids.length); // unique
    // deterministic: a second build is byte-identical
    const ics2 = buildICS(
      {
        cycle: PRESETS["4on4off"],
        anchor: ymd("2026-06-01"),
        start: { h: 7, min: 0 },
        end: { h: 19, min: 0 },
        label: "",
      },
      today
    );
    expect(ics2).toBe(ics);
  });

  it("overnight shift: DTEND on the next day", () => {
    const ics = buildICS(
      {
        cycle: parseCycle("3,2,2,3")!,
        anchor: ymd("2026-06-01"),
        start: { h: 19, min: 0 },
        end: { h: 7, min: 0 },
        label: "Night",
      },
      today
    );
    expect(ics).toContain("SUMMARY:Night");
    expect(ics).toContain("DTSTART:20260612T190000");
    expect(ics).toContain("DTEND:20260613T070000");
    expect(ics).toContain("DTSTART:20260613T190000");
    expect(ics).not.toContain("DTSTART:20260614");
  });
});

describe("parameter validation", () => {
  const p = (q: string) => parseFeedParams(new URLSearchParams(q));

  it("rejects missing cycle/anchor for custom, naming the parameter", () => {
    const r = p("pattern=custom&start=07:00&end=19:00");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/cycle/);
  });

  it("rejects non-numeric cycle", () => {
    const r = p("pattern=custom&cycle=abc&anchor=2026-06-01&start=07:00&end=19:00");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/cycle/);
  });

  it("rejects bad anchor/start/end/pattern", () => {
    expect(p("pattern=4on4off&anchor=2026-13-01&start=07:00&end=19:00").ok).toBe(false);
    expect(p("pattern=4on4off&anchor=2026-06-01&start=25:00&end=19:00").ok).toBe(false);
    expect(p("pattern=4on4off&anchor=2026-06-01&start=07:00&end=19:99").ok).toBe(false);
    expect(p("pattern=bogus&anchor=2026-06-01&start=07:00&end=19:00").ok).toBe(false);
    expect(p("anchor=2026-06-01&start=07:00&end=19:00").ok).toBe(false);
  });

  it("accepts every valid preset and custom", () => {
    for (const q of [
      "pattern=4on4off&anchor=2026-06-01&start=07:00&end=19:00",
      "pattern=dupont&anchor=2026-06-01&start=07:00&end=19:00",
      "pattern=pitman&anchor=2026-06-01&start=07:00&end=19:00",
      "pattern=223&anchor=2026-06-01&start=07:00&end=19:00",
      "pattern=custom&cycle=3,2,2,3&anchor=2026-06-01&start=19:00&end=07:00&label=Night",
    ]) {
      expect(p(q).ok).toBe(true);
    }
  });
});
