import { NextRequest } from "next/server";
import { getUserIdFromRequest } from "@/lib/auth";
import { deletePushSubscription, savePushSubscription } from "@/lib/db";

export async function POST(request: NextRequest) {
  const userId = await getUserIdFromRequest(request);
  if (!userId) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const sub = await request.json();
  if (typeof sub?.endpoint !== "string" || !sub.keys) {
    return Response.json({ error: "invalid subscription" }, { status: 400 });
  }
  await savePushSubscription(userId, sub);
  return Response.json({ ok: true });
}

export async function DELETE(request: NextRequest) {
  const userId = await getUserIdFromRequest(request);
  if (!userId) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const { endpoint } = await request.json();
  if (typeof endpoint !== "string") {
    return Response.json({ error: "invalid endpoint" }, { status: 400 });
  }
  await deletePushSubscription(endpoint);
  return Response.json({ ok: true });
}
