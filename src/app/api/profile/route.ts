import { NextRequest } from "next/server";
import {
  getCharacterProfile,
  getProfile,
  saveCharacterProfile,
  saveProfile,
} from "@/lib/db";

export async function GET(request: NextRequest) {
  const characterId = request.nextUrl.searchParams.get("characterId");
  if (characterId) {
    return Response.json({
      profile: (await getCharacterProfile(characterId)) ?? "",
      fallback: (await getProfile()) ?? "",
    });
  }
  return Response.json({ profile: (await getProfile()) ?? "" });
}

export async function PUT(request: NextRequest) {
  const body = await request.json();
  if (typeof body.profile !== "string" || body.profile.length > 2000) {
    return Response.json({ error: "invalid profile" }, { status: 400 });
  }
  if (typeof body.characterId === "string" && body.characterId) {
    await saveCharacterProfile(body.characterId, body.profile.trim());
  } else {
    await saveProfile(body.profile.trim());
  }
  return Response.json({ ok: true });
}
