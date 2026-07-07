import { NextRequest } from "next/server";
import { deleteSnippet, getSnippets } from "@/lib/db";

export async function GET(request: NextRequest) {
  const characterId = request.nextUrl.searchParams.get("characterId");
  if (!characterId) {
    return Response.json({ error: "characterId required" }, { status: 400 });
  }
  const snippets = await getSnippets(characterId);
  return Response.json({
    snippets: snippets.map((s) => ({ id: s.id, content: s.content })),
  });
}

export async function DELETE(request: NextRequest) {
  const id = Number(request.nextUrl.searchParams.get("id"));
  if (!Number.isInteger(id)) {
    return Response.json({ error: "invalid id" }, { status: 400 });
  }
  await deleteSnippet(id);
  return Response.json({ ok: true });
}
