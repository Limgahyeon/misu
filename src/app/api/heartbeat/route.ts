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

  // ?proactive=0 이면 리마인더만 (외부 스케줄러가 자주 칠 때)
  const wantProactive = request.nextUrl.searchParams.get("proactive") !== "0";
  const result = await runHeartbeat(wantProactive);
  return Response.json({ ok: true, ...result });
}
