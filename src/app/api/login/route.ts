import { NextRequest, NextResponse } from "next/server";
import { sha256, signUserCookie, USER_COOKIE } from "@/lib/auth";
import { findUserByCodeHash } from "@/lib/db";

export async function POST(request: NextRequest) {
  const { code } = await request.json();
  if (typeof code !== "string" || !code.trim()) {
    return NextResponse.json({ error: "wrong code" }, { status: 401 });
  }

  const user = await findUserByCodeHash(await sha256(code.trim()));
  if (!user) {
    return NextResponse.json({ error: "wrong code" }, { status: 401 });
  }

  const response = NextResponse.json({ ok: true, name: user.name });
  response.cookies.set(USER_COOKIE, await signUserCookie(user.id), {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 90,
    path: "/",
  });
  return response;
}
