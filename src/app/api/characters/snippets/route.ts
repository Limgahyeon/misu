import { NextRequest } from "next/server";
import { getUserIdFromRequest } from "@/lib/auth";
import { deleteSnippet, getCustomCharacter, getSnippets } from "@/lib/db";

export async function GET(request: NextRequest) {
  const userId = await getUserIdFromRequest(request);
  if (!userId) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const characterId = request.nextUrl.searchParams.get("characterId");
  if (!characterId || !(await getCustomCharacter(userId, characterId))) {
    return Response.json({ error: "unknown character" }, { status: 404 });
  }
  const snippets = await getSnippets(characterId);
  return Response.json({
    snippets: snippets.map((s) => ({ id: s.id, content: s.content })),
  });
}

export async function DELETE(request: NextRequest) {
  const userId = await getUserIdFromRequest(request);
  if (!userId) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const id = Number(request.nextUrl.searchParams.get("id"));
  if (!Number.isInteger(id)) {
    return Response.json({ error: "invalid id" }, { status: 400 });
  }
  await deleteSnippet(userId, id);
  return Response.json({ ok: true });
}
