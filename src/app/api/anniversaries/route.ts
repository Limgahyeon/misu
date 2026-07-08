import { NextRequest } from "next/server";
import { getUserIdFromRequest } from "@/lib/auth";
import { addAnniversary, deleteAnniversary, listAnniversaries } from "@/lib/db";

export async function GET(request: NextRequest) {
  const userId = await getUserIdFromRequest(request);
  if (!userId) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  return Response.json({ anniversaries: await listAnniversaries(userId) });
}

export async function POST(request: NextRequest) {
  const userId = await getUserIdFromRequest(request);
  if (!userId) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const { title, date, repeat } = await request.json();
  if (
    typeof title !== "string" ||
    !title.trim() ||
    title.length > 50 ||
    typeof date !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    !["yearly", "monthly", "dday"].includes(repeat)
  ) {
    return Response.json({ error: "invalid anniversary" }, { status: 400 });
  }
  await addAnniversary(userId, title.trim(), date, repeat);
  return Response.json({ anniversaries: await listAnniversaries(userId) });
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
  await deleteAnniversary(userId, id);
  return Response.json({ ok: true });
}
