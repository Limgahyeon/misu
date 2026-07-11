import Anthropic from "@anthropic-ai/sdk";
import { GoogleGenAI } from "@google/genai";
import { after, NextRequest } from "next/server";
import { getUserIdFromRequest } from "@/lib/auth";
import {
  addMessage,
  countUserMessagesSince,
  getEffectiveProfile,
  getMemory,
  getMessagesBefore,
  getOrInitMessages,
  getRecentMessages,
  getSnippets,
  getUpcomingAppointments,
  markRead,
  resetConversation,
  saveSetting,
} from "@/lib/db";
import {
  DAILY_MESSAGE_LIMIT,
  kstDayStartUtc,
  OWNER_USER_ID,
} from "@/lib/limits";
import { cosine, embed } from "@/lib/embedding";
import { updateMemoryIfNeeded } from "@/lib/memory";
import { buildContextNote, buildSystemPrompt } from "@/lib/prompt";
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
    year: "numeric",
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

async function* streamGemini(system: string, history: History, note: string) {
  const stream = await gemini.models.generateContentStream({
    model: "gemini-2.5-flash",
    config: {
      systemInstruction: system,
      maxOutputTokens: 1024,
    },
    contents: history.map((m, i) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [
        {
          text:
            i === history.length - 1 ? `${m.content}\n\n${note}` : m.content,
        },
      ],
    })),
  });
  for await (const chunk of stream) {
    if (chunk.text) yield chunk.text;
  }
}

async function* streamClaude(
  model: string,
  system: string,
  history: History,
  note: string
) {
  // 프롬프트 캐싱: 브레이크포인트 2개.
  // ① 시스템(안정부) 끝 ② 직전 메시지 끝(과거 히스토리까지 캐시).
  // 변동 정보(note)는 최신 유저 메시지의 별도 블록 — 히스토리 재구성 시
  // 이 블록은 다시 안 붙으므로 과거 프리픽스의 바이트가 변하지 않는다.
  const messages: Anthropic.MessageParam[] = history.map((m, i) => {
    if (i === history.length - 1) {
      const blocks: Anthropic.TextBlockParam[] = [
        { type: "text", text: m.content },
      ];
      if (note) blocks.push({ type: "text", text: note });
      return { role: m.role, content: blocks };
    }
    if (i === history.length - 2) {
      return {
        role: m.role,
        content: [
          {
            type: "text" as const,
            text: m.content,
            cache_control: { type: "ephemeral" as const },
          },
        ],
      };
    }
    return { role: m.role, content: m.content };
  });

  const stream = anthropic.messages.stream({
    model,
    max_tokens: 1024,
    system: [
      { type: "text", text: system, cache_control: { type: "ephemeral" } },
    ],
    messages,
  });

  let usage: Record<string, number | null | undefined> = {};
  for await (const event of stream) {
    if (event.type === "message_start") {
      usage = { ...event.message.usage } as typeof usage;
    } else if (event.type === "message_delta") {
      usage.output_tokens = event.usage.output_tokens;
    } else if (
      event.type === "content_block_delta" &&
      event.delta.type === "text_delta"
    ) {
      yield event.delta.text;
    }
  }
  // 캐시 적중 검증용 — cache_read가 0이면 캐시가 안 걸리고 있다는 뜻
  console.log(
    `[usage] model=${model} in=${usage.input_tokens ?? "?"} cache_read=${
      usage.cache_read_input_tokens ?? 0
    } cache_write=${usage.cache_creation_input_tokens ?? 0} out=${
      usage.output_tokens ?? "?"
    }`
  );
}

export async function GET(request: NextRequest) {
  const userId = await getUserIdFromRequest(request);
  if (!userId) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const characterId = request.nextUrl.searchParams.get("characterId");
  const character = characterId
    ? await findCharacter(userId, characterId)
    : undefined;
  if (!character) {
    return Response.json({ error: "unknown character" }, { status: 404 });
  }

  // ?before=<id> — 위로 스크롤할 때 더 오래된 대화를 50개씩
  const before = Number(request.nextUrl.searchParams.get("before"));
  if (before > 0) {
    return Response.json({
      messages: await getMessagesBefore(userId, character.id, before, 50),
    });
  }

  return Response.json({
    messages: await getOrInitMessages(userId, character),
  });
}

