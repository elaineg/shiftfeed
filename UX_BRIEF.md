# Shiftfeed — UX Brief

## 1. Problem statement
Turn your rotating shift pattern into a calendar link your whole family can subscribe to once — it updates itself and never runs out.

## 2. Primary user action
Build the feed: pick a pattern, set the first ON day and shift times, then copy the subscription link. The page loads PRE-FILLED (4 on / 4 off, anchor = most recent Monday, 07:00–19:00, label "Shift") so the feed URL and the two-week preview are already visible before the user touches anything — they edit the example, never start from blank.

## 3. Emotional tone
Dependable and no-nonsense, like a well-run station whiteboard. System/sans font, slightly bold headings; cool slate/blue palette with one warm accent on ON days and the copy buttons; generous touch spacing — single column, big tap targets, built for a phone in a break room.

## 4. Design decisions
1. **Everything updates live, nothing submits.** The https URL, the webcal URL, and the preview strip recompute on every input change. No "Generate" button anywhere — change the anchor date and watch June re-shade instantly. The validator will check spec success check 6 against this.
2. **Two-week sanity strip is the trust moment.** Below the form, a horizontal strip of the next 14 days: day-of-week + date in each cell, ON days filled with the accent color and showing the shift times (with a "+1d" tag when overnight), OFF days muted. Caption: "Next 14 days — check this matches your roster before you subscribe." This is a strip, not a month planner (out of scope).
3. **Copy confirms inline; errors say what to do.** Each Copy button flips to "Copied" for ~2s in place. Invalid custom cycle (e.g. letters, empty) keeps the last good URL hidden and replaces the URL box with one plain line: "Cycle must be numbers separated by commas, starting with ON days — e.g. 3,2,2,3." Missing anchor: "Pick the first day of an ON stretch — any recent one works." Never a blank or broken state.

## 5. 5-second check (above the fold on a 390px phone)
- Headline: "Your rotating shift, as a calendar your family can subscribe to."
- Subtitle: "Pick your pattern once. Everyone subscribes to one link — no re-imports when the schedule changes."
- Pattern picker: four preset chips (4 on / 4 off — selected, DuPont, Pitman 2-2-3, Custom); choosing Custom reveals one text input with placeholder "3,2,2,3" and helper "on,off days, starting with ON".
- Anchor date input labeled "First day of an ON stretch" (pre-filled), then Start / End time inputs side by side with helper "End before start = overnight shift", then optional "Shift name" (placeholder "Day shift").
- The live feed URL box with [Copy link] and [Open in Apple Calendar] (webcal) buttons sits directly under the form — visible without scrolling on desktop, one short scroll on mobile.

Below the fold, in order: the 14-day preview strip, then two compact numbered how-tos — "Google Calendar: on a computer, Other calendars → From URL → paste the link (the phone app can't add URLs)" and "Apple Calendar: tap Open in Apple Calendar, or Settings → Add Subscribed Calendar" — and a one-line footer: "No account. Nothing stored. The link itself is your schedule — share it with anyone."
