import { NextRequest } from "next/server";
import { getUserIdFromRequest } from "@/lib/auth";
import { Character, GRADIENTS } from "@/lib/characters";
import {
  createCustomCharacter,
  deleteCustomCharacter,
  getCustomCharacter,
  getCustomCharacters,
  updateCustomCharacter,
} from "@/lib/db";

export async function GET(request: NextRequest) {
  const userId = await getUserIdFromRequest(request);
  if (!userId) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  return Response.json({ characters: await getCustomCharacters(userId) });
}

function parseCharacter(
  body: Record<string, unknown>
): Omit<Character, "id"> | { error: string } {
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
    if (typeof body[f] !== "string" || !(body[f] as string).trim()) {
      return { error: `${f} is required` };
    }
  }
  const b = body as Record<string, string>;
  const age = Number(body.age);
  if (!Number.isInteger(age) || age < 19 || age > 99) {
    return { error: "age must be between 19 and 99" };
  }
  const gradient = GRADIENTS.includes(b.gradient) ? b.gradient : GRADIENTS[0];

  let avatar: string | undefined;
  if (body.avatar != null && body.avatar !== "") {
    if (
      typeof body.avatar !== "string" ||
      !body.avatar.startsWith("data:image/") ||
      body.avatar.length > 700_000
    ) {
      return { error: "invalid avatar" };
    }
    avatar = body.avatar;
  }

  let dialogExamples: string | undefined;
  if (body.dialogExamples != null && body.dialogExamples !== "") {
    if (
      typeof body.dialogExamples !== "string" ||
      body.dialogExamples.length > 4000
    ) {
      return { error: "invalid dialogExamples" };
    }
    dialogExamples = body.dialogExamples.trim();
  }

  let category: string | undefined;
  if (body.category != null && body.category !== "") {
    if (body.category !== "themis") {
      return { error: "invalid category" };
    }
    category = body.category;
  }

  return {
    name: b.name.trim(),
    age,
    job: b.job.trim(),
    emoji: b.emoji.trim().slice(0, 8),
    gradient,
    tagline: b.tagline.trim(),
    personality: b.personality.trim(),
    speechStyle: b.speechStyle.trim(),
    relationship: b.relationship.trim(),
    firstScene: b.firstScene.trim(),
    avatar,
    dialogExamples,
    category,
  };
}

export async function POST(request: NextRequest) {
  const userId = await getUserIdFromRequest(request);
  if (!userId) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const parsed = parseCharacter(await request.json());
  if ("error" in parsed) {
    return Response.json({ error: parsed.error }, { status: 400 });
  }
  const id = await createCustomCharacter(userId, parsed);
  return Response.json({ id });
}

export async function PUT(request: NextRequest) {
  const userId = await getUserIdFromRequest(request);
  if (!userId) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const body = await request.json();
  const id = body.id;
  if (typeof id !== "string" || !(await getCustomCharacter(userId, id))) {
    return Response.json({ error: "unknown character" }, { status: 404 });
  }
  const parsed = parseCharacter(body);
  if ("error" in parsed) {
    return Response.json({ error: parsed.error }, { status: 400 });
  }
  await updateCustomCharacter(userId, id, parsed);
  return Response.json({ id });
}

export async function DELETE(request: NextRequest) {
  const userId = await getUserIdFromRequest(request);
  if (!userId) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const id = request.nextUrl.searchParams.get("id");
  if (!id || !(await getCustomCharacter(userId, id))) {
    return Response.json({ error: "unknown character" }, { status: 404 });
  }
  await deleteCustomCharacter(userId, id);
  return Response.json({ ok: true });
}
