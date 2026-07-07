import { GoogleGenAI } from "@google/genai";
import { NextRequest } from "next/server";
import { addSnippets } from "@/lib/db";
import { embed } from "@/lib/embedding";
import { findCharacter } from "@/lib/resolve";

const gemini = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

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

  const result = await gemini.models.generateContent({
    model: "gemini-2.5-flash",
    config: { maxOutputTokens: 2048 },
    contents: [
      {
        role: "user",
        parts: [
          { inlineData: { mimeType: match[1], data: match[2] } },
          {
            text: `이 이미지는 메신저(카카오톡 등) 대화 스크린샷입니다. 대화 내용을 추출해주세요.

규칙:
- 오른쪽 정렬 말풍선(화면 주인이 보낸 메시지)은 "나: "로, 왼쪽 말풍선(상대방)은 "그: "로 시작하는 줄로 출력한다.
- 말투를 그대로 보존한다: ㅋㅋ, ㅠㅠ, 이모티콘, 줄임말, 오타 습관까지 원문 그대로.
- 시간, 날짜, 이름, 읽음 표시 등 대화 내용이 아닌 것은 제외한다.
- 대화 순서대로 위에서 아래로 출력한다.
- 다른 설명 없이 대화만 출력한다.
- 대화를 찾을 수 없으면 NONE 한 단어만 출력한다.`,
          },
        ],
      },
    ],
  });

  const text = result.text?.trim();
  if (!text || text === "NONE") {
    return Response.json(
      { error: "no dialog found in image" },
      { status: 422 }
    );
  }

  // 캐릭터가 지정되면 말투 예시 저장소에 쌓는다 (임베딩과 함께)
  if (typeof characterId === "string" && (await findCharacter(characterId))) {
    const chunks = chunk(text);
    const vectors = await embed(chunks);
    await addSnippets(
      characterId,
      chunks.map((content, i) => ({ content, embedding: vectors[i] }))
    );
    return Response.json({ examples: text, saved: chunks.length });
  }

  return Response.json({ examples: text });
}
