import { createClient } from "@libsql/client";
import { Character } from "./characters";

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
  CREATE TABLE IF NOT EXISTS characters (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    age INTEGER NOT NULL,
    job TEXT NOT NULL,
    emoji TEXT NOT NULL,
    gradient TEXT NOT NULL,
    tagline TEXT NOT NULL,
    personality TEXT NOT NULL,
    speech_style TEXT NOT NULL,
    relationship TEXT NOT NULL,
    first_scene TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS memories (
    character_id TEXT PRIMARY KEY,
    summary TEXT NOT NULL,
    last_message_id INTEGER NOT NULL,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`).then(async () => {
  // 기존 테이블에 avatar 컬럼이 없으면 추가 (이미 있으면 에러 무시)
  await db
    .execute("ALTER TABLE characters ADD COLUMN avatar TEXT")
    .catch(() => {});
});

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
  await db.execute({
    sql: "DELETE FROM memories WHERE character_id = ?",
    args: [characterId],
  });
}

// --- custom characters ---

function rowToCharacter(row: Record<string, unknown>): Character {
  return {
    id: row.id as string,
    name: row.name as string,
    age: row.age as number,
    job: row.job as string,
    emoji: row.emoji as string,
    gradient: row.gradient as string,
    tagline: row.tagline as string,
    personality: row.personality as string,
    speechStyle: row.speech_style as string,
    relationship: row.relationship as string,
    firstScene: row.first_scene as string,
    avatar: (row.avatar as string | null) ?? undefined,
  };
}

export async function getCustomCharacters(): Promise<Character[]> {
  await ready;
  const result = await db.execute(
    "SELECT * FROM characters ORDER BY created_at DESC"
  );
  return result.rows.map((r) => rowToCharacter(r as Record<string, unknown>));
}

export async function getCustomCharacter(
  id: string
): Promise<Character | undefined> {
  await ready;
  const result = await db.execute({
    sql: "SELECT * FROM characters WHERE id = ?",
    args: [id],
  });
  const row = result.rows[0];
  return row ? rowToCharacter(row as Record<string, unknown>) : undefined;
}

export async function createCustomCharacter(
  c: Omit<Character, "id">
): Promise<string> {
  await ready;
  const id = `c_${crypto.randomUUID().slice(0, 8)}`;
  await db.execute({
    sql: `INSERT INTO characters
      (id, name, age, job, emoji, gradient, tagline, personality, speech_style, relationship, first_scene, avatar)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      id,
      c.name,
      c.age,
      c.job,
      c.emoji,
      c.gradient,
      c.tagline,
      c.personality,
      c.speechStyle,
      c.relationship,
      c.firstScene,
      c.avatar ?? null,
    ],
  });
  return id;
}

export async function deleteCustomCharacter(id: string): Promise<void> {
  await ready;
  await db.execute({ sql: "DELETE FROM characters WHERE id = ?", args: [id] });
  await resetConversation(id);
}

// --- long-term memory ---

export interface Memory {
  summary: string;
  last_message_id: number;
}

export async function getMemory(
  characterId: string
): Promise<Memory | undefined> {
  await ready;
  const result = await db.execute({
    sql: "SELECT summary, last_message_id FROM memories WHERE character_id = ?",
    args: [characterId],
  });
  const row = result.rows[0];
  return row
    ? {
        summary: row.summary as string,
        last_message_id: row.last_message_id as number,
      }
    : undefined;
}

export async function saveMemory(
  characterId: string,
  summary: string,
  lastMessageId: number
): Promise<void> {
  await ready;
  await db.execute({
    sql: `INSERT INTO memories (character_id, summary, last_message_id, updated_at)
      VALUES (?, ?, ?, datetime('now'))
      ON CONFLICT(character_id) DO UPDATE SET
        summary = excluded.summary,
        last_message_id = excluded.last_message_id,
        updated_at = datetime('now')`,
    args: [characterId, summary, lastMessageId],
  });
}
