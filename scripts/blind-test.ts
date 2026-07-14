// haiku vs sonnet 블라인드 비교 — 내 실제 대화의 최근 유저 턴들을 골라
// 두 모델의 답장을 나란히 생성한다. 어느 쪽이 어느 모델인지는 셔플되어
// scripts/blind-test-key.txt 에만 기록된다. 다 고른 뒤에 열어볼 것.
//
// 사용법: npx tsx scripts/blind-test.ts [characterId] [라운드수=5]
//   (characterId 생략 시 선톡 담당 → 최근 대화 캐릭터 순으로 자동 선택)
//
// 실DB를 읽기만 한다 (메시지 저장 안 함). 비용: 라운드당 haiku+sonnet 각 1회.
import { readFileSync, writeFileSync } from "node:fs";

for (const line of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}
process.env.MISU_PROD_DB = "1"; // 내 실제 대화로 테스트해야 의미가 있다

const OWNER_ID = 1;
const MODELS = {
  haiku: "claude-haiku-4-5-20251001",
  sonnet: "claude-sonnet-4-6",
};

async function main() {
  // env 세팅 후에 import해야 db가 실DB를 바라본다
  const { getRecentMessages, getMemory, getEffectiveProfile, getSettings, getChatList } =
    await import("../src/lib/db");
  const { findCharacter } = await import("../src/lib/resolve");
  const { buildSystemPrompt } = await import("../src/lib/prompt");
  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  const anthropic = new Anthropic();

  const argId = process.argv[2];
  const rounds = Number(process.argv[3]) || 5;

  let characterId = argId;
  if (!characterId) {
    const settings = await getSettings(OWNER_ID);
    characterId = settings["proactive_partner"];
  }
  if (!characterId) {
    const list = await getChatList(OWNER_ID);
    characterId = list[0]?.character_id;
  }
  const character = characterId
    ? await findCharacter(OWNER_ID, characterId)
    : undefined;
  if (!character) {
    console.error("캐릭터를 찾을 수 없어요:", characterId);
    process.exit(1);
  }

  const [memory, profile, recent] = await Promise.all([
    getMemory(OWNER_ID, character.id),
    getEffectiveProfile(OWNER_ID, character.id),
    getRecentMessages(OWNER_ID, character.id, 60),
  ]);
  const system = buildSystemPrompt(character, memory?.summary, profile);

  // 실서비스처럼 유저 메시지엔 [시각] 프리픽스
  const formatKst = (raw: string) =>
    new Date(raw.replace(" ", "T") + "Z").toLocaleString("ko-KR", {
      timeZone: "Asia/Seoul",
      month: "numeric",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  const timed = recent.map((m) => ({
    role: m.role as "user" | "assistant",
    content:
      m.role === "user" ? `[${formatKst(m.created_at)}] ${m.content}` : m.content,
  }));

  // 뒤에서부터 유저 턴 위치를 rounds개 고른다 (각각이 한 라운드의 '상황')
  const userTurnIdx: number[] = [];
  for (let i = timed.length - 1; i >= 0 && userTurnIdx.length < rounds; i--) {
    if (timed[i].role === "user") userTurnIdx.push(i);
  }
  userTurnIdx.reverse();
  if (userTurnIdx.length === 0) {
    console.error("이 캐릭터와의 유저 메시지가 없어요.");
    process.exit(1);
  }

  console.log(`\n=== 블라인드 테스트: ${character.name} · ${userTurnIdx.length}라운드 ===`);
  console.log(`(같은 상황에 대한 두 답장 중 어느 쪽이 더 '사람 같은지' 골라두세요)\n`);

  const key: string[] = [];
  for (let r = 0; r < userTurnIdx.length; r++) {
    const idx = userTurnIdx[r];
    const history = timed.slice(0, idx + 1);
    const situation = timed[idx].content.replace(/^\[[^\]]*\] /, "");

    const gen = async (model: string) => {
      const res = await anthropic.messages.create({
        model,
        max_tokens: 1024,
        system,
        messages: history,
      });
      const block = res.content[0];
      return block?.type === "text" ? block.text.trim() : "(응답 없음)";
    };
    const [haikuText, sonnetText] = await Promise.all([
      gen(MODELS.haiku),
      gen(MODELS.sonnet),
    ]);

    const haikuIsA = Math.random() < 0.5;
    const a = haikuIsA ? haikuText : sonnetText;
    const b = haikuIsA ? sonnetText : haikuText;
    key.push(`라운드 ${r + 1}: A=${haikuIsA ? "haiku" : "sonnet"}, B=${haikuIsA ? "sonnet" : "haiku"}`);

    console.log(`──────── 라운드 ${r + 1} ────────`);
    console.log(`내 메시지: ${situation}\n`);
    console.log(`[A]\n${a}\n`);
    console.log(`[B]\n${b}\n`);
  }

  const keyPath = new URL("./blind-test-key.txt", import.meta.url);
  writeFileSync(keyPath, key.join("\n") + "\n");
  console.log(`✅ 정답 키 저장: scripts/blind-test-key.txt — 다 고른 뒤에 열어보세요!`);
}

main().then(() => process.exit(0));
