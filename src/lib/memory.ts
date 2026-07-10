import Anthropic from "@anthropic-ai/sdk";
import { GoogleGenAI } from "@google/genai";
import { Character } from "./characters";
import { getMemory, getMessages, saveMemory } from "./db";

const gemini = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const anthropic = new Anthropic();

// 요약되지 않은 메시지가 이 개수를 넘으면 기억을 갱신한다
const SUMMARIZE_THRESHOLD = 24;
// 최근 메시지는 원문 그대로 프롬프트에 들어가므로 요약에서 제외
const KEEP_RECENT = 12;

// Gemini(무료)를 먼저 쓰고, 한도 초과 등으로 실패하면 haiku로 폴백.
// 기억 갱신이 조용히 실패하면 대화가 요약에도 히스토리에도 없이 증발하므로 폴백이 필수.
async function summarize(prompt: string): Promise<string | undefined> {
  try {
    const result = await gemini.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
      config: { maxOutputTokens: 4096 },
    });
    const text = result.text?.trim();
    if (text) return text;
  } catch (err) {
    console.error("memory: gemini summarize failed, trying haiku:", err);
  }
  try {
    const res = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 4096,
      messages: [{ role: "user", content: prompt }],
    });
    const block = res.content[0];
    return block?.type === "text" ? block.text.trim() : undefined;
  } catch (err) {
    console.error("memory: haiku summarize failed:", err);
    return undefined;
  }
}

export async function updateMemoryIfNeeded(
  userId: number,
  character: Character
): Promise<void> {
  const [messages, memory] = await Promise.all([
    getMessages(userId, character.id),
    getMemory(userId, character.id),
  ]);

  const lastSummarizedId = memory?.last_message_id ?? 0;
  const unsummarized = messages.filter((m) => m.id > lastSummarizedId);
  if (unsummarized.length < SUMMARIZE_THRESHOLD) return;

  const toSummarize = unsummarized.slice(0, -KEEP_RECENT);
  if (toSummarize.length === 0) return;

  const transcript = toSummarize
    .map((m) => `${m.role === "user" ? "유저" : character.name}: ${m.content}`)
    .join("\n");

  const prompt = `AI 채팅에서 '${character.name}'와 유저의 대화 기록을 장기 기억으로 정리합니다.
${memory ? `기존 기억:\n${memory.summary}\n\n` : ""}새 대화:
${transcript}

기존 기억과 새 대화를 합쳐 아래 형식으로 기억을 갱신하세요.

[유저 프로필] 호칭/별명, 나이, 직업, 취향, 인간관계, 성격 등 잘 바뀌지 않는 사실
[약속과 계획] 두 사람이 한 약속, 기념일, 앞으로 하기로 한 것
[관계] 관계의 진전, 감정 변화, 둘 사이의 중요한 사건이나 추억
[최근 흐름] 유저의 최근 일상 사건, 고민, 진행 중인 일

규칙:
- 기존 기억에 있는 사실을 함부로 버리지 않는다. 특히 [유저 프로필]과 [약속과 계획]은 유지하고 갱신만 한다.
- 분량이 넘치면 [최근 흐름]의 오래된 항목부터 압축한다.
- 전체 3000자 이내, 간결한 목록 형태로 기억 내용만 출력한다.`;

  const summary = await summarize(prompt);
  if (summary) {
    await saveMemory(
      userId,
      character.id,
      summary,
      toSummarize[toSummarize.length - 1].id
    );
  }
}
