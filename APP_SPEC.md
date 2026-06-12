# Shiftfeed

Purpose: gives rotating-shift workers (nurses, EMTs, firefighters, plant operators) a
subscribable calendar feed URL for their shift rotation — pick a pattern, anchor date, and
shift times once, then subscribe from any device and share the same URL with family.

Problem: A nurse, EMT, or plant operator on a rotating pattern that defeats normal calendar
recurrence rules consults it daily and re-shares it with family every schedule change
(re-anchor a few times a year); today they hand-enter weeks of shifts or download a static
.ics file.

Beats alternative: rotaics.com, shiftscheduleup.com, ToolGrit, and wutools all generate
rotating-pattern .ics files free with no signup — but every one found emits a downloadable
file with a fixed horizon, not a subscribable feed; Google Calendar can't import an .ics
from its mobile app at all, the file must be re-exported when the horizon runs out, and the
spouse must repeat the import dance. Mobile shift apps (Supershift et al.) live on one
phone and emit no feed. Shiftfeed's differentiator IS the product: a stateless, subscribable
ICS feed URL (https + webcal) with all parameters encoded in the URL, computed forward over
a long rolling window — never a fixed-horizon file download.

## Core flows

1. **Build a feed URL** (single page at `/`): pick a preset pattern (4 on / 4 off, DuPont,
   Pitman / 2-2-3) or define a custom alternating on/off cycle (e.g. "3,2,2,3" = 3 on,
   2 off, 2 on, 3 off), set the anchor date (first ON day of the cycle), shift start and end
   times (end ≤ start means an overnight shift ending the next day), and an optional shift
   label. The page shows the resulting `https://…/api/feed?…` URL and its `webcal://`
   variant live as inputs change, with a copy button for each and short
   "Add to Google Calendar (From URL)" / "Add to Apple Calendar" instructions. No accounts,
   nothing stored server-side.

2. **Subscribe to the stateless ICS feed** (`GET /api/feed`): the route handler computes
   every shift from the URL parameters alone — no database — and returns a valid ICS
   calendar covering a rolling window from 30 days before the request date to 2 years
   after it, so the subscription never "runs out" the way a downloaded file does. One
   VEVENT per ON day, floating local times (no TZID), deterministic UIDs, SUMMARY = label
   (default "Shift"). Query parameters:
   - `pattern`: `4on4off` (cycle 4,4) | `dupont` (cycle 4,3,3,1,3,3,4,7) | `pitman` or
     `223` (aliases, cycle 2,2,3,2,2,3) | `custom`
   - `cycle`: comma-separated alternating on,off day counts starting with ON days
     (required iff `pattern=custom`)
   - `anchor`: `YYYY-MM-DD`, day 0 of the cycle (an ON day)
   - `start`, `end`: `HH:MM`; if `end` ≤ `start` the shift crosses midnight and DTEND falls
     on the next calendar day
   - `label`: optional event title

3. **Custom cycles and overnight shifts done right**: a custom cycle like `3,2,2,3` and an
   overnight 19:00–07:00 shift produce events whose DTEND is on the day after DTSTART, with
   ON/OFF days exactly matching the cycle arithmetic from the anchor — this is the case the
   free file generators make painful to re-share.

## Success checks

All dates below are hand-computed from the anchors; a stranger can verify each with curl in
seconds.

1. `GET /api/feed?pattern=4on4off&anchor=2026-06-01&start=07:00&end=19:00` returns HTTP 200
   with `Content-Type: text/calendar`; the body starts with `BEGIN:VCALENDAR`, ends with
   `END:VCALENDAR`, contains a VEVENT with `DTSTART:20260612T070000` and
   `DTEND:20260612T190000` (June 12 is cycle day 11, 11 mod 8 = 3 → ON), and contains NO
   `DTSTART:20260613` event (12 mod 8 = 4 → OFF). Pattern for June 2026: ON 1–4, OFF 5–8,
   ON 9–12, OFF 13–16.
2. The same response proves the rolling horizon: it contains an event with
   `DTSTART:20270604T070000` (2027-06-04 is cycle day 368, 368 mod 8 = 0 → ON) — i.e. the
   feed extends about two years out, not a fixed exported range.
3. `GET /api/feed?pattern=custom&cycle=3,2,2,3&anchor=2026-06-01&start=19:00&end=07:00&label=Night`
   contains a VEVENT with `SUMMARY:Night`, `DTSTART:20260612T190000`, and
   `DTEND:20260613T070000` (overnight: DTEND is the next day; day 11 mod 10 = 1 → ON);
   contains an event with `DTSTART:20260613T190000` (12 mod 10 = 2 → ON); and contains NO
   event with `DTSTART:20260614…` (13 mod 10 = 3 → OFF).
4. `GET /api/feed?pattern=223&anchor=2026-06-01&start=07:00&end=19:00` contains an event
   with `DTSTART:20260605T070000` (day 4 of the 2,2,3,2,2,3 cycle → ON) and NO
   `DTSTART:20260603` event (day 2 → OFF). `pattern=pitman` returns byte-identical events.
5. Every VEVENT in the responses above has UID, DTSTART, and DTEND lines, and UIDs are
   unique within the feed; the same URL fetched twice yields the same set of events for
   the overlapping window (deterministic, stateless).
6. On `/`, selecting preset "4 on / 4 off", anchor 2026-06-01, start 07:00, end 19:00
   displays exactly the feed URL from check 1 (host-relative path and query identical) plus
   a `webcal://` variant of the same URL; clicking Copy puts the https URL on the
   clipboard; the URL text updates immediately when the anchor date is changed.
7. `GET /api/feed?pattern=custom&start=07:00&end=19:00` (missing `cycle` and `anchor`) and
   `GET /api/feed?pattern=custom&cycle=abc&anchor=2026-06-01&start=07:00&end=19:00` both
   return HTTP 400 with a plain-text message naming the bad/missing parameter — never a 500.

## Out of scope

- Visual schedule planner / month-grid preview UI (shiftscheduleup.com owns that for free;
  the feed is the entire wedge — at most the builder may show the next handful of computed
  ON days as a sanity strip).
- .ics file download as a primary flow, accounts, saved schedules, or any database.
- Day/night alternation within a cycle (DuPont is simplified to its on/off sequence; shift
  times are uniform per feed — make two feeds for two shift types).
- Multi-person/crew offsets, shift-trade exceptions, holidays, or editing individual shifts.
- Timezone conversion (floating local times by design — a 07:00 shift reads 07:00 wherever
  subscribed).
- Pay-period, overtime, or pay annotations.

Production URL: <filled in by deployer>
