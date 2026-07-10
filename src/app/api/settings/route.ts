import { NextRequest } from "next/server";
import { getUserIdFromRequest } from "@/lib/auth";
import { fetchIcsEvents } from "@/lib/calendar";
import { getSetting, getUpcomingAppointments, saveSetting } from "@/lib/db";
import { syncCalendarForUser } from "@/lib/proactive";

const ALLOWED_KEYS = [
  "ics_url",
  "proactive_per_day",
  "user_name",
  "proactive_partner",
  "morning_time",
];

export async function GET(request: NextRequest) {
  const userId = await getUserIdFromRequest(request);
  if (!userId) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const [icsUrl, perDay, userName, partner, morning] = await Promise.all([
    getSetting(userId, "ics_url"),
    getSetting(userId, "proactive_per_day"),
    getSetting(userId, "user_name"),
    getSetting(userId, "proactive_partner"),
    getSetting(userId, "morning_time"),
  ]);
  return Response.json({
    ics_url: icsUrl ?? "",
    proactive_per_day: perDay ?? "",
    user_name: userName ?? "",
    proactive_partner: partner ?? "",
    morning_time: morning ?? "",
  });
}

// 저장 전에 ICS 주소가 실제로 동작하는지 확인한다.
// 흔한 실수: 공개용 주소(/public/)를 붙여넣는 경우 — 캘린더가 비공개면 404가 난다.
async function validateIcsUrl(url: string): Promise<string | undefined> {
  if (url.includes("/public/")) {
    return "이건 공개용 주소예요. 구글 캘린더 설정 맨 아래 'iCal 형식의 비밀 주소'(…/private-…/basic.ics)를 복사해주세요.";
  }
  try {
    await fetchIcsEvents(url);
    return undefined;
  } catch {
    return "캘린더 주소에 접속할 수 없어요. 'iCal 형식의 비밀 주소'가 맞는지 확인해주세요.";
  }
}

export async function PUT(request: NextRequest) {
  const userId = await getUserIdFromRequest(request);
  if (!userId) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const body = await request.json();
  for (const key of ALLOWED_KEYS) {
    if (typeof body[key] === "string" && body[key].length > 1000) {
      return Response.json({ error: "value too long" }, { status: 400 });
    }
  }

  const icsUrl =
    typeof body.ics_url === "string" ? body.ics_url.trim() : undefined;
  if (icsUrl) {
    const problem = await validateIcsUrl(icsUrl);
    if (problem) {
      return Response.json({ error: problem, field: "ics_url" }, { status: 400 });
    }
  }

  for (const key of ALLOWED_KEYS) {
    if (typeof body[key] === "string") {
      await saveSetting(userId, key, body[key].trim());
    }
  }

  // 주소가 저장됐으면 하트비트를 기다리지 않고 바로 동기화해서 결과를 알려준다
  if (icsUrl) {
    await syncCalendarForUser(userId, undefined, true);
    const upcoming = await getUpcomingAppointments(userId, 7 * 24);
    return Response.json({ ok: true, ics_synced: upcoming.length });
  }
  return Response.json({ ok: true });
}
