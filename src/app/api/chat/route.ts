import Anthropic from "@anthropic-ai/sdk";
import { GoogleGenAI } from "@google/genai";
import { NextRequest } from "next/server";
import { getCharacter, Character } from "@/lib/characters";
import { addMessage, getMessages, resetConversation } from "@/lib/db";
import { buildSystemPrompt } from "@/lib/prompt";

const gemini = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const anthropic = new Anthropic();

const HISTORY_LIMIT = 40;

type History = { role: "user" | "assistant"; content: string }[];

async function* streamGemini(character: Character, history: History) {
  const stream = await gemini.models.generateContentStream({
    model: "gemini-2.5-flash",
    config: {
      systemInstruction: buildSystemPrompt(character),
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

async function* streamClaude(character: Character, history: History) {
  const stream = anthropic.messages.stream({
    model: "claude-sonnet-4-6",
    max_tokens: 1024,
    system: buildSystemPrompt(character),
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
  const character = characterId && getCharacter(characterId);
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
  const character = characterId && getCharacter(characterId);
  if (!character || typeof message !== "string" || !message.trim()) {
    return Response.json({ error: "invalid request" }, { status: 400 });
  }

  await addMessage(character.id, "user", message.trim());

  const history = (await getMessages(character.id))
    .slice(-HISTORY_LIMIT)
    .map((m) => ({ role: m.role, content: m.content }));

  const textStream =
    model === "claude"
      ? streamClaude(character, history)
      : streamGemini(character, history);

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
  const character = characterId && getCharacter(characterId);
  if (!character) {
    return Response.json({ error: "unknown character" }, { status: 404 });
  }
  await resetConversation(character.id);
  return Response.json({ ok: true });
}
