import { NextRequest, NextResponse } from "next/server";
import { USER_COOKIE, verifyUserCookie } from "./lib/auth";

export async function proxy(request: NextRequest) {
  if (!process.env.AUTH_SECRET) return NextResponse.next();

  const { pathname } = request.nextUrl;
  if (
    pathname === "/login" ||
    pathname === "/login/invite" ||
    pathname === "/api/login" ||
    // 카카오 OAuth 플로우 (시작·콜백·초대 코드 가입)
    pathname.startsWith("/api/auth/") ||
    // PWA 자산과 크론 하트비트는 게이트 없이 접근 (하트비트는 자체 시크릿 검증)
    pathname === "/sw.js" ||
    pathname === "/manifest.webmanifest" ||
    pathname === "/apple-touch-icon.png" ||
    pathname.startsWith("/icon-") ||
    pathname === "/api/heartbeat"
  ) {
    return NextResponse.next();
  }

  const userId = await verifyUserCookie(
    request.cookies.get(USER_COOKIE)?.value
  );
  if (userId) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  return NextResponse.redirect(new URL("/login", request.url));
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
