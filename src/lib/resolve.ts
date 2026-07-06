import { Character, getCharacter } from "./characters";
import { getCustomCharacter } from "./db";

export async function findCharacter(
  id: string
): Promise<Character | undefined> {
  return getCharacter(id) ?? (await getCustomCharacter(id));
}
