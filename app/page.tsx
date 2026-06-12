"use client";

import { useRef, useState, useSyncExternalStore } from "react";
import {
  PRESETS,
  isOnDate,
  isOvernight,
  parseCycle,
  parseHM,
  parseYMD,
  type YMD,
} from "@/lib/shifts";

const PATTERN_CHIPS = [
  { id: "4on4off", title: "4 on / 4 off" },
  { id: "dupont", title: "DuPont" },
  { id: "pitman", title: "Pitman 2-2-3" },
  { id: "custom", title: "Custom" },
] as const;

type PatternId = (typeof PATTERN_CHIPS)[number]["id"];

const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

const noopSubscribe = () => () => {};

function localTodayStr(): string {
  const now = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
}

function mostRecentMonday(todayStr: string): string {
  const t = parseYMD(todayStr);
  if (!t) return todayStr;
  const d = new Date(Date.UTC(t.y, t.m - 1, t.d));
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}`;
}

function addDays(d: YMD, n: number): YMD {
  const t = new Date(Date.UTC(d.y, d.m - 1, d.d + n));
  return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate() };
}

function dayOfWeek(d: YMD): string {
  return DOW[new Date(Date.UTC(d.y, d.m - 1, d.d)).getUTCDay()];
}

export default function Home() {
  // Hydration-safe browser values (empty on the server-rendered pass).
  const origin = useSyncExternalStore(
    noopSubscribe,
    () => window.location.origin,
    () => ""
  );
  const todayStr = useSyncExternalStore(noopSubscribe, localTodayStr, () => "");

  const [pattern, setPattern] = useState<PatternId>("4on4off");
  const [cycleText, setCycleText] = useState("3,2,2,3");
  const [anchorEdited, setAnchorEdited] = useState<string | null>(null);
  const [start, setStart] = useState("07:00");
  const [end, setEnd] = useState("19:00");
  const [label, setLabel] = useState("Shift");
  const [copied, setCopied] = useState<"https" | "webcal" | null>(null);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Everything below is derived during render — no effects, no submit button.
  const anchor = anchorEdited ?? (todayStr ? mostRecentMonday(todayStr) : "");
  const cycle =
    pattern === "custom" ? parseCycle(cycleText) : PRESETS[pattern];
  const anchorYMD = parseYMD(anchor);
  const startHM = parseHM(start);
  const endHM = parseHM(end);
  const overnight = startHM && endHM ? isOvernight(startHM, endHM) : false;

  let error: string | null = null;
  if (pattern === "custom" && !cycle) {
    error =
      "Cycle must be numbers separated by commas, starting with ON days — e.g. 3,2,2,3.";
  } else if (!anchorYMD) {
    error = "Pick the first day of an ON stretch — any recent one works.";
  } else if (!startHM || !endHM) {
    error = "Set a start and end time, like 07:00 and 19:00.";
  }

  const trimmedLabel = label.trim();
  const labelParam =
    trimmedLabel && trimmedLabel !== "Shift"
      ? `&label=${encodeURIComponent(trimmedLabel)}`
      : "";
  const cycleParam =
    pattern === "custom" && cycle ? `&cycle=${cycle.join(",")}` : "";
  const path = `/api/feed?pattern=${pattern}${cycleParam}&anchor=${anchor}&start=${start}&end=${end}${labelParam}`;
  const httpsUrl = `${origin}${path}`;
  const webcalUrl = origin
    ? `${origin.replace(/^https?:\/\//, "webcal://")}${path}`
    : `webcal://${path}`;

  const previewDays: { date: YMD; on: boolean }[] = [];
  if (!error && cycle && anchorYMD && todayStr) {
    const today = parseYMD(todayStr);
    if (today) {
      for (let i = 0; i < 14; i++) {
        const date = addDays(today, i);
        previewDays.push({ date, on: isOnDate(cycle, anchorYMD, date) });
      }
    }
  }

  function copy(kind: "https" | "webcal", text: string) {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(kind);
      if (copyTimer.current) clearTimeout(copyTimer.current);
      copyTimer.current = setTimeout(() => setCopied(null), 2000);
    });
  }

  const chipBase =
    "rounded-full border px-4 py-2.5 text-sm font-semibold transition-colors";

  return (
    <main className="mx-auto w-full max-w-xl px-4 py-8 sm:py-12">
      <header>
        <h1 className="text-2xl font-bold leading-tight text-slate-900 sm:text-3xl">
          Your rotating shift, as a calendar your family can subscribe to.
        </h1>
        <p className="mt-2 text-slate-600">
          Pick your pattern once. Everyone subscribes to one link — no
          re-imports when the schedule changes.
        </p>
      </header>

      <section className="mt-6 space-y-5">
        <div>
          <span className="block text-sm font-semibold text-slate-700">
            Pattern
          </span>
          <div className="mt-2 flex flex-wrap gap-2">
            {PATTERN_CHIPS.map((chip) => (
              <button
                key={chip.id}
                type="button"
                onClick={() => setPattern(chip.id)}
                aria-pressed={pattern === chip.id}
                className={`${chipBase} ${
                  pattern === chip.id
                    ? "border-blue-700 bg-blue-700 text-white"
                    : "border-slate-300 bg-white text-slate-700 hover:border-slate-400"
                }`}
              >
                {chip.title}
              </button>
            ))}
          </div>
          {pattern === "custom" && (
            <div className="mt-3">
              <label
                htmlFor="cycle"
                className="block text-sm font-semibold text-slate-700"
              >
                Custom cycle
              </label>
              <input
                id="cycle"
                type="text"
                inputMode="numeric"
                value={cycleText}
                onChange={(e) => setCycleText(e.target.value)}
                placeholder="3,2,2,3"
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-slate-900 focus:border-blue-600 focus:outline-none"
              />
              <p className="mt-1 text-sm text-slate-500">
                on,off days, starting with ON
              </p>
            </div>
          )}
        </div>

        <div>
          <label
            htmlFor="anchor"
            className="block text-sm font-semibold text-slate-700"
          >
            First day of an ON stretch
          </label>
          <input
            id="anchor"
            type="date"
            value={anchor}
            onChange={(e) => setAnchorEdited(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-slate-900 focus:border-blue-600 focus:outline-none"
          />
        </div>

        <div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label
                htmlFor="start"
                className="block text-sm font-semibold text-slate-700"
              >
                Start
              </label>
              <input
                id="start"
                type="time"
                value={start}
                onChange={(e) => setStart(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-slate-900 focus:border-blue-600 focus:outline-none"
              />
            </div>
            <div>
              <label
                htmlFor="end"
                className="block text-sm font-semibold text-slate-700"
              >
                End
              </label>
              <input
                id="end"
                type="time"
                value={end}
                onChange={(e) => setEnd(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-slate-900 focus:border-blue-600 focus:outline-none"
              />
            </div>
          </div>
          <p className="mt-1 text-sm text-slate-500">
            End before start = overnight shift
          </p>
        </div>

        <div>
          <label
            htmlFor="label"
            className="block text-sm font-semibold text-slate-700"
          >
            Shift name{" "}
            <span className="font-normal text-slate-500">(optional)</span>
          </label>
          <input
            id="label"
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Day shift"
            className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-slate-900 focus:border-blue-600 focus:outline-none"
          />
        </div>
      </section>

      <section className="mt-6">
        {error ? (
          <p
            role="alert"
            className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-slate-800"
          >
            {error}
          </p>
        ) : (
          <div className="space-y-3">
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-sm font-semibold text-slate-700">
                Your subscription link
              </p>
              <p
                data-testid="feed-url"
                className="mt-1 break-all font-mono text-sm text-slate-900"
              >
                {httpsUrl}
              </p>
              <button
                type="button"
                onClick={() => copy("https", httpsUrl)}
                className="mt-3 w-full rounded-lg bg-amber-500 px-4 py-3 font-semibold text-slate-900 hover:bg-amber-400 sm:w-auto"
              >
                {copied === "https" ? "Copied" : "Copy link"}
              </button>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-sm font-semibold text-slate-700">
                webcal:// variant (Apple Calendar)
              </p>
              <p
                data-testid="webcal-url"
                className="mt-1 break-all font-mono text-sm text-slate-900"
              >
                {webcalUrl}
              </p>
              <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                <button
                  type="button"
                  onClick={() => copy("webcal", webcalUrl)}
                  className="rounded-lg bg-amber-500 px-4 py-3 font-semibold text-slate-900 hover:bg-amber-400"
                >
                  {copied === "webcal" ? "Copied" : "Copy webcal link"}
                </button>
                <a
                  href={webcalUrl}
                  className="rounded-lg border border-slate-300 bg-white px-4 py-3 text-center font-semibold text-slate-700 hover:border-slate-400"
                >
                  Open in Apple Calendar
                </a>
              </div>
            </div>
          </div>
        )}
      </section>

      {previewDays.length > 0 && (
        <section className="mt-8">
          <div className="flex gap-1.5 overflow-x-auto pb-2">
            {previewDays.map(({ date, on }) => (
              <div
                key={`${date.y}-${date.m}-${date.d}`}
                className={`flex min-w-[4.25rem] flex-col items-center rounded-lg border px-1.5 py-2 text-center ${
                  on
                    ? "border-amber-400 bg-amber-100"
                    : "border-slate-200 bg-slate-100 text-slate-400"
                }`}
              >
                <span className="text-xs font-semibold">
                  {dayOfWeek(date)}
                </span>
                <span className="text-sm font-bold">
                  {MONTHS[date.m - 1]} {date.d}
                </span>
                {on ? (
                  <span className="mt-1 text-[10px] font-semibold leading-tight text-slate-800">
                    {start}–{end}
                    {overnight && (
                      <span className="ml-0.5 rounded bg-amber-300 px-0.5">
                        +1d
                      </span>
                    )}
                  </span>
                ) : (
                  <span className="mt-1 text-[10px] leading-tight">off</span>
                )}
              </div>
            ))}
          </div>
          <p className="mt-1 text-sm text-slate-500">
            Next 14 days — check this matches your roster before you subscribe.
          </p>
        </section>
      )}

      <section className="mt-10 space-y-5">
        <div>
          <h2 className="font-bold text-slate-900">Google Calendar</h2>
          <ol className="mt-1 list-decimal space-y-1 pl-5 text-sm text-slate-600">
            <li>
              On a computer, open Google Calendar and find{" "}
              <span className="font-semibold">Other calendars</span>{" "}
              in the left sidebar.
            </li>
            <li>
              Click <span className="font-semibold">+</span> →{" "}
              <span className="font-semibold">From URL</span>{" "}
              → paste the link (the phone app can&apos;t add URLs).
            </li>
          </ol>
        </div>
        <div>
          <h2 className="font-bold text-slate-900">Apple Calendar</h2>
          <ol className="mt-1 list-decimal space-y-1 pl-5 text-sm text-slate-600">
            <li>
              Tap <span className="font-semibold">Open in Apple Calendar</span>{" "}
              above, or
            </li>
            <li>
              Settings → Calendar → Accounts →{" "}
              <span className="font-semibold">Add Subscribed Calendar</span>{" "}
              and paste the link.
            </li>
          </ol>
        </div>
      </section>

      <footer className="mt-10 border-t border-slate-200 pt-4 text-sm text-slate-500">
        No account. Nothing stored. The link itself is your schedule — share it
        with anyone.
      </footer>
    </main>
  );
}
