import { NextRequest } from "next/server";
import { getProfile, saveProfile } from "@/lib/db";

export async function GET() {
  return Response.json({ profile: (await getProfile()) ?? "" });
}

export async function PUT(request: NextRequest) {
  const body = await request.json();
  if (typeof body.profile !== "string" || body.profile.length > 2000) {
    return Response.json({ error: "invalid profile" }, { status: 400 });
  }
  await saveProfile(body.profile.trim());
  return Response.json({ ok: true });
}
