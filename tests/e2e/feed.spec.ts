import { test, expect, APIRequestContext } from "@playwright/test";

// Spec success checks 1-5 and 7, run against the DEPLOYED baseURL.
// All expected dates hand-recomputed from the cycle definitions:
//   4on4off  = [4,4]           len 8,  ON idx 0-3
//   custom 3,2,2,3             len 10, ON idx 0-2 and 5-6
//   223/pitman = [2,2,3,2,2,3] len 14, ON idx 0-1, 4-6, 9-10
// Anchor 2026-06-01 is day 0.

async function fetchFeed(request: APIRequestContext, qs: string) {
  const resp = await request.get(`/api/feed?${qs}`);
  return resp;
}

test("check 1: 4on4off basic feed — headers, envelope, ON/OFF days", async ({
  request,
}) => {
  const resp = await fetchFeed(
    request,
    "pattern=4on4off&anchor=2026-06-01&start=07:00&end=19:00"
  );
  expect(resp.status()).toBe(200);
  expect(resp.headers()["content-type"]).toContain("text/calendar");
  const body = await resp.text();
  expect(body.startsWith("BEGIN:VCALENDAR")).toBe(true);
  expect(body.trimEnd().endsWith("END:VCALENDAR")).toBe(true);
  // day 11 (2026-06-12), 11 mod 8 = 3 -> ON
  expect(body).toContain("DTSTART:20260612T070000");
  expect(body).toContain("DTEND:20260612T190000");
  // day 12 (2026-06-13), 12 mod 8 = 4 -> OFF
  expect(body).not.toContain("DTSTART:20260613");
});

test("check 2: rolling ~2-year horizon includes 2027-06-04", async ({
  request,
}) => {
  const resp = await fetchFeed(
    request,
    "pattern=4on4off&anchor=2026-06-01&start=07:00&end=19:00"
  );
  expect(resp.status()).toBe(200);
  const body = await resp.text();
  // 2027-06-04 = day 368 (365 days 2026-06-01..2027-06-01, no leap Feb, +3),
  // 368 mod 8 = 0 -> ON
  expect(body).toContain("DTSTART:20270604T070000");
});

test("check 3: custom 3,2,2,3 overnight feed", async ({ request }) => {
  const resp = await fetchFeed(
    request,
    "pattern=custom&cycle=3,2,2,3&anchor=2026-06-01&start=19:00&end=07:00&label=Night"
  );
  expect(resp.status()).toBe(200);
  const body = await resp.text();
  expect(body).toContain("SUMMARY:Night");
  // day 11 mod 10 = 1 -> ON; overnight DTEND next day
  expect(body).toContain("DTSTART:20260612T190000");
  expect(body).toContain("DTEND:20260613T070000");
  // day 12 mod 10 = 2 -> ON
  expect(body).toContain("DTSTART:20260613T190000");
  // day 13 mod 10 = 3 -> OFF
  expect(body).not.toContain("DTSTART:20260614");
});

test("check 4: 223 preset; pitman alias byte-identical", async ({
  request,
}) => {
  const qs = "anchor=2026-06-01&start=07:00&end=19:00";
  const r223 = await fetchFeed(request, `pattern=223&${qs}`);
  expect(r223.status()).toBe(200);
  const b223 = await r223.text();
  // day 4 (2026-06-05) of [2,2,3,...] -> third segment? idx 4: 2 ON, 2 OFF, then ON idx 4-6 -> ON
  expect(b223).toContain("DTSTART:20260605T070000");
  // day 2 (2026-06-03): idx 2 in OFF segment (2-3) -> OFF
  expect(b223).not.toContain("DTSTART:20260603");

  const rPit = await fetchFeed(request, `pattern=pitman&${qs}`);
  expect(rPit.status()).toBe(200);
  const bPit = await rPit.text();
  expect(bPit).toBe(b223); // byte-identical events
});

test("check 5: every VEVENT has UID/DTSTART/DTEND, UIDs unique, deterministic across fetches", async ({
  request,
}) => {
  const queries = [
    "pattern=4on4off&anchor=2026-06-01&start=07:00&end=19:00",
    "pattern=custom&cycle=3,2,2,3&anchor=2026-06-01&start=19:00&end=07:00&label=Night",
    "pattern=223&anchor=2026-06-01&start=07:00&end=19:00",
  ];
  for (const qs of queries) {
    const body = await (await fetchFeed(request, qs)).text();
    // unfold folded lines before parsing (RFC 5545 continuation = leading space)
    const unfolded = body.replace(/\r\n[ \t]/g, "");
    const lines = unfolded.split(/\r\n/);
    const events: string[][] = [];
    let cur: string[] | null = null;
    for (const l of lines) {
      if (l === "BEGIN:VEVENT") cur = [];
      else if (l === "END:VEVENT") {
        if (cur) events.push(cur);
        cur = null;
      } else if (cur) cur.push(l);
    }
    expect(events.length).toBeGreaterThan(100);
    const uids: string[] = [];
    for (const ev of events) {
      const uid = ev.find((l) => l.startsWith("UID:"));
      expect(uid, `VEVENT missing UID in ${qs}`).toBeTruthy();
      expect(
        ev.some((l) => l.startsWith("DTSTART:")),
        `VEVENT missing DTSTART in ${qs}`
      ).toBe(true);
      expect(
        ev.some((l) => l.startsWith("DTEND:")),
        `VEVENT missing DTEND in ${qs}`
      ).toBe(true);
      uids.push(uid!);
    }
    expect(new Set(uids).size).toBe(uids.length);

    // deterministic: a second fetch yields the same set of events
    const body2 = await (await fetchFeed(request, qs)).text();
    expect(body2).toBe(body);
  }
});

test("check 7: missing/invalid params -> 400 plain text naming the parameter, never 500", async ({
  request,
}) => {
  const missing = await fetchFeed(request, "pattern=custom&start=07:00&end=19:00");
  expect(missing.status()).toBe(400);
  expect(missing.headers()["content-type"]).toContain("text/plain");
  const missingBody = await missing.text();
  expect(missingBody).toMatch(/cycle|anchor/);

  const badCycle = await fetchFeed(
    request,
    "pattern=custom&cycle=abc&anchor=2026-06-01&start=07:00&end=19:00"
  );
  expect(badCycle.status()).toBe(400);
  expect(badCycle.headers()["content-type"]).toContain("text/plain");
  expect(await badCycle.text()).toMatch(/cycle/);
});
