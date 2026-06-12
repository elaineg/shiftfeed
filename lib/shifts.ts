// Pure shift-rotation math + ICS generation, shared by /api/feed and the builder page.
// All date arithmetic is done on UTC timestamps of calendar dates so results are
// independent of the server/browser timezone; output times are floating local.

export const PRESETS: Record<string, number[]> = {
  "4on4off": [4, 4],
  dupont: [4, 3, 3, 1, 3, 3, 4, 7],
  pitman: [2, 2, 3, 2, 2, 3],
  "223": [2, 2, 3, 2, 2, 3],
};

export interface YMD {
  y: number;
  m: number; // 1-12
  d: number; // 1-31
}

export interface HM {
  h: number;
  min: number;
}

const DAY_MS = 86400000;

export function parseYMD(s: string): YMD | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const t = Date.UTC(y, mo - 1, d);
  const dt = new Date(t);
  if (
    dt.getUTCFullYear() !== y ||
    dt.getUTCMonth() !== mo - 1 ||
    dt.getUTCDate() !== d
  ) {
    return null; // e.g. 2026-02-30
  }
  return { y, m: mo, d };
}

export function parseHM(s: string): HM | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(s);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return { h, min };
}

/** Comma-separated alternating on,off day counts, starting with ON. */
export function parseCycle(s: string): number[] | null {
  const parts = s.split(",").map((p) => p.trim());
  if (parts.length === 0) return null;
  const nums: number[] = [];
  for (const p of parts) {
    if (!/^\d+$/.test(p)) return null;
    const n = Number(p);
    if (n < 1 || n > 365) return null;
    nums.push(n);
  }
  if (nums.length < 1) return null;
  const total = nums.reduce((a, b) => a + b, 0);
  if (total > 3650) return null;
  return nums;
}

export function ymdToUTC(d: YMD): number {
  return Date.UTC(d.y, d.m - 1, d.d);
}

export function utcToYMD(t: number): YMD {
  const dt = new Date(t);
  return { y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate() };
}

/** Day index relative to the anchor (day 0), may be negative. */
export function dayIndex(anchor: YMD, date: YMD): number {
  return Math.round((ymdToUTC(date) - ymdToUTC(anchor)) / DAY_MS);
}

/** Is the given cycle-day-index an ON day? Segments alternate ON/OFF, starting ON. */
export function isOnDay(cycle: number[], index: number): boolean {
  const len = cycle.reduce((a, b) => a + b, 0);
  let pos = index % len;
  if (pos < 0) pos += len;
  let acc = 0;
  for (let i = 0; i < cycle.length; i++) {
    acc += cycle[i];
    if (pos < acc) return i % 2 === 0;
  }
  return false; // unreachable
}

export function isOnDate(cycle: number[], anchor: YMD, date: YMD): boolean {
  return isOnDay(cycle, dayIndex(anchor, date));
}

const pad2 = (n: number) => String(n).padStart(2, "0");

export function ymdCompact(d: YMD): string {
  return `${d.y}${pad2(d.m)}${pad2(d.d)}`;
}

export function ymdDashed(d: YMD): string {
  return `${d.y}-${pad2(d.m)}-${pad2(d.d)}`;
}

export function hmCompact(t: HM): string {
  return `${pad2(t.h)}${pad2(t.min)}00`;
}

export function hmColon(t: HM): string {
  return `${pad2(t.h)}:${pad2(t.min)}`;
}

export interface FeedConfig {
  cycle: number[];
  anchor: YMD;
  start: HM;
  end: HM;
  label: string;
}

export function isOvernight(start: HM, end: HM): boolean {
  return end.h * 60 + end.min <= start.h * 60 + start.min;
}

export interface ShiftEvent {
  /** ON day, local calendar date */
  date: YMD;
  /** DTEND calendar date (next day for overnight shifts) */
  endDate: YMD;
}

/** Every ON day in [windowStart, windowEnd] inclusive. */
export function shiftsInWindow(
  cycle: number[],
  anchor: YMD,
  windowStart: YMD,
  windowEnd: YMD,
  overnight: boolean
): ShiftEvent[] {
  const out: ShiftEvent[] = [];
  const startT = ymdToUTC(windowStart);
  const endT = ymdToUTC(windowEnd);
  for (let t = startT; t <= endT; t += DAY_MS) {
    const date = utcToYMD(t);
    if (isOnDate(cycle, anchor, date)) {
      out.push({ date, endDate: overnight ? utcToYMD(t + DAY_MS) : date });
    }
  }
  return out;
}

