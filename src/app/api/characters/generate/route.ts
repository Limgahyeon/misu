import { GoogleGenAI, Type } from "@google/genai";
import { NextRequest } from "next/server";

const gemini = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export async function POST(request: NextRequest) {
  const { concept } = await request.json();
  if (typeof concept !== "string" || !concept.trim()) {
    return Response.json({ error: "concept is required" }, { status: 400 });
  }

  const result = await gemini.models.generateContent({
    model: "gemini-2.5-flash",
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          name: { type: Type.STRING, description: "한국식 남자 이름 (성+이름)" },
          age: { type: Type.INTEGER },
          job: { type: Type.STRING },
          emoji: { type: Type.STRING, description: "캐릭터를 상징하는 이모지 1개" },
          tagline: { type: Type.STRING, description: "설레는 한 줄 소개 (25자 이내)" },
          personality: { type: Type.STRING, description: "성격 상세 묘사 (3~4문장)" },
          speechStyle: { type: Type.STRING, description: "말투 묘사 (반말/존댓말, 특유의 표현)" },
          relationship: { type: Type.STRING, description: "유저(여자친구)와 만나서 사귀게 된 배경 (1~2문장)" },
          firstScene: {
            type: Type.STRING,
            description:
              "첫 만남 장면. 지문은 *별표*로 감싸고 대사와 섞은 웹소설 형식, 3~5문장",
          },
        },
        required: [
          "name",
          "age",
          "job",
          "emoji",
          "tagline",
          "personality",
          "speechStyle",
          "relationship",
          "firstScene",
        ],
      },
    },
    contents: `AI 연애 채팅 서비스의 남자친구 캐릭터를 만듭니다. 타겟은 10~30대 여성이고, 유저는 이 캐릭터의 여자친구가 되어 일상을 공유합니다.

유저가 원하는 컨셉: "${concept.trim()}"

이 컨셉을 매력적으로 살려 캐릭터 프로필을 JSON으로 생성하세요. 설레고 몰입감 있게, 클리셰라도 디테일은 구체적으로.`,
  });

  try {
    return Response.json(JSON.parse(result.text ?? ""));
  } catch {
    return Response.json({ error: "generation failed" }, { status: 502 });
  }
}
