import { NextRequest } from "next/server";
import { deletePushSubscription, savePushSubscription } from "@/lib/db";

export async function POST(request: NextRequest) {
  const sub = await request.json();
  if (typeof sub?.endpoint !== "string" || !sub.keys) {
    return Response.json({ error: "invalid subscription" }, { status: 400 });
  }
  await savePushSubscription(sub);
  return Response.json({ ok: true });
}

export async function DELETE(request: NextRequest) {
  const { endpoint } = await request.json();
  if (typeof endpoint !== "string") {
    return Response.json({ error: "invalid endpoint" }, { status: 400 });
  }
  await deletePushSubscription(endpoint);
  return Response.json({ ok: true });
}
