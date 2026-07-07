import Anthropic from "@anthropic-ai/sdk";
import { Character } from "./characters";
import { fetchIcsEvents } from "./calendar";
import {
  addAppointment,
  addMessage,
  clearIcsAppointments,
  getChatList,
  getEffectiveProfile,
  getMemory,
  getRecentMessages,
  getSetting,
  getUpcomingAppointments,
  listUsers,
  markReminded,
  saveSetting,
} from "./db";
import { sendPushToUser } from "./push";
import { findCharacter } from "./resolve";
import { stripTimeMeta } from "./text";

const anthropic = new Anthropic();

// 하루 최대 선톡 횟수 — 유저 설정(proactive_per_day)으로 조절, 기본 3
const DEFAULT_PER_DAY = 3;
// 선톡을 보낼 수 있는 KST 시간대 (아침~밤, 새벽 제외)
const ACTIVE_HOURS_KST: [number, number] = [9, 23];
// 유저가 이 시간(분) 안에 대화했으면 선톡하지 않는다
const IDLE_MINUTES = 90;
// 리마인더는 일정 이 시간(분) 전에 보낸다
const REMIND_BEFORE_MIN = 30;

async function generateShort(system: string, ask: string): Promise<string> {
  const res = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 300,
    system,
    messages: [{ role: "user", content: ask }],
  });
  const block = res.content[0];
  return block?.type === "text" ? stripTimeMeta(block.text.trim()) : "";
}

// 유저가 가장 최근에 대화한 캐릭터 = 그 유저의 '남친 겸 매니저'
async function currentPartner(userId: number): Promise<Character | undefined> {
  const list = await getChatList(userId);
  for (const row of list) {
    const c = await findCharacter(userId, row.character_id);
    if (c) return c;
  }
  return undefined;
}

function partnerSystem(c: Character, profile?: string, memory?: string): string {
  return `당신은 '${c.name}'(${c.age}세, ${c.job})입니다. 유저의 남자친구이자 일정을 챙겨주는 매니저 역할.
- 성격: ${c.personality}
- 말투: ${c.speechStyle}
${profile ? `- 유저 정보: ${profile}\n` : ""}${memory ? `- 기억: ${memory}\n` : ""}
카카오톡 문자처럼 짧게 씁니다. 지문(*별표*) 없이, 1~3개의 짧은 메시지를 줄바꿈으로 구분. 캐릭터 말투 그대로.`;
}

// 유저 메시지에 시간 표현이 있을 때만 LLM으로 약속을 추출한다 (비용 절약)
const TIME_HINT =
  /(\d{1,2}\s*시|\d{1,2}:\d{2}|내일|모레|글피|오늘|이번\s*주|다음\s*주|약속|예약|미팅|회의|면접|월요일|화요일|수요일|목요일|금요일|토요일|일요일|주말|오전|오후|저녁|아침|점심|밤)/;

export async function extractAppointmentIfAny(
  userId: number,
  userMessage: string
): Promise<void> {
  if (!TIME_HINT.test(userMessage)) return;
  const nowKst = new Date().toLocaleString("sv-SE", {
    timeZone: "Asia/Seoul",
  });
  try {
    const res = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 300,
      messages: [
        {
          role: "user",
          content: `현재 한국 시간: ${nowKst}
유저 메시지: "${userMessage}"

이 메시지에서 유저 본인의 확정된 약속/일정(구체적 날짜·시각이 특정 가능한 것)만 추출해 JSON 배열로 출력하세요.
형식: [{"title":"일정 이름","datetime":"YYYY-MM-DD HH:MM"}] (한국 시간 기준)
상대 표현(내일, 이번 주 금요일 등)은 현재 시간 기준으로 계산합니다. 과거이거나 시각이 불명확하면 제외. 없으면 [] 만 출력.`,
        },
      ],
    });
    const block = res.content[0];
    if (block?.type !== "text") return;
    const match = block.text.match(/\[[\s\S]*\]/);
    if (!match) return;
    const items = JSON.parse(match[0]) as { title?: string; datetime?: string }[];
    for (const it of items.slice(0, 3)) {
      if (!it.title || !it.datetime) continue;
      const utc = new Date(`${it.datetime.replace(" ", "T")}:00+09:00`);
      if (isNaN(utc.getTime()) || utc.getTime() < Date.now()) continue;
      await addAppointment(
        userId,
        it.title,
        utc.toISOString().slice(0, 19).replace("T", " "),
        "chat"
      );
    }
  } catch (err) {
    console.error("appointment extract failed:", err);
  }
}

// ICS 캘린더 동기화 — 앞으로 7일치 일정을 appointments에 반영
async function syncCalendarForUser(userId: number): Promise<void> {
  const url = await getSetting(userId, "ics_url");
  if (!url) return;
  try {
    const events = await fetchIcsEvents(url);
    const now = Date.now();
    const week = now + 7 * 24 * 60 * 60 * 1000;
    await clearIcsAppointments(userId);
    for (const e of events) {
      const t = new Date(e.at.replace(" ", "T") + "Z").getTime();
      if (t > now && t < week) {
        await addAppointment(userId, e.title, e.at, "ics");
      }
    }
  } catch (err) {
    console.error(`calendar sync failed (user ${userId}):`, err);
  }
}

