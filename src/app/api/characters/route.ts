import { NextRequest } from "next/server";
import { GRADIENTS } from "@/lib/characters";
import {
  createCustomCharacter,
  deleteCustomCharacter,
  getCustomCharacter,
  getCustomCharacters,
} from "@/lib/db";

export async function GET() {
  return Response.json({ characters: await getCustomCharacters() });
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const fields = [
    "name",
    "job",
    "emoji",
    "tagline",
    "personality",
    "speechStyle",
    "relationship",
    "firstScene",
  ] as const;

  for (const f of fields) {
    if (typeof body[f] !== "string" || !body[f].trim()) {
      return Response.json({ error: `${f} is required` }, { status: 400 });
    }
  }
  const age = Number(body.age);
  if (!Number.isInteger(age) || age < 19 || age > 99) {
    return Response.json(
      { error: "age must be between 19 and 99" },
      { status: 400 }
    );
  }
  const gradient = GRADIENTS.includes(body.gradient)
    ? body.gradient
    : GRADIENTS[0];

  const id = await createCustomCharacter({
    name: body.name.trim(),
    age,
    job: body.job.trim(),
    emoji: body.emoji.trim().slice(0, 8),
    gradient,
    tagline: body.tagline.trim(),
    personality: body.personality.trim(),
    speechStyle: body.speechStyle.trim(),
    relationship: body.relationship.trim(),
    firstScene: body.firstScene.trim(),
  });
  return Response.json({ id });
}

export async function DELETE(request: NextRequest) {
  const id = request.nextUrl.searchParams.get("id");
  if (!id || !(await getCustomCharacter(id))) {
    return Response.json({ error: "unknown character" }, { status: 404 });
  }
  await deleteCustomCharacter(id);
  return Response.json({ ok: true });
}
