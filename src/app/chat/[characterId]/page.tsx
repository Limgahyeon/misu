import { notFound } from "next/navigation";
import { getUserId } from "@/lib/auth";
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
  if (!character) notFound();

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
    />
  );
}