// 다가온 일정 리마인더 — 30분 전 알림
async function checkRemindersForUser(userId: number): Promise<number> {
  const upcoming = await getUpcomingAppointments(userId, 2);
  let sent = 0;
  for (const a of upcoming) {
    if (a.reminded_at) continue;
    const minutesLeft = Math.round(
      (new Date(a.at.replace(" ", "T") + "Z").getTime() - Date.now()) / 60000
    );
    if (minutesLeft > REMIND_BEFORE_MIN) continue;

    const partner = await currentPartner(userId);
    let text = `곧 "${a.title}" 시간이야! ${minutesLeft}분 남았어. 준비됐어?`;
    if (partner) {
      const [profile, memory] = await Promise.all([
        getEffectiveProfile(userId, partner.id),
        getMemory(userId, partner.id),
      ]);
      try {
        const generated = await generateShort(
          partnerSystem(partner, profile, memory?.summary),
          `유저의 일정 "${a.title}"이 약 ${minutesLeft}분 뒤에 있어. 남친 겸 매니저로서 챙겨주는 리마인드 문자를 보내줘. 일정 이름과 남은 시간을 자연스럽게 언급할 것.`
        );
        if (generated) {
          text = generated;
          await addMessage(userId, partner.id, "assistant", generated);
        }
      } catch (err) {
        console.error("reminder generation failed:", err);
      }
    }

    await markReminded(a.id);
    await sendPushToUser(userId, {
      title: partner ? partner.name : "misu",
      body: text.split("\n")[0].slice(0, 120),
      url: partner ? `/chat/${partner.id}` : "/",
    });
    sent++;
  }
  return sent;
}

// 선톡 — 활동 시간대에, 유저가 조용할 때, 하루 한도 내에서 확률적으로.
// callsPerHour: 하트비트 호출 빈도 — 자주 호출될수록 회당 확률을 낮춰
// 하루 목표 횟수가 활동 시간대에 고르게 퍼지도록 한다.
async function maybeProactiveForUser(
  userId: number,
  callsPerHour: number
): Promise<boolean> {
  const partner = await currentPartner(userId);
  if (!partner) return false;

  const kstHour = Number(
    new Date().toLocaleString("en-US", {
      timeZone: "Asia/Seoul",
      hour: "numeric",
      hour12: false,
    })
  );
  if (kstHour < ACTIVE_HOURS_KST[0] || kstHour >= ACTIVE_HOURS_KST[1]) {
    return false;
  }

  // 하루 한도 체크 (KST 날짜 기준)
  const today = new Date().toLocaleDateString("sv-SE", {
    timeZone: "Asia/Seoul",
  });
  const stampRaw = await getSetting(userId, "proactive_stamp");
  const [stampDay, stampCount] = (stampRaw ?? "|0").split("|");
  const count = stampDay === today ? Number(stampCount) || 0 : 0;
  const perDay =
    Number(await getSetting(userId, "proactive_per_day")) || DEFAULT_PER_DAY;
  if (count >= perDay) return false;

  // 유저가 방금까지 대화 중이었으면 조용히
  const recent = await getRecentMessages(userId, partner.id, 1);
  const last = recent[0];
  if (last) {
    const idleMin =
      (Date.now() -
        new Date(last.created_at.replace(" ", "T") + "Z").getTime()) /
      60000;
    if (idleMin < IDLE_MINUTES) return false;
  }
  // 남은 횟수를 남은 활동 시간에 고르게 분산
  const hoursLeft = Math.max(1, ACTIVE_HOURS_KST[1] - kstHour);
  const p = Math.min(0.6, (perDay - count) / (hoursLeft * callsPerHour));
  if (Math.random() > p) return false;

  const [profile, memory, todaySchedule] = await Promise.all([
    getEffectiveProfile(userId, partner.id),
    getMemory(userId, partner.id),
    getUpcomingAppointments(userId, 16),
  ]);

  const scheduleNote =
    todaySchedule.length > 0
      ? `\n참고로 유저의 다가오는 일정: ${todaySchedule
          .map((a) => {
            const d = new Date(a.at.replace(" ", "T") + "Z");
            return `${a.title}(${d.toLocaleString("ko-KR", {
              timeZone: "Asia/Seoul",
              month: "numeric",
              day: "numeric",
              hour: "numeric",
              minute: "2-digit",
            })})`;
          })
          .join(", ")} — 자연스럽게 언급해도 좋다.`
      : "";

  try {
    const text = await generateShort(
      partnerSystem(partner, profile, memory?.summary),
      `지금 한국 시간 ${kstHour}시. 유저가 한동안 연락이 없다. 남자친구로서 네가 먼저 카톡을 보내는 상황이다. 시간대에 맞는 자연스러운 선톡을 보내줘. 매번 똑같은 인사 말고, 네 일상 얘기나 유저 걱정, 기억 속 근황 등으로 다양하게.${scheduleNote}`
    );
    if (!text) return false;

    await addMessage(userId, partner.id, "assistant", text);
    await saveSetting(userId, "proactive_stamp", `${today}|${count + 1}`);
    await sendPushToUser(userId, {
      title: partner.name,
      body: text.split("\n")[0].slice(0, 120),
      url: `/chat/${partner.id}`,
    });
    return true;
  } catch (err) {
    console.error("proactive failed:", err);
    return false;
  }
}

// 하트비트 — 전체 유저를 순회하며 캘린더 동기화 / 리마인더 / 선톡 처리
export async function runHeartbeat(
  wantProactive: boolean,
  callsPerHour: number
): Promise<{ reminders: number; proactive: number }> {
  const users = await listUsers();
  let reminders = 0;
  let proactive = 0;
  for (const user of users) {
    // 한 유저에서 나는 에러가 전체 하트비트를 실패시키지 않게
    try {
      await syncCalendarForUser(user.id);
      reminders += await checkRemindersForUser(user.id);
      if (
        wantProactive &&
        (await maybeProactiveForUser(user.id, callsPerHour))
      ) {
        proactive++;
      }
    } catch (err) {
      console.error(`heartbeat failed for user ${user.id}:`, err);
    }
  }
  return { reminders, proactive };
}
