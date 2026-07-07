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
  CREATE TABLE IF NOT EXISTS dialog_snippets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    character_id TEXT NOT NULL,
    content TEXT NOT NULL,
    embedding TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_snippets_character ON dialog_snippets (character_id);
  CREATE TABLE IF NOT EXISTS profile (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    content TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS character_profiles (
    character_id TEXT PRIMARY KEY,
    content TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS push_subscriptions (
    endpoint TEXT PRIMARY KEY,
    subscription TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS appointments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    at TEXT NOT NULL,
    source TEXT NOT NULL DEFAULT 'chat',
    reminded_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`).then(async () => {
  // 기존 테이블에 없는 컬럼 추가 (이미 있으면 에러 무시)
  await db
    .execute("ALTER TABLE characters ADD COLUMN avatar TEXT")
    .catch(() => {});
  await db
    .execute("ALTER TABLE characters ADD COLUMN dialog_examples TEXT")
    .catch(() => {});
  await db
    .execute("ALTER TABLE characters ADD COLUMN category TEXT")
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

// 채팅 응답용 — 전체 대화가 길어져도 최근 것만 가져와 속도를 유지한다
export async function getRecentMessages(
  characterId: string,
  limit: number
): Promise<Message[]> {
  await ready;
  const result = await db.execute({
    sql: "SELECT * FROM (SELECT * FROM messages WHERE character_id = ? ORDER BY id DESC LIMIT ?) ORDER BY id",
    args: [characterId, limit],
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

export interface ChatListRow {
  character_id: string;
  content: string;
  created_at: string;
}

export async function getChatList(): Promise<ChatListRow[]> {
  await ready;
  const result = await db.execute(`
    SELECT character_id, content, created_at FROM messages
    WHERE id IN (SELECT MAX(id) FROM messages GROUP BY character_id)
    ORDER BY id DESC
  `);
  return result.rows as unknown as ChatListRow[];
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
    dialogExamples: (row.dialog_examples as string | null) ?? undefined,
    category: (row.category as string | null) ?? undefined,
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
      (id, name, age, job, emoji, gradient, tagline, personality, speech_style, relationship, first_scene, avatar, dialog_examples, category)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
      c.dialogExamples ?? null,
      c.category ?? null,
    ],
  });
  return id;
}

export async function updateCustomCharacter(
  id: string,
  c: Omit<Character, "id">
): Promise<void> {
  await ready;
  await db.execute({
    sql: `UPDATE characters SET
      name = ?, age = ?, job = ?, emoji = ?, gradient = ?, tagline = ?,
      personality = ?, speech_style = ?, relationship = ?, first_scene = ?, avatar = ?, dialog_examples = ?, category = ?
      WHERE id = ?`,
    args: [
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
      c.dialogExamples ?? null,
      c.category ?? null,
      id,
    ],
  });
}

export async function deleteCustomCharacter(id: string): Promise<void> {
  await ready;
  await db.execute({ sql: "DELETE FROM characters WHERE id = ?", args: [id] });
  await db.execute({
    sql: "DELETE FROM dialog_snippets WHERE character_id = ?",
    args: [id],
  });
  await db.execute({
    sql: "DELETE FROM character_profiles WHERE character_id = ?",
    args: [id],
  });
  await resetConversation(id);
}

// --- dialog snippets (말투 예시 저장소) ---

export interface Snippet {
  id: number;
  content: string;
  embedding: number[];
}

// 스니펫은 업로드 때만 바뀌므로 캐시해서 매 메시지마다 임베딩 전체를 다시 읽지 않는다
const snippetCache = new Map<string, { snippets: Snippet[]; at: number }>();
const SNIPPET_CACHE_TTL = 5 * 60 * 1000;

export async function addSnippets(
  characterId: string,
  items: { content: string; embedding: number[] }[]
): Promise<void> {
  await ready;
  for (const it of items) {
    await db.execute({
      sql: "INSERT INTO dialog_snippets (character_id, content, embedding) VALUES (?, ?, ?)",
      args: [characterId, it.content, JSON.stringify(it.embedding)],
    });
  }
  snippetCache.delete(characterId);
}

export async function getSnippets(characterId: string): Promise<Snippet[]> {
  const hit = snippetCache.get(characterId);
  if (hit && Date.now() - hit.at < SNIPPET_CACHE_TTL) return hit.snippets;
  await ready;
  const result = await db.execute({
    sql: "SELECT id, content, embedding FROM dialog_snippets WHERE character_id = ? ORDER BY id",
    args: [characterId],
  });
  const snippets = result.rows.map((row) => ({
    id: row.id as number,
    content: row.content as string,
    embedding: JSON.parse(row.embedding as string) as number[],
  }));
  snippetCache.set(characterId, { snippets, at: Date.now() });
  return snippets;
}

export async function deleteSnippet(id: number): Promise<void> {
  await ready;
  await db.execute({
    sql: "DELETE FROM dialog_snippets WHERE id = ?",
    args: [id],
  });
  snippetCache.clear();
}

// --- user profile ---

export async function getProfile(): Promise<string | undefined> {
  await ready;
  const result = await db.execute("SELECT content FROM profile WHERE id = 1");
  const content = result.rows[0]?.content as string | undefined;
  return content?.trim() ? content : undefined;
}

export async function saveProfile(content: string): Promise<void> {
  await ready;
  await db.execute({
    sql: `INSERT INTO profile (id, content, updated_at) VALUES (1, ?, datetime('now'))
      ON CONFLICT(id) DO UPDATE SET content = excluded.content, updated_at = datetime('now')`,
    args: [content],
  });
}

// --- 캐릭터별 유저 인포 (이 채팅에서만 쓰는 '나' 설정) ---

export async function getCharacterProfile(
  characterId: string
): Promise<string | undefined> {
  await ready;
  const result = await db.execute({
    sql: "SELECT content FROM character_profiles WHERE character_id = ?",
    args: [characterId],
  });
  const content = result.rows[0]?.content as string | undefined;
  return content?.trim() ? content : undefined;
}

export async function saveCharacterProfile(
  characterId: string,
  content: string
): Promise<void> {
  await ready;
  if (!content.trim()) {
    await db.execute({
      sql: "DELETE FROM character_profiles WHERE character_id = ?",
      args: [characterId],
    });
    return;
  }
  await db.execute({
    sql: `INSERT INTO character_profiles (character_id, content, updated_at) VALUES (?, ?, datetime('now'))
      ON CONFLICT(character_id) DO UPDATE SET content = excluded.content, updated_at = datetime('now')`,
    args: [characterId, content],
  });
}

// --- 푸시 구독 ---

export async function savePushSubscription(sub: {
  endpoint: string;
}): Promise<void> {
  await ready;
  await db.execute({
    sql: `INSERT INTO push_subscriptions (endpoint, subscription) VALUES (?, ?)
      ON CONFLICT(endpoint) DO UPDATE SET subscription = excluded.subscription`,
    args: [sub.endpoint, JSON.stringify(sub)],
  });
}

export async function deletePushSubscription(endpoint: string): Promise<void> {
  await ready;
  await db.execute({
    sql: "DELETE FROM push_subscriptions WHERE endpoint = ?",
    args: [endpoint],
  });
}

export async function getPushSubscriptions(): Promise<
  { endpoint: string; subscription: string }[]
> {
  await ready;
  const result = await db.execute(
    "SELECT endpoint, subscription FROM push_subscriptions"
  );
  return result.rows as unknown as { endpoint: string; subscription: string }[];
}

// --- 일정 (캘린더 + 채팅에서 추출한 약속) ---

export interface Appointment {
  id: number;
  title: string;
  at: string; // UTC ISO
  source: string;
  reminded_at: string | null;
}

export async function addAppointment(
  title: string,
  at: string,
  source: "chat" | "ics"
): Promise<void> {
  await ready;
  // 같은 시각·제목이 이미 있으면 중복 저장하지 않는다 (ICS 재동기화 대비)
  const dup = await db.execute({
    sql: "SELECT id FROM appointments WHERE title = ? AND at = ?",
    args: [title, at],
  });
  if (dup.rows.length > 0) return;
  await db.execute({
    sql: "INSERT INTO appointments (title, at, source) VALUES (?, ?, ?)",
    args: [title, at, source],
  });
}

export async function getUpcomingAppointments(
  withinHours: number
): Promise<Appointment[]> {
  await ready;
  const result = await db.execute({
    sql: `SELECT id, title, at, source, reminded_at FROM appointments
      WHERE at >= datetime('now') AND at <= datetime('now', ?)
      ORDER BY at`,
    args: [`+${withinHours} hours`],
  });
  return result.rows as unknown as Appointment[];
}

export async function markReminded(id: number): Promise<void> {
  await ready;
  await db.execute({
    sql: "UPDATE appointments SET reminded_at = datetime('now') WHERE id = ?",
    args: [id],
  });
}

export async function clearIcsAppointments(): Promise<void> {
  await ready;
  await db.execute(
    "DELETE FROM appointments WHERE source = 'ics' AND reminded_at IS NULL"
  );
}

// --- 설정 (key-value) ---

export async function getSetting(key: string): Promise<string | undefined> {
  await ready;
  const result = await db.execute({
    sql: "SELECT value FROM settings WHERE key = ?",
    args: [key],
  });
  const value = result.rows[0]?.value as string | undefined;
  return value?.trim() ? value : undefined;
}

export async function saveSetting(key: string, value: string): Promise<void> {
  await ready;
  if (!value.trim()) {
    await db.execute({ sql: "DELETE FROM settings WHERE key = ?", args: [key] });
    return;
  }
  await db.execute({
    sql: `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, datetime('now'))
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`,
    args: [key, value],
  });
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
