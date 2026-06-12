import { buildICS, parseFeedParams, utcToYMD } from "@/lib/shifts";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);

  const parsed = parseFeedParams(searchParams);
  if (!parsed.ok) {
    return new Response(parsed.error + "\n", {
      status: 400,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  const today = utcToYMD(Date.now());
  const ics = buildICS(parsed.config, today);

  return new Response(ics, {
    status: 200,
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'inline; filename="shiftfeed.ics"',
      "Cache-Control": "public, max-age=3600",
    },
  });
}
