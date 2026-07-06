import { createClient } from "@libsql/client";

const db = createClient({
  url: process.env.TURSO_DATABASE_URL ?? "file:misu.db",
  authToken: process.env.TURSO_AUTH_TOKEN,
});

const ready = db.executeMultiple(`
  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    character_id TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
    content TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_messages_character ON messages (character_id, id);
`);

export interface Message {
  id: number;
  character_id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
}

export async function getMessages(characterId: string): Promise<Message[]> {
  await ready;
  const result = await db.execute({
    sql: "SELECT * FROM messages WHERE character_id = ? ORDER BY id",
    args: [characterId],
  });
  return result.rows as unknown as Message[];
}

export async function addMessage(
  characterId: string,
  role: "user" | "assistant",
  content: string
): Promise<void> {
  await ready;
  await db.execute({
    sql: "INSERT INTO messages (character_id, role, content) VALUES (?, ?, ?)",
    args: [characterId, role, content],
  });
}

export async function resetConversation(characterId: string): Promise<void> {
  await ready;
  await db.execute({
    sql: "DELETE FROM messages WHERE character_id = ?",
    args: [characterId],
  });
}
