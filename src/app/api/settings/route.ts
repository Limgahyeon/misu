import { NextRequest } from "next/server";
import { getUserIdFromRequest } from "@/lib/auth";
import { getSetting, saveSetting } from "@/lib/db";

const ALLOWED_KEYS = [
  "ics_url",
  "proactive_per_day",
  "user_name",
  "proactive_partner",
];

export async function GET(request: NextRequest) {
  const userId = await getUserIdFromRequest(request);
  if (!userId) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const [icsUrl, perDay, userName, partner] = await Promise.all([
    getSetting(userId, "ics_url"),
    getSetting(userId, "proactive_per_day"),
    getSetting(userId, "user_name"),
    getSetting(userId, "proactive_partner"),
  ]);
  return Response.json({
    ics_url: icsUrl ?? "",
    proactive_per_day: perDay ?? "",
    user_name: userName ?? "",
    proactive_partner: partner ?? "",
  });
}

export async function PUT(request: NextRequest) {
  const userId = await getUserIdFromRequest(request);
  if (!userId) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const body = await request.json();
  for (const key of ALLOWED_KEYS) {
    if (typeof body[key] === "string") {
      if (body[key].length > 1000) {
        return Response.json({ error: "value too long" }, { status: 400 });
      }
      await saveSetting(userId, key, body[key].trim());
    }
  }
  return Response.json({ ok: true });
}
