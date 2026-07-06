import { notFound } from "next/navigation";
import { getCharacter } from "@/lib/characters";
import ChatView from "@/components/ChatView";

export default async function ChatPage({
  params,
}: {
  params: Promise<{ characterId: string }>;
}) {
  const { characterId } = await params;
  const character = getCharacter(characterId);
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
