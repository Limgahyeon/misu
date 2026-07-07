import { Character, getCharacter } from "./characters";
import { getCustomCharacter } from "./db";

// 프리셋 캐릭터는 모두 공유, 커스텀 캐릭터는 소유자만
export async function findCharacter(
  userId: number,
  id: string
): Promise<Character | undefined> {
  return getCharacter(id) ?? (await getCustomCharacter(userId, id));
}
