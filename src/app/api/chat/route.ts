import Anthropic from "@anthropic-ai/sdk";
import { GoogleGenAI } from "@google/genai";
import { after, NextRequest } from "next/server";
import {
  addMessage,
  getCharacterProfile,
  getMemory,
  getMessages,
  getProfile,
  getRecentMessages,
  getSnippets,
  resetConversation,
} from "@/lib/db";
import { cosine, embed } from "@/lib/embedding";
import { updateMemoryIfNeeded } from "@/lib/memory";
import { buildSystemPrompt } from "@/lib/prompt";
import { findCharacter } from "@/lib/resolve";
import { stripTimeMeta } from "@/lib/text";
import { getWeather } from "@/lib/weather";

const gemini = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const anthropic = new Anthropic();

const HISTORY_LIMIT = 40;

type History = { role: "user" | "assistant"; content: string }[];

// DB의 UTC 시각("YYYY-MM-DD HH:MM:SS")을 "7/8 23:14" 같은 KST 표기로
function formatKst(createdAt: string): string {
  return new Date(createdAt.replace(" ", "T") + "Z").toLocaleString("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: false,
  });
}


const CLAUDE_MODELS: Record<string, string> = {
  claude: "claude-sonnet-4-6", // 이전 버전 클라이언트 호환
  haiku: "claude-haiku-4-5-20251001",
  sonnet: "claude-sonnet-4-6",
  opus: "claude-opus-4-7",
};

// Gemini 무료 한도 초과가 감지되면 한동안 시도 없이 바로 haiku로 직행
let geminiCooldownUntil = 0;
const GEMINI_COOLDOWN_MS = 30 * 60 * 1000;

// 지금 유저 메시지와 가장 비슷한 말투 예시 조각을 골라온다
async function retrieveExamples(
  characterId: string,
  query: string
): Promise<string | undefined> {
  try {
    const snippets = await getSnippets(characterId);
    if (snippets.length === 0 || !query) return undefined;
    const [qv] = await embed([query]);
    return snippets
      .map((s) => ({ s, score: cosine(qv, s.embedding) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 4)
      .map((x) => x.s.content)
      .join("\n");
  } catch {
    return undefined;
  }
}

async function* streamGemini(system: string, history: History) {
  const stream = await gemini.models.generateContentStream({
    model: "gemini-2.5-flash",
    config: {
      systemInstruction: system,
      maxOutputTokens: 1024,
    },
    contents: history.map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    })),
  });
  for await (const chunk of stream) {
    if (chunk.text) yield chunk.text;
  }
}

async function* streamClaude(model: string, system: string, history: History) {
  const stream = anthropic.messages.stream({
    model,
    max_tokens: 1024,
    system,
    messages: history,
  });
  for await (const event of stream) {
    if (
      event.type === "content_block_delta" &&
      event.delta.type === "text_delta"
    ) {
      yield event.delta.text;
    }
  }
}

export async function GET(request: NextRequest) {
  const characterId = request.nextUrl.searchParams.get("characterId");
  const character = characterId ? await findCharacter(characterId) : undefined;
  if (!character) {
    return Response.json({ error: "unknown character" }, { status: 404 });
  }

  let messages = await getMessages(character.id);
  if (messages.length === 0) {
    await addMessage(character.id, "assistant", character.firstScene);
    messages = await getMessages(character.id);
  }
  return Response.json({ messages });
}

export async function POST(request: NextRequest) {
  const { characterId, message, model, kakaoMode } = await request.json();
  const character = characterId
    ? await findCharacter(characterId)
    : undefined;
  if (!character || typeof message !== "string" || !message.trim()) {
    return Response.json({ error: "invalid request" }, { status: 400 });
  }

  await addMessage(character.id, "user", message.trim());

  // IP 기반 위치 (Vercel 헤더). 로컬 dev 등 헤더가 없으면 서울로 폴백
  const lat = request.headers.get("x-vercel-ip-latitude") ?? "37.5665";
  const lon = request.headers.get("x-vercel-ip-longitude") ?? "126.978";
  const rawCity = request.headers.get("x-vercel-ip-city");
  const city = rawCity ? decodeURIComponent(rawCity) : undefined;

  // 필요한 조회를 전부 병렬로 — 캐릭터 전용 유저 인포가 있으면 그걸, 없으면 기본 내 정보
  const [messages, memory, profile, weather, examples] = await Promise.all([
    getRecentMessages(character.id, HISTORY_LIMIT + 20),
    getMemory(character.id),
    getCharacterProfile(character.id).then(
      async (p) => p ?? (await getProfile())
    ),
    getWeather(lat, lon, city),
    retrieveExamples(character.id, message.trim()),
  ]);
  const recent = messages
    .filter((m) => m.id > (memory?.last_message_id ?? 0))
    .slice(-HISTORY_LIMIT);
  // 모델에 주는 히스토리의 유저 메시지에만 보낸 시각 메타데이터를 붙인다.
  // 캐릭터(assistant) 메시지에는 붙이지 않는다 — 모델이 형식을 따라 출력하는 것 방지
  const timed = recent.map((m) => ({
    role: m.role,
    content:
      m.role === "user"
        ? `[${formatKst(m.created_at)}] ${m.content}`
        : m.content,
  }));
  const system = buildSystemPrompt(
    character,
    memory?.summary,
    profile,
    examples,
    weather,
    !!kakaoMode
  );

  const claudeModel = CLAUDE_MODELS[model as string];
  const usingGemini = !claudeModel && Date.now() > geminiCooldownUntil;
  const textStream = usingGemini
    ? streamGemini(system, timed)
    : streamClaude(claudeModel ?? CLAUDE_MODELS.haiku, system, timed);

  const encoder = new TextEncoder();
  const body = new ReadableStream({
    async start(controller) {
      let full = "";
      const pump = async (stream: AsyncIterable<string>) => {
        for await (const text of stream) {
          full += text;
          controller.enqueue(encoder.encode(text));
        }
      };
      try {
        try {
          await pump(textStream);
        } catch (err) {
          // Gemini 무료 한도(429) 등으로 실패하면 haiku로 폴백
          if (full || !usingGemini) throw err;
          geminiCooldownUntil = Date.now() + GEMINI_COOLDOWN_MS;
          console.error("gemini failed, falling back to haiku:", err);
          await pump(streamClaude(CLAUDE_MODELS.haiku, system, timed));
        }
        if (full) {
          await addMessage(character.id, "assistant", stripTimeMeta(full));
        }
        controller.close();
        after(() => updateMemoryIfNeeded(character));
      } catch (err) {
        console.error("chat stream failed:", err);
        if (!full) {
          controller.enqueue(
            encoder.encode(
              "*(지금 답장이 잘 안 돼요… 잠시 뒤에 다시 말 걸어주세요 🥲)*"
            )
          );
        }
        controller.close();
      }
    },
  });

  return new Response(body, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}

export async function DELETE(request: NextRequest) {
  const characterId = request.nextUrl.searchParams.get("characterId");
  const character = characterId ? await findCharacter(characterId) : undefined;
  if (!character) {
    return Response.json({ error: "unknown character" }, { status: 404 });
  }
  await resetConversation(character.id);
  return Response.json({ ok: true });
}
