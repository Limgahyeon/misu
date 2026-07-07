import { createClient } from "@libsql/client";
import { Character } from "./characters";

const db = createClient({
  url: process.env.TURSO_DATABASE_URL ?? "file:misu.db",
  authToken: process.env.TURSO_AUTH_TOKEN,
});

const ready = db.executeMultiple(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    code_hash TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
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
  CREATE TABLE IF NOT EXISTS dialog_snippets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    character_id TEXT NOT NULL,
    content TEXT NOT NULL,
    embedding TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_snippets_character ON dialog_snippets (character_id);
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
  CREATE TABLE IF NOT EXISTS user_profiles (
    user_id INTEGER PRIMARY KEY,
    content TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS user_memories (
    user_id INTEGER NOT NULL,
    character_id TEXT NOT NULL,
    summary TEXT NOT NULL,
    last_message_id INTEGER NOT NULL,
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (user_id, character_id)
  );
  CREATE TABLE IF NOT EXISTS user_character_profiles (
    user_id INTEGER NOT NULL,
    character_id TEXT NOT NULL,
    content TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (user_id, character_id)
  );
  CREATE TABLE IF NOT EXISTS user_settings (
    user_id INTEGER NOT NULL,
    key TEXT NOT NULL,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (user_id, key)
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
  // 멀티유저 전환 — 기존 데이터는 전부 유저 1 소유로
  await db
    .execute("ALTER TABLE messages ADD COLUMN user_id INTEGER NOT NULL DEFAULT 1")
    .catch(() => {});
  await db
    .execute("ALTER TABLE characters ADD COLUMN user_id INTEGER NOT NULL DEFAULT 1")
    .catch(() => {});
  await db
    .execute(
      "ALTER TABLE push_subscriptions ADD COLUMN user_id INTEGER NOT NULL DEFAULT 1"
    )
    .catch(() => {});
  await db
    .execute(
      "ALTER TABLE appointments ADD COLUMN user_id INTEGER NOT NULL DEFAULT 1"
    )
    .catch(() => {});
  // 단일 유저 시절 테이블(memories/character_profiles/profile/settings) → 유저 1로 이관
  await db
    .execute(
      `INSERT OR IGNORE INTO user_memories (user_id, character_id, summary, last_message_id, updated_at)
        SELECT 1, character_id, summary, last_message_id, updated_at FROM memories`
    )
    .catch(() => {});
  await db
    .execute(
      `INSERT OR IGNORE INTO user_character_profiles (user_id, character_id, content, updated_at)
        SELECT 1, character_id, content, updated_at FROM character_profiles`
    )
    .catch(() => {});
  await db
    .execute(
      `INSERT OR IGNORE INTO user_profiles (user_id, content, updated_at)
        SELECT 1, content, updated_at FROM profile WHERE id = 1`
    )
    .catch(() => {});
  await db
    .execute(
      `INSERT OR IGNORE INTO user_settings (user_id, key, value, updated_at)
        SELECT 1, key, value, updated_at FROM settings`
    )
    .catch(() => {});
});

// --- users ---

export interface User {
  id: number;
  name: string;
}

export async function createUser(
  name: string,
  codeHash: string
): Promise<number> {
  await ready;
  const result = await db.execute({
    sql: "INSERT INTO users (name, code_hash) VALUES (?, ?)",
    args: [name, codeHash],
  });
  return Number(result.lastInsertRowid);
}

export async function findUserByCodeHash(
  codeHash: string
): Promise<User | undefined> {
  await ready;
  const result = await db.execute({
    sql: "SELECT id, name FROM users WHERE code_hash = ?",
    args: [codeHash],
  });
  const row = result.rows[0];
  return row ? { id: row.id as number, name: row.name as string } : undefined;
}

export async function listUsers(): Promise<User[]> {
  await ready;
  const result = await db.execute("SELECT id, name FROM users ORDER BY id");
  return result.rows as unknown as User[];
}

// --- messages ---

export interface Message {
  id: number;
  character_id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
}

export async function getMessages(
  userId: number,
  characterId: string
): Promise<Message[]> {
  await ready;
  const result = await db.execute({
    sql: "SELECT * FROM messages WHERE user_id = ? AND character_id = ? ORDER BY id",
    args: [userId, characterId],
  });
  return result.rows as unknown as Message[];
}

// 채팅 응답용 — 전체 대화가 길어져도 최근 것만 가져와 속도를 유지한다
export async function getRecentMessages(
  userId: number,
  characterId: string,
  limit: number
): Promise<Message[]> {
  await ready;
  const result = await db.execute({
    sql: "SELECT * FROM (SELECT * FROM messages WHERE user_id = ? AND character_id = ? ORDER BY id DESC LIMIT ?) ORDER BY id",
    args: [userId, characterId, limit],
  });
  return result.rows as unknown as Message[];
}

// 채팅방 진입용 — 대화가 없으면 첫 장면을 심고, 최근 메시지만 돌려준다
export async function getOrInitMessages(
  userId: number,
  character: Character,
  limit = 100
): Promise<Message[]> {
  let messages = await getRecentMessages(userId, character.id, limit);
  if (messages.length === 0) {
    await addMessage(userId, character.id, "assistant", character.firstScene);
    messages = await getRecentMessages(userId, character.id, limit);
  }
  return messages;
}

export async function addMessage(
  userId: number,
  characterId: string,
  role: "user" | "assistant",
  content: string
): Promise<void> {
  await ready;
  await db.execute({
    sql: "INSERT INTO messages (user_id, character_id, role, content) VALUES (?, ?, ?, ?)",
    args: [userId, characterId, role, content],
  });
}

export async function resetConversation(
  userId: number,
  characterId: string
): Promise<void> {
  await ready;
  await db.execute({
    sql: "DELETE FROM messages WHERE user_id = ? AND character_id = ?",
    args: [userId, characterId],
  });
  await db.execute({
    sql: "DELETE FROM user_memories WHERE user_id = ? AND character_id = ?",
    args: [userId, characterId],
  });
}

export interface ChatListRow {
  character_id: string;
  content: string;
  created_at: string;
}

export async function getChatList(userId: number): Promise<ChatListRow[]> {
  await ready;
  const result = await db.execute({
    sql: `SELECT character_id, content, created_at FROM messages
      WHERE id IN (
        SELECT MAX(id) FROM messages WHERE user_id = ? GROUP BY character_id
      )
      ORDER BY id DESC`,
    args: [userId],
  });
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

export async function getCustomCharacters(userId: number): Promise<Character[]> {
  await ready;
  const result = await db.execute({
    sql: "SELECT * FROM characters WHERE user_id = ? ORDER BY created_at DESC",
    args: [userId],
  });
  return result.rows.map((r) => rowToCharacter(r as Record<string, unknown>));
}

export async function getCustomCharacter(
  userId: number,
  id: string
): Promise<Character | undefined> {
  await ready;
  const result = await db.execute({
    sql: "SELECT * FROM characters WHERE id = ? AND user_id = ?",
    args: [id, userId],
  });
  const row = result.rows[0];
  return row ? rowToCharacter(row as Record<string, unknown>) : undefined;
}

export async function createCustomCharacter(
  userId: number,
  c: Omit<Character, "id">
): Promise<string> {
  await ready;
  const id = `c_${crypto.randomUUID().slice(0, 8)}`;
  await db.execute({
    sql: `INSERT INTO characters
      (id, user_id, name, age, job, emoji, gradient, tagline, personality, speech_style, relationship, first_scene, avatar, dialog_examples, category)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      id,
      userId,
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
  userId: number,
  id: string,
  c: Omit<Character, "id">
): Promise<void> {
  await ready;
  await db.execute({
    sql: `UPDATE characters SET
      name = ?, age = ?, job = ?, emoji = ?, gradient = ?, tagline = ?,
      personality = ?, speech_style = ?, relationship = ?, first_scene = ?, avatar = ?, dialog_examples = ?, category = ?
      WHERE id = ? AND user_id = ?`,
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
      userId,
    ],
  });
}

export async function deleteCustomCharacter(
  userId: number,
  id: string
): Promise<void> {
  await ready;
  await db.execute({
    sql: "DELETE FROM characters WHERE id = ? AND user_id = ?",
    args: [id, userId],
  });
  await db.execute({
    sql: "DELETE FROM dialog_snippets WHERE character_id = ?",
    args: [id],
  });
  await db.execute({
    sql: "DELETE FROM user_character_profiles WHERE user_id = ? AND character_id = ?",
    args: [userId, id],
  });
  await resetConversation(userId, id);
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

// 본인 소유 캐릭터의 스니펫만 지울 수 있다
export async function deleteSnippet(userId: number, id: number): Promise<void> {
  await ready;
  await db.execute({
    sql: `DELETE FROM dialog_snippets WHERE id = ?
      AND character_id IN (SELECT id FROM characters WHERE user_id = ?)`,
    args: [id, userId],
  });
  snippetCache.clear();
}

// --- user profile (내 정보) ---

export async function getProfile(userId: number): Promise<string | undefined> {
  await ready;
  const result = await db.execute({
    sql: "SELECT content FROM user_profiles WHERE user_id = ?",
    args: [userId],
  });
  const content = result.rows[0]?.content as string | undefined;
  return content?.trim() ? content : undefined;
}

export async function saveProfile(
  userId: number,
  content: string
): Promise<void> {
  await ready;
  await db.execute({
    sql: `INSERT INTO user_profiles (user_id, content, updated_at) VALUES (?, ?, datetime('now'))
      ON CONFLICT(user_id) DO UPDATE SET content = excluded.content, updated_at = datetime('now')`,
    args: [userId, content],
  });
}

// 프롬프트에 넣을 최종 유저 인포 — 이름(항상 이 호칭으로) + 캐릭터별 인포(없으면 기본 내 정보)
export async function getEffectiveProfile(
  userId: number,
  characterId?: string
): Promise<string | undefined> {
  const [name, charP] = await Promise.all([
    getSetting(userId, "user_name"),
    characterId
      ? getCharacterProfile(userId, characterId)
      : Promise.resolve(undefined),
  ]);
  const body = charP ?? (await getProfile(userId));
  const parts = [
    name ? `이름/호칭: ${name} — 유저를 항상 이 이름으로 부른다.` : undefined,
    body,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join("\n") : undefined;
}

// --- 캐릭터별 유저 인포 (이 채팅에서만 쓰는 '나' 설정) ---

export async function getCharacterProfile(
  userId: number,
  characterId: string
): Promise<string | undefined> {
  await ready;
  const result = await db.execute({
    sql: "SELECT content FROM user_character_profiles WHERE user_id = ? AND character_id = ?",
    args: [userId, characterId],
  });
  const content = result.rows[0]?.content as string | undefined;
  return content?.trim() ? content : undefined;
}

export async function saveCharacterProfile(
  userId: number,
  characterId: string,
  content: string
): Promise<void> {
  await ready;
  if (!content.trim()) {
    await db.execute({
      sql: "DELETE FROM user_character_profiles WHERE user_id = ? AND character_id = ?",
      args: [userId, characterId],
    });
    return;
  }
  await db.execute({
    sql: `INSERT INTO user_character_profiles (user_id, character_id, content, updated_at) VALUES (?, ?, ?, datetime('now'))
      ON CONFLICT(user_id, character_id) DO UPDATE SET content = excluded.content, updated_at = datetime('now')`,
    args: [userId, characterId, content],
  });
}

// --- 푸시 구독 ---

export async function savePushSubscription(
  userId: number,
  sub: { endpoint: string }
): Promise<void> {
  await ready;
  await db.execute({
    sql: `INSERT INTO push_subscriptions (endpoint, subscription, user_id) VALUES (?, ?, ?)
      ON CONFLICT(endpoint) DO UPDATE SET subscription = excluded.subscription, user_id = excluded.user_id`,
    args: [sub.endpoint, JSON.stringify(sub), userId],
  });
}

export async function deletePushSubscription(endpoint: string): Promise<void> {
  await ready;
  await db.execute({
    sql: "DELETE FROM push_subscriptions WHERE endpoint = ?",
    args: [endpoint],
  });
}

export async function getPushSubscriptions(
  userId: number
): Promise<{ endpoint: string; subscription: string }[]> {
  await ready;
  const result = await db.execute({
    sql: "SELECT endpoint, subscription FROM push_subscriptions WHERE user_id = ?",
    args: [userId],
  });
  return result.rows as unknown as { endpoint: string; subscription: string }[];
}

// --- 일정 (캘린더 + 채팅에서 추출한 약속) ---

export interface Appointment {
  id: number;
  title: string;
  at: string; // UTC "YYYY-MM-DD HH:MM:SS"
  source: string;
  reminded_at: string | null;
}

export async function addAppointment(
  userId: number,
  title: string,
  at: string,
  source: "chat" | "ics"
): Promise<void> {
  await ready;
  // 같은 시각·제목이 이미 있으면 중복 저장하지 않는다 (ICS 재동기화 대비)
  const dup = await db.execute({
    sql: "SELECT id FROM appointments WHERE user_id = ? AND title = ? AND at = ?",
    args: [userId, title, at],
  });
  if (dup.rows.length > 0) return;
  await db.execute({
    sql: "INSERT INTO appointments (user_id, title, at, source) VALUES (?, ?, ?, ?)",
    args: [userId, title, at, source],
  });
}

export async function getUpcomingAppointments(
  userId: number,
  withinHours: number
): Promise<Appointment[]> {
  await ready;
  const result = await db.execute({
    sql: `SELECT id, title, at, source, reminded_at FROM appointments
      WHERE user_id = ? AND at >= datetime('now') AND at <= datetime('now', ?)
      ORDER BY at`,
    args: [userId, `+${withinHours} hours`],
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

export async function clearIcsAppointments(userId: number): Promise<void> {
  await ready;
  await db.execute({
    sql: "DELETE FROM appointments WHERE user_id = ? AND source = 'ics' AND reminded_at IS NULL",
    args: [userId],
  });
}

// --- 설정 (유저별 key-value) ---

export async function getSetting(
  userId: number,
  key: string
): Promise<string | undefined> {
  await ready;
  const result = await db.execute({
    sql: "SELECT value FROM user_settings WHERE user_id = ? AND key = ?",
    args: [userId, key],
  });
  const value = result.rows[0]?.value as string | undefined;
  return value?.trim() ? value : undefined;
}

export async function saveSetting(
  userId: number,
  key: string,
  value: string
): Promise<void> {
  await ready;
  if (!value.trim()) {
    await db.execute({
      sql: "DELETE FROM user_settings WHERE user_id = ? AND key = ?",
      args: [userId, key],
    });
    return;
  }
  await db.execute({
    sql: `INSERT INTO user_settings (user_id, key, value, updated_at) VALUES (?, ?, ?, datetime('now'))
      ON CONFLICT(user_id, key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`,
    args: [userId, key, value],
  });
}

// --- long-term memory ---

export interface Memory {
  summary: string;
  last_message_id: number;
}

export async function getMemory(
  userId: number,
  characterId: string
): Promise<Memory | undefined> {
  await ready;
  const result = await db.execute({
    sql: "SELECT summary, last_message_id FROM user_memories WHERE user_id = ? AND character_id = ?",
    args: [userId, characterId],
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
  userId: number,
  characterId: string,
  summary: string,
  lastMessageId: number
): Promise<void> {
  await ready;
  await db.execute({
    sql: `INSERT INTO user_memories (user_id, character_id, summary, last_message_id, updated_at)
      VALUES (?, ?, ?, ?, datetime('now'))
      ON CONFLICT(user_id, character_id) DO UPDATE SET
        summary = excluded.summary,
        last_message_id = excluded.last_message_id,
        updated_at = datetime('now')`,
    args: [userId, characterId, summary, lastMessageId],
  });
}
