// 유저(접속 코드) 추가 스크립트
// 사용법: node scripts/add-user.mjs <이름> [원하는코드]
// 코드를 생략하면 랜덤 코드를 만들어서 출력한다.
import { createClient } from "@libsql/client";
import { createHash, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";

// .env.local 로드
for (const line of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}

const name = process.argv[2];
if (!name) {
  console.error("사용법: node scripts/add-user.mjs <이름> [원하는코드]");
  process.exit(1);
}
const code = process.argv[3] ?? randomBytes(4).toString("hex");
const hash = createHash("sha256").update(code).digest("hex");

const db = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

await db.execute(`CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  code_hash TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
)`);

const result = await db.execute({
  sql: "INSERT INTO users (name, code_hash) VALUES (?, ?)",
  args: [name, hash],
});
console.log(`✅ 유저 추가됨 — id: ${result.lastInsertRowid}, 이름: ${name}`);
console.log(`   접속 코드: ${code}`);
console.log("   (코드는 지금만 보여요. 잊으면 다시 만들어야 함)");
