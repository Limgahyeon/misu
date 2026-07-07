import { NextRequest } from "next/server";
import { getUserIdFromRequest } from "@/lib/auth";
import {
  getCharacterProfile,
  getProfile,
  saveCharacterProfile,
  saveProfile,
} from "@/lib/db";

export async function GET(request: NextRequest) {
  const userId = await getUserIdFromRequest(request);
  if (!userId) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const characterId = request.nextUrl.searchParams.get("characterId");
  if (characterId) {
    return Response.json({
      profile: (await getCharacterProfile(userId, characterId)) ?? "",
      fallback: (await getProfile(userId)) ?? "",
    });
  }
  return Response.json({ profile: (await getProfile(userId)) ?? "" });
}

export async function PUT(request: NextRequest) {
  const userId = await getUserIdFromRequest(request);
  if (!userId) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const body = await request.json();
  if (typeof body.profile !== "string" || body.profile.length > 2000) {
    return Response.json({ error: "invalid profile" }, { status: 400 });
  }
  if (typeof body.characterId === "string" && body.characterId) {
    await saveCharacterProfile(userId, body.characterId, body.profile.trim());
  } else {
    await saveProfile(userId, body.profile.trim());
  }
  return Response.json({ ok: true });
}
