import { notFound } from "next/navigation";
import { findCharacter } from "@/lib/resolve";
import ChatView from "@/components/ChatView";

export const dynamic = "force-dynamic";

export default async function ChatPage({
  params,
}: {
  params: Promise<{ characterId: string }>;
}) {
  const { characterId } = await params;
  const character = await findCharacter(characterId);
  if (!character) notFound();

  return (
    <ChatView
      character={{
        id: character.id,
        name: character.name,
        emoji: character.emoji,
        gradient: character.gradient,
        job: character.job,
      }}
    />
  );
}
