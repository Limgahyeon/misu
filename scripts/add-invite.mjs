// 1회용 초대 코드 발급/조회 스크립트 (카카오 가입 게이트)
// 발급: node scripts/add-invite.mjs <메모> [개수=1]   예) node scripts/add-invite.mjs 회사동료 3
// 조회: node scripts/add-invite.mjs --list
// 코드 평문은 발급 시 한 번만 출력된다 (DB엔 해시만 저장).
import { createClient } from "@libsql/client";
import { createHash, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";

// .env.local 로드
for (const line of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}

const db = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

await db.execute(`CREATE TABLE IF NOT EXISTS invite_codes (
  code_hash TEXT PRIMARY KEY,
  note TEXT,
  used_by INTEGER,
  used_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
)`);

if (process.argv[2] === "--list") {
  const result = await db.execute(`
    SELECT i.note, i.used_by, i.used_at, i.created_at, u.name AS user_name
    FROM invite_codes i LEFT JOIN users u ON u.id = i.used_by
    ORDER BY i.created_at
  `);
  if (result.rows.length === 0) {
    console.log("발급된 초대 코드가 없어요.");
  }
  for (const row of result.rows) {
    const status = row.used_by
      ? `✔ 사용됨 → ${row.user_name ?? "?"} (${row.used_at})`
      : "○ 미사용";
    console.log(`${status}  메모: ${row.note ?? "-"}  발급: ${row.created_at}`);
  }
  process.exit(0);
}

const note = process.argv[2];
if (!note) {
  console.error("사용법: node scripts/add-invite.mjs <메모> [개수=1] | --list");
  process.exit(1);
}
const count = Math.max(1, Number(process.argv[3] ?? 1) || 1);

for (let i = 0; i < count; i++) {
  const code = randomBytes(4).toString("hex");
  const hash = createHash("sha256").update(code).digest("hex");
  await db.execute({
    sql: "INSERT INTO invite_codes (code_hash, note) VALUES (?, ?)",
    args: [hash, count > 1 ? `${note} ${i + 1}` : note],
  });
  console.log(`✅ 초대 코드: ${code}  (메모: ${count > 1 ? `${note} ${i + 1}` : note})`);
}
console.log("   코드는 지금만 보여요. 가입에 1번 쓰면 소멸됩니다.");
