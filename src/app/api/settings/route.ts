import { NextRequest } from "next/server";
import { getSetting, saveSetting } from "@/lib/db";

const ALLOWED_KEYS = ["ics_url", "proactive_per_day"];

export async function GET() {
  const [icsUrl, perDay] = await Promise.all([
    getSetting("ics_url"),
    getSetting("proactive_per_day"),
  ]);
  return Response.json({
    ics_url: icsUrl ?? "",
    proactive_per_day: perDay ?? "",
  });
}

export async function PUT(request: NextRequest) {
  const body = await request.json();
  for (const key of ALLOWED_KEYS) {
    if (typeof body[key] === "string") {
      if (body[key].length > 1000) {
        return Response.json({ error: "value too long" }, { status: 400 });
      }
      await saveSetting(key, body[key].trim());
    }
  }
  return Response.json({ ok: true });
}
