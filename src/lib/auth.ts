// 개인 접속 코드 기반 인증 — 로그인하면 HMAC 서명된 유저 쿠키를 발급한다.
// Web Crypto만 사용해서 Edge(proxy)와 Node(API) 양쪽에서 동작.

import { NextRequest } from "next/server";

export const USER_COOKIE = "misu-user";

async function hmac(value: string): Promise<string> {
  const secret = process.env.AUTH_SECRET ?? "";
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(value)
  );
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(text)
  );
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function signUserCookie(userId: number): Promise<string> {
  return `${userId}.${await hmac(String(userId))}`;
}

export async function verifyUserCookie(
  value: string | undefined
): Promise<number | undefined> {
  if (!value) return undefined;
  const dot = value.indexOf(".");
  if (dot <= 0) return undefined;
  const id = value.slice(0, dot);
  const sig = value.slice(dot + 1);
  if (!/^\d+$/.test(id)) return undefined;
  return sig === (await hmac(id)) ? Number(id) : undefined;
}

// API 라우트용 — 요청 쿠키에서 유저 id를 꺼낸다
export async function getUserIdFromRequest(
  request: NextRequest
): Promise<number | undefined> {
  return verifyUserCookie(request.cookies.get(USER_COOKIE)?.value);
}

// 서버 컴포넌트용 (Edge 미들웨어에서도 이 모듈을 import하므로 next/headers는 지연 로드)
export async function getUserId(): Promise<number | undefined> {
  const { cookies } = await import("next/headers");
  const store = await cookies();
  return verifyUserCookie(store.get(USER_COOKIE)?.value);
}
