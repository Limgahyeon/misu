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
          personality: {
            type: Type.STRING,
            description:
              "성격 상세 묘사 (8~12문장). 배경 서사, 습관, 좋아하는 것/싫어하는 것, 애정 표현 방식, 질투·갈등 상황에서의 반응, 귀여운 반전 포인트까지 구체적으로",
          },
          speechStyle: {
            type: Type.STRING,
            description:
              "말투 묘사 (3~5문장). 반말/존댓말, 호칭, 자주 쓰는 어미와 감탄사, ㅋㅋ/ㅠㅠ/이모지 사용 습관, 기분에 따라 말투가 어떻게 변하는지",
          },
          relationship: {
            type: Type.STRING,
            description: "유저(여자친구)와 만나서 사귀게 된 배경 스토리 (3~4문장)",
          },
          firstScene: {
            type: Type.STRING,
            description:
              "캐릭터가 여자친구에게 보내는 첫 카카오톡. 지문·별표 없이 문자 메시지만. 2~4개의 짧은 메시지를 줄바꿈으로 구분",
          },
          dialogExamples: {
            type: Type.STRING,
            description:
              "이 캐릭터가 보내는 카톡 예시 6개. 각 예시는 '(상황)' 한 줄 + 문자 메시지 1~4줄. 상황은 아침 인사/자기 일상 공유/여자친구가 힘들 때/질투/애정 표현/밤 인사로 다양하게. 예시 사이는 빈 줄로 구분. 지문·별표 금지",
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
          "dialogExamples",
        ],
      },
    },
    contents: `AI 연애 채팅 서비스의 남자친구 캐릭터를 만듭니다. 타겟은 10~30대 여성이고, 유저는 이 캐릭터의 여자친구가 되어 일상을 공유합니다.

유저가 원하는 컨셉: "${concept.trim()}"

이 컨셉을 매력적으로 살려 캐릭터 프로필을 JSON으로 생성하세요. 설레고 몰입감 있게, 클리셰라도 디테일은 구체적으로. 대화는 실제 카카오톡 문자처럼 — 지문이나 *별표* 묘사 없이 문자 메시지만.`,
  });

  try {
    return Response.json(JSON.parse(result.text ?? ""));
  } catch {
    return Response.json({ error: "generation failed" }, { status: 502 });
  }
}
