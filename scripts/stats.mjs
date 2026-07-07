// 유저별 활동 통계 — 리텐션 확인용
// 사용법: node scripts/stats.mjs
import { createClient } from "@libsql/client";
import { readFileSync } from "node:fs";

for (const line of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}

const db = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

const users = await db.execute("SELECT id, name, created_at FROM users ORDER BY id");

console.log("=== misu 유저 활동 통계 ===\n");
for (const u of users.rows) {
  // 유저가 보낸 메시지만 집계 (role='user')
  const stats = await db.execute({
    sql: `SELECT
        COUNT(*) AS total,
        MAX(created_at) AS last_at,
        COUNT(DISTINCT date(created_at, '+9 hours')) AS active_days,
        SUM(CASE WHEN created_at >= datetime('now', '-7 days') THEN 1 ELSE 0 END) AS last7d,
        COUNT(DISTINCT CASE WHEN created_at >= datetime('now', '-7 days') THEN date(created_at, '+9 hours') END) AS active_days_7d
      FROM messages WHERE user_id = ? AND role = 'user'`,
    args: [u.id],
  });
  const s = stats.rows[0];
  const last = s.last_at
    ? new Date(s.last_at.replace(" ", "T") + "Z").toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })
    : "없음";
  console.log(`👤 ${u.name} (id ${u.id}, 가입 ${u.created_at.slice(0, 10)})`);
  console.log(`   총 메시지 ${s.total}개 · 활동일 ${s.active_days}일 · 최근 7일 ${s.last7d}개(${s.active_days_7d}일 활동)`);
  console.log(`   마지막 활동: ${last}\n`);
}

// 최근 14일 날짜별 활성 유저(DAU)
const dau = await db.execute(`
  SELECT date(created_at, '+9 hours') AS day, COUNT(DISTINCT user_id) AS dau, COUNT(*) AS msgs
  FROM messages WHERE role = 'user' AND created_at >= datetime('now', '-14 days')
  GROUP BY day ORDER BY day DESC
`);
console.log("=== 최근 14일 DAU ===");
for (const r of dau.rows) {
  console.log(`${r.day}  활성 ${r.dau}명 · 메시지 ${r.msgs}개`);
}
