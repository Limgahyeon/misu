import { GoogleGenAI } from "@google/genai";
import { Character } from "./characters";
import { getMemory, getMessages, saveMemory } from "./db";

const gemini = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// 요약되지 않은 메시지가 이 개수를 넘으면 기억을 갱신한다
const SUMMARIZE_THRESHOLD = 24;
// 최근 메시지는 원문 그대로 프롬프트에 들어가므로 요약에서 제외
const KEEP_RECENT = 12;

export async function updateMemoryIfNeeded(
  character: Character
): Promise<void> {
  const [messages, memory] = await Promise.all([
    getMessages(character.id),
    getMemory(character.id),
  ]);

  const lastSummarizedId = memory?.last_message_id ?? 0;
  const unsummarized = messages.filter((m) => m.id > lastSummarizedId);
  if (unsummarized.length < SUMMARIZE_THRESHOLD) return;

  const toSummarize = unsummarized.slice(0, -KEEP_RECENT);
  if (toSummarize.length === 0) return;

  const transcript = toSummarize
    .map((m) => `${m.role === "user" ? "여자친구" : character.name}: ${m.content}`)
    .join("\n");

  const prompt = `AI 연애 채팅에서 '${character.name}'(남자친구)와 유저(여자친구)의 대화 기록을 요약합니다.
${memory ? `기존 기억:\n${memory.summary}\n\n` : ""}새 대화:
${transcript}

기존 기억과 새 대화를 합쳐 하나의 기억으로 갱신하세요. 다음을 반드시 보존합니다:
- 유저의 일상 사건, 고민, 취향, 인간관계 (구체적으로)
- 두 사람이 한 약속, 계획, 기념일
- 관계의 진전이나 감정 변화, 중요한 사건
- 유저의 호칭이나 별명

500자 이내의 간결한 목록 형태로, 요약문만 출력하세요.`;

  try {
    const result = await gemini.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
      config: { maxOutputTokens: 1024 },
    });
    const summary = result.text?.trim();
    if (summary) {
      await saveMemory(
        character.id,
        summary,
        toSummarize[toSummarize.length - 1].id
      );
    }
  } catch (err) {
    console.error("memory update failed:", err);
  }
}
