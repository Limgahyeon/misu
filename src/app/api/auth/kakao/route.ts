// 카카오 로그인 시작점 — 카카오 인가 페이지로 보낸다.
// CSRF 방지용 state를 쿠키에 심어두고 콜백에서 대조한다.

import { NextRequest, NextResponse } from "next/server";
import { KAKAO_STATE_COOKIE } from "@/lib/kakao";

export async function GET(request: NextRequest) {
  const clientId = process.env.KAKAO_REST_API_KEY;
  if (!clientId) {
    return NextResponse.redirect(new URL("/login?error=kakao", request.url));
  }

  const state = crypto.randomUUID();
  const redirectUri = new URL("/api/auth/kakao/callback", request.url).toString();

  const authorize = new URL("https://kauth.kakao.com/oauth/authorize");
  authorize.searchParams.set("client_id", clientId);
  authorize.searchParams.set("redirect_uri", redirectUri);
  authorize.searchParams.set("response_type", "code");
  authorize.searchParams.set("state", state);

  const response = NextResponse.redirect(authorize);
  response.cookies.set(KAKAO_STATE_COOKIE, state, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: 60 * 10,
    path: "/",
  });
  return response;
}
