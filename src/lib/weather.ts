// IP 기반 위치(Vercel 헤더)와 Open-Meteo(무료·키 불필요)로 현재 날씨를 가져온다.
// 같은 좌표는 30분간 캐시해서 매 메시지마다 API를 부르지 않는다.

const WMO_DESC: Record<number, string> = {
  0: "맑음",
  1: "대체로 맑음",
  2: "구름 조금",
  3: "흐림",
  45: "안개",
  48: "안개",
  51: "이슬비",
  53: "이슬비",
  55: "이슬비",
  56: "얼어붙는 이슬비",
  57: "얼어붙는 이슬비",
  61: "약한 비",
  63: "비",
  65: "강한 비",
  66: "얼어붙는 비",
  67: "얼어붙는 비",
  71: "약한 눈",
  73: "눈",
  75: "폭설",
  77: "싸락눈",
  80: "소나기",
  81: "소나기",
  82: "강한 소나기",
  85: "눈 날림",
  86: "눈 날림",
  95: "뇌우",
  96: "우박 동반 뇌우",
  99: "우박 동반 뇌우",
};

const cache = new Map<string, { text: string; at: number }>();
const TTL_MS = 30 * 60 * 1000;

export async function getWeather(
  lat: string,
  lon: string,
  city?: string,
  // 채팅은 짧게(응답 지연 방지), 백그라운드 작업(모닝 브리핑 등)은 넉넉하게 + 재시도
  opts?: { timeoutMs?: number; retries?: number }
): Promise<string | undefined> {
  const key = `${lat},${lon}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.text;

  const timeoutMs = opts?.timeoutMs ?? 1500;
  const retries = opts?.retries ?? 0;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const url =
        `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
        "&current=temperature_2m,apparent_temperature,weather_code&timezone=Asia%2FSeoul";
      const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
      if (!res.ok) continue;
      const data = await res.json();
      const cur = data.current;
      const desc = WMO_DESC[cur.weather_code as number] ?? "";
      const temp = Math.round(cur.temperature_2m);
      const feels = Math.round(cur.apparent_temperature);
      const text = `${city ? `${city} 기준 ` : ""}${desc} ${temp}°C${
        feels !== temp ? ` (체감 ${feels}°C)` : ""
      }`;
      cache.set(key, { text, at: Date.now() });
      return text;
    } catch {
      // 다음 시도로 — 날씨는 부가 정보라 최종 실패해도 진행
    }
  }
  return hit?.text;
}