function escapeICSText(s: string): string {
  return s
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

/** RFC 5545 line folding at 74 octets (approximated by chars; labels are short). */
function foldLine(line: string): string[] {
  if (line.length <= 74) return [line];
  const out: string[] = [line.slice(0, 74)];
  let rest = line.slice(74);
  while (rest.length > 73) {
    out.push(" " + rest.slice(0, 73));
    rest = rest.slice(73);
  }
  out.push(" " + rest);
  return out;
}

/** Small deterministic hash so UIDs differ between feeds but not between fetches. */
function djb2(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  }
  return h.toString(36);
}

export function buildICS(config: FeedConfig, today: YMD): string {
  const { cycle, anchor, start, end } = config;
  const label = config.label || "Shift";
  const overnight = isOvernight(start, end);

  const todayT = ymdToUTC(today);
  const windowStart = utcToYMD(todayT - 30 * DAY_MS);
  const windowEnd = utcToYMD(
    Date.UTC(today.y + 2, today.m - 1, today.d)
  );

  const events = shiftsInWindow(
    cycle,
    anchor,
    windowStart,
    windowEnd,
    overnight
  );

  const feedHash = djb2(
    [cycle.join(","), ymdDashed(anchor), hmColon(start), hmColon(end), label].join("|")
  );

  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//shiftfeed//shiftfeed 1.0//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeICSText(label)}`,
  ];

  for (const ev of events) {
    const d = ymdCompact(ev.date);
    lines.push(
      "BEGIN:VEVENT",
      `UID:sf-${feedHash}-${d}@shiftfeed`,
      `DTSTAMP:${d}T000000Z`,
      `DTSTART:${d}T${hmCompact(start)}`,
      `DTEND:${ymdCompact(ev.endDate)}T${hmCompact(end)}`,
      `SUMMARY:${escapeICSText(label)}`,
      "END:VEVENT"
    );
  }

  lines.push("END:VCALENDAR");
  return lines.flatMap(foldLine).join("\r\n") + "\r\n";
}

export type ParseResult =
  | { ok: true; config: FeedConfig }
  | { ok: false; error: string };

/** Validate query params into a FeedConfig. Errors name the bad parameter. */
export function parseFeedParams(params: URLSearchParams): ParseResult {
  const pattern = params.get("pattern");
  if (!pattern) {
    return { ok: false, error: "Missing required parameter: pattern (4on4off, dupont, pitman, 223, or custom)" };
  }

  let cycle: number[];
  if (pattern === "custom") {
    const cycleStr = params.get("cycle");
    if (!cycleStr) {
      return { ok: false, error: "Missing required parameter: cycle (required when pattern=custom, e.g. cycle=3,2,2,3)" };
    }
    const parsed = parseCycle(cycleStr);
    if (!parsed) {
      return { ok: false, error: "Invalid parameter: cycle must be comma-separated whole-day counts starting with ON days, e.g. 3,2,2,3" };
    }
    cycle = parsed;
  } else {
    const preset = PRESETS[pattern];
    if (!preset) {
      return { ok: false, error: `Invalid parameter: pattern '${pattern}' is not one of 4on4off, dupont, pitman, 223, custom` };
    }
    cycle = preset;
  }

  const anchorStr = params.get("anchor");
  if (!anchorStr) {
    return { ok: false, error: "Missing required parameter: anchor (YYYY-MM-DD, the first day of an ON stretch)" };
  }
  const anchor = parseYMD(anchorStr);
  if (!anchor) {
    return { ok: false, error: "Invalid parameter: anchor must be a real date in YYYY-MM-DD format" };
  }

  const startStr = params.get("start");
  if (!startStr) {
    return { ok: false, error: "Missing required parameter: start (HH:MM)" };
  }
  const start = parseHM(startStr);
  if (!start) {
    return { ok: false, error: "Invalid parameter: start must be a time in HH:MM format" };
  }

  const endStr = params.get("end");
  if (!endStr) {
    return { ok: false, error: "Missing required parameter: end (HH:MM)" };
  }
  const end = parseHM(endStr);
  if (!end) {
    return { ok: false, error: "Invalid parameter: end must be a time in HH:MM format" };
  }

  const label = (params.get("label") || "").trim();

  return { ok: true, config: { cycle, anchor, start, end, label } };
}
