// 카카오 인가 콜백 — 토큰을 교환하고 카카오 고유 id로 유저를 찾는다.
// 기존 유저면 바로 로그인, 처음이면 '가입 대기' 쿠키를 심고 초대 코드 페이지로.

import { NextRequest, NextResponse } from "next/server";
import { signPayload, signUserCookie, USER_COOKIE } from "@/lib/auth";
import { findUserByProvider } from "@/lib/db";
import {
  KAKAO_PENDING_COOKIE,
  KAKAO_STATE_COOKIE,
  KakaoPending,
} from "@/lib/kakao";

function fail(request: NextRequest, reason: string) {
  console.error("[kakao] login failed:", reason);
  return NextResponse.redirect(new URL("/login?error=kakao", request.url));
}

export async function GET(request: NextRequest) {
  const clientId = process.env.KAKAO_REST_API_KEY;
  if (!clientId) return fail(request, "no api key");

  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  const savedState = request.cookies.get(KAKAO_STATE_COOKIE)?.value;
  if (!code || !state || !savedState || state !== savedState) {
    return fail(request, "state mismatch");
  }

  // 인가 코드 → 액세스 토큰
  const redirectUri = new URL("/api/auth/kakao/callback", request.url).toString();
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: clientId,
    redirect_uri: redirectUri,
    code,
  });
  const clientSecret = process.env.KAKAO_CLIENT_SECRET;
  if (clientSecret) body.set("client_secret", clientSecret);

  const tokenRes = await fetch("https://kauth.kakao.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!tokenRes.ok) return fail(request, `token ${tokenRes.status} ${await tokenRes.text()}`);
  const { access_token: accessToken } = await tokenRes.json();
  if (!accessToken) return fail(request, "no access token");

  // 액세스 토큰 → 카카오 고유 id + 닉네임
  const meRes = await fetch("https://kapi.kakao.com/v2/user/me", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!meRes.ok) return fail(request, `me ${meRes.status} ${await meRes.text()}`);
  const me = await meRes.json();
  const kakaoId = String(me.id ?? "");
  if (!kakaoId) return fail(request, "no kakao id");
  const nickname: string =
    me.kakao_account?.profile?.nickname ?? me.properties?.nickname ?? "";

  const existing = await findUserByProvider("kakao", kakaoId);
  if (existing) {
    const response = NextResponse.redirect(new URL("/", request.url));
    response.cookies.delete(KAKAO_STATE_COOKIE);
    response.cookies.set(USER_COOKIE, await signUserCookie(existing.id), {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 90,
      path: "/",
    });
    return response;
  }

  // 처음 온 카카오 계정 — 초대 코드(또는 기존 접속 코드)를 받아야 가입
  const pending: KakaoPending = {
    kakaoId,
    nickname,
    exp: Date.now() + 1000 * 60 * 10,
  };
  const response = NextResponse.redirect(new URL("/login/invite", request.url));
  response.cookies.delete(KAKAO_STATE_COOKIE);
  response.cookies.set(KAKAO_PENDING_COOKIE, await signPayload(pending), {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: 60 * 10,
    path: "/",
  });
  return response;
}
