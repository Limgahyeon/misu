import { GoogleGenAI } from "@google/genai";

const gemini = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export async function embed(texts: string[]): Promise<number[][]> {
  const res = await gemini.models.embedContent({
    model: "gemini-embedding-001",
    contents: texts,
    config: { outputDimensionality: 768 },
  });
  return (res.embeddings ?? []).map((e) => e.values ?? []);
}

// 임베딩 API가 안 될 때의 폴백 유사도 — 문자 2-gram Dice 계수 (0~1).
// 임베딩 없이 저장된 스니펫(embedding=[])도 검색에 걸리게 한다.
export function lexicalOverlap(a: string, b: string): number {
  const grams = (t: string) => {
    const s = new Set<string>();
    const x = t.replace(/\s+/g, "");
    for (let i = 0; i < x.length - 1; i++) s.add(x.slice(i, i + 2));
    return s;
  };
  const ga = grams(a);
  const gb = grams(b);
  if (ga.size === 0 || gb.size === 0) return 0;
  let inter = 0;
  for (const g of ga) if (gb.has(g)) inter++;
  return (2 * inter) / (ga.size + gb.size);
}

export function cosine(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) || 1);
}
