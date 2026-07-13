import { createClient } from "@libsql/client";
import { createHash, randomBytes } from "node:crypto";
import { Character } from "./characters";

// 로컬 개발(next dev)은 기본적으로 로컬 파일 DB를 쓴다 — 테스트가 실서비스
// 데이터를 오염시키지 않게. 실DB가 정말 필요한 로컬 작업만 MISU_PROD_DB=1로 켠다.
const useProdDb =
  process.env.NODE_ENV === "production" || process.env.MISU_PROD_DB === "1";

const db = createClient(
  useProdDb
    ? {
        url: process.env.TURSO_DATABASE_URL ?? "file:misu.db",
        authToken: process.env.TURSO_AUTH_TOKEN,
      }
    : { url: "file:misu-dev.db" }
);

const initSql = `
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
  CREATE TABLE IF NOT EXISTS user_read_state (
    user_id INTEGER NOT NULL,
    character_id TEXT NOT NULL,
    last_read_id INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (user_id, character_id)
  );
  CREATE TABLE IF NOT EXISTS anniversaries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    date TEXT NOT NULL,
    repeat TEXT NOT NULL DEFAULT 'yearly',
    last_celebrated TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS invite_codes (
    code_hash TEXT PRIMARY KEY,
    note TEXT,
    used_by INTEGER,
    used_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`;

async function init() {
  await db.executeMultiple(initSql);
  // 기존 테이블에 없는 컬럼 추가 (이미 있으면 에러 무시)
  await db
    .execute("ALTER TABLE characters ADD COLUMN avatar TEXT")
    .catch(() => {});
  await db
    .execute("ALTER TABLE characters ADD COLUMN dialog_examples TEXT")
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
  await db
    .execute("ALTER TABLE user_character_profiles ADD COLUMN name TEXT")
    .catch(() => {});
  // 리롤 버전들 — JSON 배열, content는 현재 선택된 버전을 항상 미러링
  await db
    .execute("ALTER TABLE messages ADD COLUMN variants TEXT")
    .catch(() => {});
  // 소셜 로그인 — provider('kakao' 등) + 그쪽 고유 id, 접속 코드 로그인과 병행
  await db.execute("ALTER TABLE users ADD COLUMN provider TEXT").catch(() => {});
  await db
    .execute("ALTER TABLE users ADD COLUMN provider_id TEXT")
    .catch(() => {});
  await db
    .execute(
      "CREATE UNIQUE INDEX IF NOT EXISTS idx_users_provider ON users (provider, provider_id)"
    )
    .catch(() => {});
  // 모든 메시지 조회가 (user_id, character_id)로 거른다 — user_id는 ALTER로 추가되는
  // 컬럼이라 인덱스도 여기서 만든다
  await db
    .execute(
      "CREATE INDEX IF NOT EXISTS idx_messages_user_character ON messages (user_id, character_id, id)"
    )
    .catch(() => {});
  // 개발용 파일 DB는 비어 있으므로 접속 코드 'dev'인 유저를 심어둔다
  if (!useProdDb) {
    const devHash = createHash("sha256").update("dev").digest("hex");
    await db
      .execute({
        sql: "INSERT OR IGNORE INTO users (name, code_hash) VALUES ('개발용', ?)",
        args: [devHash],
      })
      .catch(() => {});
  }
}

