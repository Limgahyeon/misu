import { notFound } from "next/navigation";
import { getUserId } from "@/lib/auth";
import { getOrInitMessages } from "@/lib/db";
import { OWNER_USER_ID } from "@/lib/limits";
import { findCharacter } from "@/lib/resolve";
import ChatView from "@/components/ChatView";

export const dynamic = "force-dynamic";

export default async function ChatPage({
  params,
}: {
  params: Promise<{ characterId: string }>;
}) {
  const { characterId } = await params;
  const userId = await getUserId();
  const character = userId
    ? await findCharacter(userId, characterId)
    : undefined;
  if (!character || !userId) notFound();

  // 대화를 서버에서 미리 실어 보낸다 — 클라이언트 재요청("불러오는 중") 제거
  const messages = await getOrInitMessages(userId, character);

  return (
    <ChatView
      character={{
        id: character.id,
        name: character.name,
        emoji: character.emoji,
        gradient: character.gradient,
        job: character.job,
        avatar: character.avatar,
      }}
      initialMessages={messages.map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        createdAt: m.created_at,
        variants: m.variants ? (JSON.parse(m.variants) as string[]) : undefined,
      }))}
      allowPaidModels={userId === OWNER_USER_ID}
    />
  );
}
