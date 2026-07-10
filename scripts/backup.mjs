// 실서비스 DB 전체를 로컬 JSON으로 덤프한다 — 데이터 사고 대비 수동 백업.
// 사용법: node scripts/backup.mjs
// 결과: backups/misu-backup-YYYYMMDD-HHMM.json (git에 올라가지 않음 — 사적 대화 포함)
import { createClient } from "@libsql/client";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

for (const line of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}

const db = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

const TABLES = [
  "users",
  "messages",
  "characters",
  "dialog_snippets",
  "push_subscriptions",
  "appointments",
  "anniversaries",
  "user_profiles",
  "user_memories",
  "user_character_profiles",
  "user_settings",
  "user_read_state",
];

const dump = { backed_up_at: new Date().toISOString(), tables: {} };
for (const t of TABLES) {
  const result = await db.execute(`SELECT * FROM ${t}`);
  dump.tables[t] = result.rows;
  console.log(`${t}: ${result.rows.length}행`);
}

const stamp = new Date()
  .toISOString()
  .slice(0, 16)
  .replace(/[-:]/g, "")
  .replace("T", "-");
const dir = new URL("../backups/", import.meta.url);
mkdirSync(dir, { recursive: true });
const file = new URL(`misu-backup-${stamp}.json`, dir);
writeFileSync(file, JSON.stringify(dump));
console.log(`\n✅ 백업 완료: backups/misu-backup-${stamp}.json`);
console.log("   (git에 올라가지 않는 폴더예요. 가끔 클라우드 드라이브에도 복사해두면 더 안전)");