// 초기화가 일시 오류(네트워크 등)로 실패해도 인스턴스 전체가 죽지 않게 한다.
// 테이블은 이미 존재하므로 재시도 후에도 실패하면 그냥 진행해도 안전하다.
const ready = init().catch(async (err) => {
  console.error("db init failed, retrying once:", err);
  try {
    await init();
  } catch (err2) {
    console.error("db init retry failed, continuing:", err2);
  }
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

export async function findUserByProvider(
  provider: string,
  providerId: string
): Promise<User | undefined> {
  await ready;
  const result = await db.execute({
    sql: "SELECT id, name FROM users WHERE provider = ? AND provider_id = ?",
    args: [provider, providerId],
  });
  const row = result.rows[0];
  return row ? { id: row.id as number, name: row.name as string } : undefined;
}

// 소셜 가입 유저 — code_hash는 NOT NULL UNIQUE라 랜덤 값을 채워둔다(접속 코드 없음)
export async function createOAuthUser(
  name: string,
  provider: string,
  providerId: string
): Promise<number> {
  await ready;
  const filler = createHash("sha256")
    .update(randomBytes(32))
    .digest("hex");
  const result = await db.execute({
    sql: "INSERT INTO users (name, code_hash, provider, provider_id) VALUES (?, ?, ?, ?)",
    args: [name, filler, provider, providerId],
  });
  return Number(result.lastInsertRowid);
}

// 기존 접속 코드 유저에 소셜 계정을 연결한다. 이미 다른 계정에 연결돼 있으면 false
export async function linkProvider(
  userId: number,
  provider: string,
  providerId: string
): Promise<boolean> {
  await ready;
  try {
    const result = await db.execute({
      sql: "UPDATE users SET provider = ?, provider_id = ? WHERE id = ? AND provider_id IS NULL",
      args: [provider, providerId, userId],
    });
    return result.rowsAffected === 1;
  } catch {
    return false; // 유니크 인덱스 충돌 = 그 카카오 계정이 이미 다른 유저에 연결됨
  }
}

// --- invite codes ---

export async function createInviteCode(
  codeHash: string,
  note: string | null
): Promise<void> {
  await ready;
  await db.execute({
    sql: "INSERT INTO invite_codes (code_hash, note) VALUES (?, ?)",
    args: [codeHash, note],
  });
}

// 미사용 코드만 원자적으로 소멸시킨다 — 성공하면 true (동시 사용 방지)
export async function consumeInviteCode(
  codeHash: string,
  userId: number
): Promise<boolean> {
  await ready;
  const result = await db.execute({
    sql: "UPDATE invite_codes SET used_by = ?, used_at = datetime('now') WHERE code_hash = ? AND used_by IS NULL",
    args: [userId, codeHash],
  });
  return result.rowsAffected === 1;
}

// 가입 전 검증용 — 코드가 존재하고 아직 미사용인지
export async function isInviteCodeAvailable(codeHash: string): Promise<boolean> {
  await ready;
  const result = await db.execute({
    sql: "SELECT 1 FROM invite_codes WHERE code_hash = ? AND used_by IS NULL",
    args: [codeHash],
  });
  return result.rows.length === 1;
}

// --- messages ---

export interface Message {
  id: number;
  character_id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
  // 리롤로 쌓인 답장 버전들(JSON 배열 문자열). content = 현재 선택된 버전
  variants?: string | null;
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

// 과거 대화 페이지네이션 — 특정 메시지보다 오래된 것들을 최근순 limit개
export async function getMessagesBefore(
  userId: number,
  characterId: string,
  beforeId: number,
  limit: number
): Promise<Message[]> {
  await ready;
  const result = await db.execute({
    sql: "SELECT * FROM (SELECT * FROM messages WHERE user_id = ? AND character_id = ? AND id < ? ORDER BY id DESC LIMIT ?) ORDER BY id",
    args: [userId, characterId, beforeId, limit],
  });
  return result.rows as unknown as Message[];
}

// 채팅방 진입용 — 대화가 없으면 첫 장면을 심고, 최근 메시지만 돌려준다.
// 방에 들어온 것이므로 읽음 처리도 함께 한다.
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
  await markRead(userId, character.id);
  return messages;
}

// 읽음 처리 — 현재 마지막 메시지까지 읽은 것으로 기록
export async function markRead(
  userId: number,
  characterId: string
): Promise<void> {
  await ready;
  await db.execute({
    sql: `INSERT INTO user_read_state (user_id, character_id, last_read_id)
      VALUES (?, ?, COALESCE((SELECT MAX(id) FROM messages WHERE user_id = ? AND character_id = ?), 0))
      ON CONFLICT(user_id, character_id) DO UPDATE SET last_read_id = excluded.last_read_id`,
    args: [userId, characterId, userId, characterId],
  });
}

// 오늘(KST) 보낸 유저 메시지 수 — 하루 한도 체크용
export async function countUserMessagesSince(
  userId: number,
  sinceUtc: string
): Promise<number> {
  await ready;
  const result = await db.execute({
    sql: "SELECT COUNT(*) AS n FROM messages WHERE user_id = ? AND role = 'user' AND created_at >= ?",
    args: [userId, sinceUtc],
  });
  return Number(result.rows[0]?.n ?? 0);
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

// 리롤용 — 답장 버전 배열과 현재 선택된 버전(content)을 저장한다.
// content를 미러링해두면 히스토리·기억 요약·채팅 리스트가 전부 선택된 버전을 그대로 쓴다.
export async function saveAssistantVariants(
  userId: number,
  characterId: string,
  id: number,
  content: string,
  variants: string[]
): Promise<void> {
  await ready;
  await db.execute({
    sql: "UPDATE messages SET content = ?, variants = ? WHERE id = ? AND user_id = ? AND character_id = ? AND role = 'assistant'",
    args: [content, JSON.stringify(variants), id, userId, characterId],
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
  unread: number;
}

export async function getChatList(userId: number): Promise<ChatListRow[]> {
  await ready;
  const result = await db.execute({
    sql: `SELECT m.character_id, m.content, m.created_at,
      (SELECT COUNT(*) FROM messages x
        WHERE x.user_id = ? AND x.character_id = m.character_id AND x.role = 'assistant'
          AND x.id > COALESCE((SELECT r.last_read_id FROM user_read_state r
            WHERE r.user_id = ? AND r.character_id = m.character_id), 0)
      ) AS unread
      FROM messages m
      WHERE m.id IN (
        SELECT MAX(id) FROM messages WHERE user_id = ? GROUP BY character_id
      )
      ORDER BY m.id DESC`,
    args: [userId, userId, userId],
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
      (id, user_id, name, age, job, emoji, gradient, tagline, personality, speech_style, relationship, first_scene, avatar, dialog_examples)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
      personality = ?, speech_style = ?, relationship = ?, first_scene = ?, avatar = ?, dialog_examples = ?
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
// 이름도 캐릭터별 설정이 있으면 그게 우선
export async function getEffectiveProfile(
  userId: number,
  characterId?: string
): Promise<string | undefined> {
  const [globalName, charP] = await Promise.all([
    getSetting(userId, "user_name"),
    characterId
      ? getCharacterProfile(userId, characterId)
      : Promise.resolve(undefined),
  ]);
  const name = charP?.name ?? globalName;
  const body = charP?.content ?? (await getProfile(userId));
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
): Promise<{ content?: string; name?: string } | undefined> {
  await ready;
  const result = await db.execute({
    sql: "SELECT content, name FROM user_character_profiles WHERE user_id = ? AND character_id = ?",
    args: [userId, characterId],
  });
  const row = result.rows[0];
  if (!row) return undefined;
  const content = (row.content as string | null)?.trim();
  const name = (row.name as string | null)?.trim();
  if (!content && !name) return undefined;
  return { content: content || undefined, name: name || undefined };
}

export async function saveCharacterProfile(
  userId: number,
  characterId: string,
  content: string,
  name: string
): Promise<void> {
  await ready;
  if (!content.trim() && !name.trim()) {
    await db.execute({
      sql: "DELETE FROM user_character_profiles WHERE user_id = ? AND character_id = ?",
      args: [userId, characterId],
    });
    return;
  }
  await db.execute({
    sql: `INSERT INTO user_character_profiles (user_id, character_id, content, name, updated_at) VALUES (?, ?, ?, ?, datetime('now'))
      ON CONFLICT(user_id, character_id) DO UPDATE SET
        content = excluded.content, name = excluded.name, updated_at = datetime('now')`,
    args: [userId, characterId, content, name.trim() || null],
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

// ICS 동기화 전량 교체 — 삭제 + 삽입을 한 번의 왕복(batch)으로.
// 리마인드가 이미 나간 일정(reminded_at 있음)은 남겨서 중복 알림을 막고,
// NOT EXISTS 조건으로 그 잔존 행과의 중복 삽입도 막는다.
export async function replaceIcsAppointments(
  userId: number,
  items: { title: string; at: string }[]
): Promise<void> {
  await ready;
  await db.batch(
    [
      {
        sql: "DELETE FROM appointments WHERE user_id = ? AND source = 'ics' AND reminded_at IS NULL",
        args: [userId],
      },
      ...items.map((it) => ({
        sql: `INSERT INTO appointments (user_id, title, at, source)
          SELECT ?, ?, ?, 'ics'
          WHERE NOT EXISTS (SELECT 1 FROM appointments WHERE user_id = ? AND title = ? AND at = ?)`,
        args: [userId, it.title, it.at, userId, it.title, it.at],
      })),
    ],
    "write"
  );
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

// --- 기념일 (생일/사귄 날/월급날 등) ---

export interface Anniversary {
  id: number;
  title: string;
  date: string; // "YYYY-MM-DD" (KST 기준일)
  repeat: "yearly" | "monthly" | "dday";
  last_celebrated: string | null;
}

export async function listAnniversaries(
  userId: number
): Promise<Anniversary[]> {
  await ready;
  const result = await db.execute({
    sql: "SELECT id, title, date, repeat, last_celebrated FROM anniversaries WHERE user_id = ? ORDER BY id",
    args: [userId],
  });
  return result.rows as unknown as Anniversary[];
}

export async function addAnniversary(
  userId: number,
  title: string,
  date: string,
  repeat: string
): Promise<void> {
  await ready;
  await db.execute({
    sql: "INSERT INTO anniversaries (user_id, title, date, repeat) VALUES (?, ?, ?, ?)",
    args: [userId, title, date, repeat],
  });
}

export async function deleteAnniversary(
  userId: number,
  id: number
): Promise<void> {
  await ready;
  await db.execute({
    sql: "DELETE FROM anniversaries WHERE id = ? AND user_id = ?",
    args: [id, userId],
  });
}

export async function markCelebrated(id: number, day: string): Promise<void> {
  await ready;
  await db.execute({
    sql: "UPDATE anniversaries SET last_celebrated = ? WHERE id = ?",
    args: [day, id],
  });
}

// --- 설정 (유저별 key-value) ---

// 하트비트용 일괄 조회 — 유저의 설정 전부를 한 번의 왕복으로
export async function getSettings(
  userId: number
): Promise<Record<string, string>> {
  await ready;
  const result = await db.execute({
    sql: "SELECT key, value FROM user_settings WHERE user_id = ?",
    args: [userId],
  });
  const map: Record<string, string> = {};
  for (const row of result.rows) {
    const value = row.value as string | null;
    if (value?.trim()) map[row.key as string] = value;
  }
  return map;
}

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
