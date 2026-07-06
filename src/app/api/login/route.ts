import { NextRequest, NextResponse } from "next/server";

async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(text)
  );
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function POST(request: NextRequest) {
  const { code } = await request.json();
  const accessCode = process.env.ACCESS_CODE;

  if (!accessCode || typeof code !== "string" || code !== accessCode) {
    return NextResponse.json({ error: "wrong code" }, { status: 401 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set("misu-access", await sha256(accessCode), {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 90,
    path: "/",
  });
  return response;
}
