import { NextRequest } from "next/server";
import { checkReminders, maybeProactive, syncCalendar } from "@/lib/proactive";

export const maxDuration = 60;

// 정기 실행 엔드포인트 — Vercel Cron(Authorization: Bearer CRON_SECRET)
// 또는 외부 스케줄러(?key=CRON_SECRET)가 호출한다.
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization");
  const key = request.nextUrl.searchParams.get("key");
  if (!secret || (auth !== `Bearer ${secret}` && key !== secret)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  await syncCalendar();
  const reminders = await checkReminders();
  // ?proactive=1 이면 선톡 시도까지 (외부 스케줄러가 자주 칠 때는 리마인더만)
  const wantProactive =
    request.nextUrl.searchParams.get("proactive") !== "0";
  const sentProactive = wantProactive ? await maybeProactive() : false;

  return Response.json({ ok: true, reminders, proactive: sentProactive });
}
