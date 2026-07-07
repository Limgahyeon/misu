import { NextRequest } from "next/server";
import { runHeartbeat } from "@/lib/proactive";

export const maxDuration = 300;

// 정기 실행 엔드포인트 — Vercel Cron(Authorization: Bearer CRON_SECRET)
// 또는 외부 스케줄러(?key=CRON_SECRET)가 호출한다.
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization");
  const key = request.nextUrl.searchParams.get("key");
  if (!secret || (auth !== `Bearer ${secret}` && key !== secret)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  // ?proactive=0 이면 리마인더만
  const wantProactive = request.nextUrl.searchParams.get("proactive") !== "0";
  // Vercel Cron(하루 2회)이면 회당 확률을 높게, 외부 스케줄러(10분 주기)면
  // 낮게 잡아 선톡이 하루 목표 횟수에 맞게 분산되도록 한다
  const isVercelCron = (request.headers.get("user-agent") ?? "").includes(
    "vercel-cron"
  );
  const callsPerHour = isVercelCron ? 0.5 : 6;
  const result = await runHeartbeat(wantProactive, callsPerHour);
  return Response.json({ ok: true, ...result });
}