export async function POST(request: NextRequest) {
  const userId = await getUserIdFromRequest(request);
  if (!userId) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const { characterId, message, model, kakaoMode } = await request.json();
  const character = characterId
    ? await findCharacter(userId, characterId)
    : undefined;
  if (!character || typeof message !== "string" || !message.trim()) {
    return Response.json({ error: "invalid request" }, { status: 400 });
  }

  // 비용 안전장치 — 친구 계정은 하루 한도. 한도 도달 시 메시지를 저장하지 않고
  // 안내 문구만 돌려준다 (스트리밍과 같은 text/plain이라 말풍선에 그대로 뜬다)
  if (userId !== OWNER_USER_ID) {
    const sentToday = await countUserMessagesSince(userId, kstDayStartUtc());
    if (sentToday >= DAILY_MESSAGE_LIMIT) {
      return new Response(
        "(오늘 나눌 수 있는 대화를 다 썼어요. 자정에 다시 채워져요 🌙 내일 만나요!)",
        { headers: { "Content-Type": "text/plain; charset=utf-8" } }
      );
    }
  }

  await addMessage(userId, character.id, "user", message.trim());

  // IP 기반 위치 (Vercel 헤더). 로컬 dev 등 헤더가 없으면 서울로 폴백
  const lat = request.headers.get("x-vercel-ip-latitude") ?? "37.5665";
  const lon = request.headers.get("x-vercel-ip-longitude") ?? "126.978";
  const rawCity = request.headers.get("x-vercel-ip-city");
  const city = rawCity ? decodeURIComponent(rawCity) : undefined;

  // 필요한 조회를 전부 병렬로 — 유저 인포는 이름 + 캐릭터별(없으면 기본)
  const [messages, memory, profile, weather, examples, appointments] =
    await Promise.all([
      getRecentMessages(userId, character.id, HISTORY_LIMIT + 20),
      getMemory(userId, character.id),
      getEffectiveProfile(userId, character.id),
      getWeather(lat, lon, city),
      retrieveExamples(character.id, message.trim()),
      getUpcomingAppointments(userId, 7 * 24),
    ]);
  const schedule =
    appointments.length > 0
      ? appointments
          .map((a) => {
            const d = new Date(a.at.replace(" ", "T") + "Z");
            return `- ${d.toLocaleString("ko-KR", {
              timeZone: "Asia/Seoul",
              month: "numeric",
              day: "numeric",
              weekday: "short",
              hour: "numeric",
              minute: "2-digit",
            })} — ${a.title}`;
          })
          .join("\n")
      : undefined;
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
    !!kakaoMode
  );
  const note = buildContextNote(weather, schedule, examples);

  // 친구 계정은 유료 모델 중 haiku만 (sonnet 요청은 조용히 haiku로)
  const requested = CLAUDE_MODELS[model as string];
  const claudeModel =
    requested && userId !== OWNER_USER_ID ? CLAUDE_MODELS.haiku : requested;
  const usingGemini = !claudeModel && Date.now() > geminiCooldownUntil;
  const textStream = usingGemini
    ? streamGemini(system, timed, note)
    : streamClaude(claudeModel ?? CLAUDE_MODELS.haiku, system, timed, note);

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
          await pump(streamClaude(CLAUDE_MODELS.haiku, system, timed, note));
        }
        if (full) {
          await addMessage(userId, character.id, "assistant", stripTimeMeta(full));
          // 대화 중이므로 방금 답장까지 읽음 처리
          await markRead(userId, character.id);
        }
        controller.close();
        after(() =>
          Promise.all([
            updateMemoryIfNeeded(userId, character),
            // 모닝 브리핑 날씨용 — 실제 위치 헤더가 있을 때만 저장
            rawCity
              ? saveSetting(userId, "geo", `${lat},${lon},${city ?? ""}`)
              : Promise.resolve(),
          ])
        );
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
  const userId = await getUserIdFromRequest(request);
  if (!userId) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const characterId = request.nextUrl.searchParams.get("characterId");
  const character = characterId
    ? await findCharacter(userId, characterId)
    : undefined;
  if (!character) {
    return Response.json({ error: "unknown character" }, { status: 404 });
  }
  await resetConversation(userId, character.id);
  return Response.json({ ok: true });
}
