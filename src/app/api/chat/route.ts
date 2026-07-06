import Anthropic from "@anthropic-ai/sdk";
import { GoogleGenAI } from "@google/genai";
import { after, NextRequest } from "next/server";
import { Character } from "@/lib/characters";
import {
  addMessage,
  getMemory,
  getMessages,
  getProfile,
  resetConversation,
} from "@/lib/db";
import { updateMemoryIfNeeded } from "@/lib/memory";
import { buildSystemPrompt } from "@/lib/prompt";
import { findCharacter } from "@/lib/resolve";

const gemini = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const anthropic = new Anthropic();

const HISTORY_LIMIT = 40;

type History = { role: "user" | "assistant"; content: string }[];

const CLAUDE_MODELS: Record<string, string> = {
  claude: "claude-sonnet-4-6", // 이전 버전 클라이언트 호환
  haiku: "claude-haiku-4-5-20251001",
  sonnet: "claude-sonnet-4-6",
  opus: "claude-opus-4-7",
};

async function* streamGemini(
  character: Character,
  history: History,
  memory?: string,
  profile?: string
) {
  const stream = await gemini.models.generateContentStream({
    model: "gemini-2.5-flash",
    config: {
      systemInstruction: buildSystemPrompt(character, memory, profile),
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

async function* streamClaude(
  model: string,
  character: Character,
  history: History,
  memory?: string,
  profile?: string
) {
  const stream = anthropic.messages.stream({
    model,
    max_tokens: 1024,
    system: buildSystemPrompt(character, memory, profile),
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
  const { characterId, message, model } = await request.json();
  const character = characterId
    ? await findCharacter(characterId)
    : undefined;
  if (!character || typeof message !== "string" || !message.trim()) {
    return Response.json({ error: "invalid request" }, { status: 400 });
  }

  await addMessage(character.id, "user", message.trim());

  const [messages, memory, profile] = await Promise.all([
    getMessages(character.id),
    getMemory(character.id),
    getProfile(),
  ]);
  const history = messages
    .filter((m) => m.id > (memory?.last_message_id ?? 0))
    .slice(-HISTORY_LIMIT)
    .map((m) => ({ role: m.role, content: m.content }));

  const claudeModel = CLAUDE_MODELS[model as string];
  const textStream = claudeModel
    ? streamClaude(claudeModel, character, history, memory?.summary, profile)
    : streamGemini(character, history, memory?.summary, profile);

  const encoder = new TextEncoder();
  const body = new ReadableStream({
    async start(controller) {
      try {
        let full = "";
        for await (const text of textStream) {
          full += text;
          controller.enqueue(encoder.encode(text));
        }
        if (full) await addMessage(character.id, "assistant", full);
        controller.close();
        after(() => updateMemoryIfNeeded(character));
      } catch (err) {
        controller.error(err);
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
