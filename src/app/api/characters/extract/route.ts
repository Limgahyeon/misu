import Anthropic from "@anthropic-ai/sdk";
import { GoogleGenAI } from "@google/genai";
import { NextRequest } from "next/server";
import { addSnippets } from "@/lib/db";
import { embed } from "@/lib/embedding";
import { findCharacter } from "@/lib/resolve";

const gemini = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const anthropic = new Anthropic();

const EXTRACT_PROMPT = `이 이미지는 메신저(카카오톡 등) 대화 스크린샷입니다. 대화 내용을 추출해주세요.

규칙:
- 오른쪽 정렬 말풍선(화면 주인이 보낸 메시지)은 "나: "로, 왼쪽 말풍선(상대방)은 "그: "로 시작하는 줄로 출력한다.
- 말투를 그대로 보존한다: ㅋㅋ, ㅠㅠ, 이모티콘, 줄임말, 오타 습관까지 원문 그대로.
- 시간, 날짜, 이름, 읽음 표시 등 대화 내용이 아닌 것은 제외한다.
- 대화 순서대로 위에서 아래로 출력한다.
- 다른 설명 없이 대화만 출력한다.
- 대화를 찾을 수 없으면 NONE 한 단어만 출력한다.`;

// Gemini(무료)를 먼저 쓰고, 한도 초과 등으로 실패하면 haiku 비전으로 폴백
async function extractDialog(
  mimeType: string,
  base64: string
): Promise<string | undefined> {
  try {
    const result = await gemini.models.generateContent({
      model: "gemini-2.5-flash",
      config: { maxOutputTokens: 2048 },
      contents: [
        {
          role: "user",
          parts: [
            { inlineData: { mimeType, data: base64 } },
            { text: EXTRACT_PROMPT },
          ],
        },
      ],
    });
    const text = result.text?.trim();
    if (text) return text;
  } catch (err) {
    console.error("extract: gemini failed, trying haiku:", err);
  }
  try {
    const res = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 2048,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: {
                type: "base64",
                media_type: mimeType as
                  | "image/jpeg"
                  | "image/png"
                  | "image/gif"
                  | "image/webp",
                data: base64,
              },
            },
            { type: "text", text: EXTRACT_PROMPT },
          ],
        },
      ],
    });
    const block = res.content[0];
    return block?.type === "text" ? block.text.trim() : undefined;
  } catch (err) {
    console.error("extract: haiku failed:", err);
    return undefined;
  }
}

// 추출된 대화를 6줄 단위 조각으로 나눈다 (검색 단위)
function chunk(text: string): string[] {
  const lines = text.split("\n").filter((l) => l.trim());
  const chunks: string[] = [];
  for (let i = 0; i < lines.length; i += 6) {
    chunks.push(lines.slice(i, i + 6).join("\n"));
  }
  return chunks;
}

export async function POST(request: NextRequest) {
  const { image, characterId } = await request.json();
  const match =
    typeof image === "string" && image.length < 3_000_000
      ? image.match(/^data:(image\/[a-z+.-]+);base64,(.+)$/)
      : null;
  if (!match) {
    return Response.json({ error: "invalid image" }, { status: 400 });
  }

  const text = await extractDialog(match[1], match[2]);
  if (!text) {
    return Response.json({ error: "extract failed" }, { status: 502 });
  }
  if (text === "NONE") {
    return Response.json(
      { error: "no dialog found in image" },
      { status: 422 }
    );
  }

  // 캐릭터가 지정되면 말투 예시 저장소에 쌓는다 (임베딩과 함께)
  if (typeof characterId === "string" && (await findCharacter(characterId))) {
    try {
      const chunks = chunk(text);
      const vectors = await embed(chunks);
      await addSnippets(
        characterId,
        chunks.map((content, i) => ({ content, embedding: vectors[i] }))
      );
      return Response.json({ examples: text, saved: chunks.length });
    } catch (err) {
      // 임베딩이 실패해도 추출 결과는 살려서 돌려준다
      console.error("extract: embed/save failed:", err);
    }
  }

  return Response.json({ examples: text });
}
