# Shiftfeed

Turn your rotating shift pattern into a calendar link your whole family can subscribe to
once — it updates itself and never runs out.

Pick a pattern (4 on / 4 off, DuPont, Pitman 2-2-3, or a custom on/off cycle), set the
first ON day and shift times, and copy a stateless ICS feed URL. Every shift is computed
from the URL parameters alone over a rolling window (30 days back, 2 years forward) — no
account, no database, nothing stored.

## Feed API

`GET /api/feed?pattern=4on4off&anchor=2026-06-01&start=07:00&end=19:00[&label=Day shift]`

- `pattern`: `4on4off` | `dupont` | `pitman` | `223` | `custom`
- `cycle`: comma-separated alternating on,off day counts starting with ON
  (required iff `pattern=custom`, e.g. `3,2,2,3`)
- `anchor`: `YYYY-MM-DD`, day 0 of the cycle (an ON day)
- `start`, `end`: `HH:MM`; `end` ≤ `start` means an overnight shift ending the next day
- `label`: optional event title (default "Shift")

Returns `text/calendar` with floating local times and deterministic UIDs; invalid params
get a plain-text 400 naming the parameter.

## Develop

```bash
npm run dev        # builder UI at /
npm test           # unit tests for the shift/ICS math (lib/shifts.ts)
npm run build
BASE_URL=http://localhost:3000 npm run test:e2e
```

See `APP_SPEC.md` for the spec and `UX_BRIEF.md` for the UI brief.
