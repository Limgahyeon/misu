// 구글 캘린더 비밀 iCal 주소(ICS)에서 일정을 읽어온다.
// 최소 파서 — DTSTART/SUMMARY만 다루고, 반복 일정(RRULE)은 첫 회차만 인식한다.

export interface IcsEvent {
  title: string;
  at: string; // UTC "YYYY-MM-DD HH:MM:SS" (DB 비교 형식)
}

function toDbTime(d: Date): string {
  return d.toISOString().slice(0, 19).replace("T", " ");
}

// ICS 시각 파싱: 20260708T150000Z(UTC) / 20260708T150000(로컬=KST로 간주) / 20260708(종일)
function parseIcsDate(value: string, isUtc: boolean): Date | undefined {
  const m = value.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2}))?/);
  if (!m) return undefined;
  const [, y, mo, d, h = "0", mi = "0", s = "0"] = m;
  if (isUtc) {
    return new Date(
      Date.UTC(+y, +mo - 1, +d, +h, +mi, +s)
    );
  }
  // TZID 지정 또는 무지정 — 한국 사용자 기준 KST(-9h)로 UTC 변환
  return new Date(Date.UTC(+y, +mo - 1, +d, +h - 9, +mi, +s));
}

export async function fetchIcsEvents(url: string): Promise<IcsEvent[]> {
  const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
  if (!res.ok) throw new Error(`ics fetch failed: ${res.status}`);
  const text = await res.text();

  // 접힌 줄(연속 줄이 공백으로 시작) 펼치기
  const lines = text.replace(/\r\n[ \t]/g, "").split(/\r?\n/);

  const events: IcsEvent[] = [];
  let inEvent = false;
  let start: Date | undefined;
  let summary = "";

  for (const line of lines) {
    if (line === "BEGIN:VEVENT") {
      inEvent = true;
      start = undefined;
      summary = "";
    } else if (line === "END:VEVENT") {
      if (inEvent && start && summary) {
        events.push({ title: summary, at: toDbTime(start) });
      }
      inEvent = false;
    } else if (inEvent) {
      if (line.startsWith("DTSTART")) {
        const [prop, value] = line.split(":");
        start = parseIcsDate(value ?? "", prop.includes("Z") || (value ?? "").endsWith("Z"));
      } else if (line.startsWith("SUMMARY")) {
        summary = line.slice(line.indexOf(":") + 1).trim();
      }
    }
  }
  return events;
}
