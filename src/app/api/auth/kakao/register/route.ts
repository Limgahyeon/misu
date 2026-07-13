// 카카오 가입 마무리 — 초대 코드면 새 계정 생성(코드는 소멸),
// 기존 접속 코드면 그 계정에 카카오를 연결한다.

import { NextRequest, NextResponse } from "next/server";
import {
  sha256,
  signUserCookie,
  USER_COOKIE,
  verifyPayload,
} from "@/lib/auth";
import {
  consumeInviteCode,
  createOAuthUser,
  findUserByCodeHash,
  findUserByProvider,
  isInviteCodeAvailable,
  linkProvider,
} from "@/lib/db";
import { KAKAO_PENDING_COOKIE, KakaoPending } from "@/lib/kakao";

function loginResponse(userId: number, name: string, cookie: string) {
  const response = NextResponse.json({ ok: true, name });
  response.cookies.delete(KAKAO_PENDING_COOKIE);
  response.cookies.set(USER_COOKIE, cookie, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 90,
    path: "/",
  });
  return response;
}

export async function POST(request: NextRequest) {
  const pending = await verifyPayload<KakaoPending>(
    request.cookies.get(KAKAO_PENDING_COOKIE)?.value
  );
  if (!pending) {
    // 대기 쿠키가 없거나 만료(10분) — 카카오 로그인부터 다시
    return NextResponse.json({ error: "expired" }, { status: 401 });
  }

  const { code } = await request.json();
  if (typeof code !== "string" || !code.trim()) {
    return NextResponse.json({ error: "wrong code" }, { status: 400 });
  }
  const codeHash = await sha256(code.trim());

  // 혹시 그 사이 같은 카카오 계정으로 가입이 끝났다면 그냥 로그인
  const already = await findUserByProvider("kakao", pending.kakaoId);
  if (already) {
    return loginResponse(already.id, already.name, await signUserCookie(already.id));
  }

  // ① 초대 코드 — 새 계정을 만들고 코드를 소멸시킨다
  if (await isInviteCodeAvailable(codeHash)) {
    const name = pending.nickname.trim() || "친구";
    const userId = await createOAuthUser(name, "kakao", pending.kakaoId);
    if (!(await consumeInviteCode(codeHash, userId))) {
      // 극히 드문 동시 사용 경합 — 방금 만든 계정으로는 로그인시키지 않는다
      return NextResponse.json({ error: "wrong code" }, { status: 409 });
    }
    return loginResponse(userId, name, await signUserCookie(userId));
  }

  // ② 기존 접속 코드 — 그 계정에 카카오를 연결한다 (기존 유저 마이그레이션)
  const existing = await findUserByCodeHash(codeHash);
  if (existing) {
    await linkProvider(existing.id, "kakao", pending.kakaoId);
    // 연결 실패(이미 다른 카카오가 연결됨)여도 접속 코드 본인이므로 로그인은 허용
    return loginResponse(existing.id, existing.name, await signUserCookie(existing.id));
  }

  return NextResponse.json({ error: "wrong code" }, { status: 401 });
}
