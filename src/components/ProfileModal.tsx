"use client";

import { useEffect, useState } from "react";
import { characters as presetCharacters } from "@/lib/characters";

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  const arr = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

// 내용 폼 — 모달(채팅방의 '이 채팅에서의 나')과 내 정보 탭(인라인) 양쪽에서 쓴다.
// inline이면 취소 버튼이 없고, 저장해도 닫히지 않고 완료 메시지만 보여준다.
export function ProfileForm({
  onClose,
  characterId,
  inline,
}: {
  onClose?: () => void;
  characterId?: string;
  inline?: boolean;
}) {
  const [profile, setProfile] = useState("");
  const [fallback, setFallback] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [icsUrl, setIcsUrl] = useState("");
  const [userName, setUserName] = useState("");
  const [fallbackName, setFallbackName] = useState("");
  const [partner, setPartner] = useState("");
  const [morningTime, setMorningTime] = useState("");
  const [anniversaries, setAnniversaries] = useState<
    { id: number; title: string; date: string; repeat: string }[]
  >([]);
  const [annivTitle, setAnnivTitle] = useState("");
  const [annivDate, setAnnivDate] = useState("");
  const [annivRepeat, setAnnivRepeat] = useState("yearly");
  const [allCharacters, setAllCharacters] = useState<
    { id: string; name: string }[]
  >([]);
  const [pushState, setPushState] = useState<"unknown" | "on" | "off" | "unsupported">(
    "unknown"
  );
  const [pushMsg, setPushMsg] = useState<string | null>(null);
  const [icsStatus, setIcsStatus] = useState<{
    ok: boolean;
    text: string;
  } | null>(null);

  useEffect(() => {
    const query = characterId ? `?characterId=${characterId}` : "";
    fetch(`/api/profile${query}`)
      .then((r) => r.json())
      .then((data) => {
        setProfile(data.profile ?? "");
        setFallback(data.fallback ?? "");
        if (characterId) {
          setUserName(data.name ?? "");
          setFallbackName(data.fallbackName ?? "");
        }
        setLoaded(true);
      });
    if (!characterId) {
      fetch("/api/settings")
        .then((r) => r.json())
        .then((data) => {
          setIcsUrl(data.ics_url ?? "");
          setUserName(data.user_name ?? "");
          setPartner(data.proactive_partner ?? "");
          setMorningTime(data.morning_time ?? "");
        });
      fetch("/api/anniversaries")
        .then((r) => r.json())
        .then((data) => setAnniversaries(data.anniversaries ?? []));
      fetch("/api/characters")
        .then((r) => r.json())
        .then((data) => {
          const custom = (data.characters ?? []).map(
            (c: { id: string; name: string }) => ({ id: c.id, name: c.name })
          );
          setAllCharacters([
            ...custom,
            ...presetCharacters.map((c) => ({ id: c.id, name: c.name })),
          ]);
        });
      if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
        setPushState("unsupported");
      } else {
        navigator.serviceWorker
          .register("/sw.js")
          .then((reg) => reg.pushManager.getSubscription())
          .then((sub) => setPushState(sub ? "on" : "off"))
          .catch(() => setPushState("off"));
      }
    }
  }, [characterId]);

  async function enablePush() {
    setPushMsg(null);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setPushMsg(
          "알림이 차단돼 있어요. 휴대폰 설정에서 misu(또는 브라우저)의 알림을 허용한 뒤 다시 눌러주세요."
        );
        return;
      }
      const reg = await navigator.serviceWorker.register("/sw.js");
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(
          process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? ""
        ),
      });
      await fetch("/api/push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sub.toJSON()),
      });
      setPushState("on");
      setPushMsg("이제 그가 먼저 보낸 톡이 알림으로 와요 💌");
    } catch {
      setPushState("off");
      setPushMsg(
        "알림 등록에 실패했어요. iPhone은 Safari 공유 → '홈 화면에 추가'로 설치한 misu에서만 켤 수 있어요."
      );
    }
  }

  async function disablePush() {
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await fetch("/api/push", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
        await sub.unsubscribe();
      }
      setPushState("off");
    } catch {
      /* 무시 */
    }
  }

  async function addAnniv() {
    if (!annivTitle.trim() || !annivDate) return;
    const res = await fetch("/api/anniversaries", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: annivTitle,
        date: annivDate,
        repeat: annivRepeat,
      }),
    });
    if (res.ok) {
      const data = await res.json();
      setAnniversaries(data.anniversaries ?? []);
      setAnnivTitle("");
      setAnnivDate("");
    }
  }

  async function removeAnniv(id: number) {
    await fetch(`/api/anniversaries?id=${id}`, { method: "DELETE" });
    setAnniversaries((prev) => prev.filter((a) => a.id !== id));
  }

  const REPEAT_LABEL: Record<string, string> = {
    yearly: "매년",
    monthly: "매월",
    dday: "디데이",
  };

  async function save() {
    if (saving) return;
    setSaving(true);
    setIcsStatus(null);
    await fetch("/api/profile", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        profile,
        characterId,
        name: characterId ? userName : undefined,
      }),
    });
    if (!characterId) {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ics_url: icsUrl,
          user_name: userName,
          proactive_partner: partner,
          morning_time: morningTime,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setIcsStatus({
          ok: false,
          text: data.error ?? "저장에 실패했어요. 잠시 뒤 다시 시도해주세요.",
        });
        setSaving(false);
        return;
      }
      if (typeof data.ics_synced === "number") {
        setIcsStatus({
          ok: true,
          text: `캘린더 연동 완료 💕 앞으로 7일 일정 ${data.ics_synced}개를 챙길게요`,
        });
        setSaving(false);
        if (!inline) setTimeout(() => onClose?.(), 1800);
        return;
      }
    }
    if (inline) {
      setSaving(false);
      setIcsStatus({ ok: true, text: "저장했어요 💕" });
      return;
    }
    onClose?.();
  }

  return (
      <div
        className={
          inline
            ? "w-full rounded-3xl border border-white/60 bg-white/95 p-5 shadow-xl"
            : "max-h-[85dvh] w-full max-w-sm overflow-y-auto rounded-3xl border border-white/60 bg-white/95 p-5 shadow-xl"
        }
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-base font-bold text-zinc-800">
          {characterId ? "이 채팅에서의 나 💌" : "내 정보 💌"}
        </h2>
        <p className="mt-1 text-xs text-zinc-500">
          {characterId
            ? "이 캐릭터와의 대화에서만 쓰는 내 설정이에요. 비워두면 기본 내 정보를 써요."
            : "여기 적은 내용을 그가 기억하고 대화에 반영해요."}
        </p>
        <input
          value={userName}
          onChange={(e) => setUserName(e.target.value)}
          maxLength={30}
          disabled={!loaded}
          placeholder={
            // 불러오는 동안은 비워둔다 — 로드 전후로 플레이스홀더가 바뀌며 깜빡이는 것 방지
            !loaded
              ? ""
              : characterId
                ? fallbackName
                  ? `이름 — 비워두면 "${fallbackName}"으로 불러요`
                  : "이름 (이 캐릭터가 이렇게 불러요)"
                : "이름 (그가 이렇게 불러요 — 예: 지은, 자기야)"
          }
          className="mt-3 w-full rounded-2xl border border-rose-100 bg-white px-4 py-3 text-sm text-zinc-700 outline-none placeholder:text-zinc-400 focus:border-rose-300"
        />
        {characterId && !userName && fallbackName && (
          <p className="mt-1 px-1 text-[11px] text-zinc-400">
            지금은 기본 이름 &quot;{fallbackName}&quot;으로 불러요
          </p>
        )}
        <textarea
          value={profile}
          onChange={(e) => setProfile(e.target.value)}
          rows={6}
          maxLength={2000}
          disabled={!loaded}
          placeholder={
            !loaded
              ? ""
              : characterId
                ? fallback
                  ? `비워두면 기본 내 정보를 사용:\n${fallback.slice(0, 120)}`
                  : "예)\n나이: 26세, 마케터\n좋아하는 것: 매운 음식, 고양이\n이 캐릭터 앞에서의 나: 회사에서와 달리 어리광 많은 편"
                : "예)\n나이: 26세, 마케터\n좋아하는 것: 매운 음식, 고양이, 발라드\n요즘 고민: 이직 준비 중"
          }
          className="mt-3 w-full resize-none rounded-2xl border border-rose-100 bg-white px-4 py-3 text-sm text-zinc-700 outline-none placeholder:text-zinc-400 focus:border-rose-300"
        />

        {!characterId && (
          <div className="mt-4 space-y-3 border-t border-zinc-100 pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-zinc-700">
                  🔔 먼저 연락 받기
                </p>
                <p className="text-[11px] text-zinc-400">
                  {pushState === "unsupported"
                    ? "이 브라우저는 알림을 지원하지 않아요 (iPhone은 홈 화면에 추가 후 가능)"
                    : "그가 먼저 보낸 톡과 일정 리마인드를 알림으로 받아요"}
                </p>
              </div>
              {pushState !== "unsupported" && (
                <button
                  type="button"
                  onClick={pushState === "on" ? disablePush : enablePush}
                  disabled={pushState === "unknown"}
                  className={`shrink-0 rounded-xl px-3 py-1.5 text-xs font-medium ${
                    pushState === "on"
                      ? "bg-emerald-100 text-emerald-600"
                      : "bg-rose-100 text-rose-500"
                  } disabled:opacity-40`}
                >
                  {pushState === "on" ? "켜짐 ✓" : "켜기"}
                </button>
              )}
            </div>
            {pushMsg && (
              <p className="mt-1.5 text-[11px] leading-relaxed text-rose-400">
                {pushMsg}
              </p>
            )}
            <div>
              <p className="text-sm font-semibold text-zinc-700">
                💘 먼저 연락하는 사람
              </p>
              <p className="text-[11px] text-zinc-400">
                선톡과 일정 리마인드를 누가 보낼지 정해요
              </p>
              <select
                value={partner}
                onChange={(e) => setPartner(e.target.value)}
                className="mt-2 w-full rounded-2xl border border-rose-100 bg-white px-4 py-2.5 text-sm text-zinc-700 outline-none focus:border-rose-300"
              >
                <option value="">최근에 대화한 사람 (자동)</option>
                {allCharacters.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-zinc-700">
                    ☀️ 모닝 브리핑
                  </p>
                  <p className="text-[11px] text-zinc-400">
                    매일 이 시간에 날씨·오늘 일정과 함께 아침 톡이 와요
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <input
                    type="time"
                    value={morningTime}
                    onChange={(e) => setMorningTime(e.target.value)}
                    className="rounded-xl border border-rose-100 bg-white px-2.5 py-1.5 text-sm text-zinc-700 outline-none focus:border-rose-300"
                  />
                  {morningTime && (
                    <button
                      type="button"
                      onClick={() => setMorningTime("")}
                      className="text-xs text-zinc-400 hover:text-rose-400"
                    >
                      끄기
                    </button>
                  )}
                </div>
              </div>
            </div>
            <div>
              <p className="text-sm font-semibold text-zinc-700">🎉 기념일</p>
              <p className="text-[11px] text-zinc-400">
                생일·사귄 날은 자정에, 월급날은 아침에 축하 톡이 와요.
                디데이는 100일 단위와 주년을 자동으로 챙겨요
              </p>
              {anniversaries.length > 0 && (
                <div className="mt-2 space-y-1.5">
                  {anniversaries.map((a) => (
                    <div
                      key={a.id}
                      className="flex items-center gap-2 rounded-xl bg-rose-50/60 px-3 py-2"
                    >
                      <p className="min-w-0 flex-1 truncate text-xs text-zinc-600">
                        {a.title}
                        <span className="ml-1.5 text-zinc-400">
                          {a.date} · {REPEAT_LABEL[a.repeat] ?? a.repeat}
                        </span>
                      </p>
                      <button
                        type="button"
                        onClick={() => removeAnniv(a.id)}
                        className="shrink-0 text-zinc-300 hover:text-rose-400"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <div className="mt-2 space-y-2">
                <div className="flex gap-2">
                  <input
                    value={annivTitle}
                    onChange={(e) => setAnnivTitle(e.target.value)}
                    maxLength={50}
                    placeholder="예: 내 생일, 사귄 날, 월급날"
                    className="min-w-0 flex-1 rounded-xl border border-rose-100 bg-white px-3 py-2 text-xs text-zinc-700 outline-none placeholder:text-zinc-300 focus:border-rose-300"
                  />
                  <select
                    value={annivRepeat}
                    onChange={(e) => setAnnivRepeat(e.target.value)}
                    className="shrink-0 rounded-xl border border-rose-100 bg-white px-2 py-2 text-xs text-zinc-700 outline-none focus:border-rose-300"
                  >
                    <option value="yearly">매년</option>
                    <option value="monthly">매월</option>
                    <option value="dday">디데이</option>
                  </select>
                </div>
                <div className="flex gap-2">
                  <input
                    type="date"
                    value={annivDate}
                    onChange={(e) => setAnnivDate(e.target.value)}
                    className="min-w-0 flex-1 rounded-xl border border-rose-100 bg-white px-3 py-2 text-xs text-zinc-700 outline-none focus:border-rose-300"
                  />
                  <button
                    type="button"
                    onClick={addAnniv}
                    disabled={!annivTitle.trim() || !annivDate}
                    className="shrink-0 rounded-xl bg-rose-100 px-3 py-2 text-xs font-medium text-rose-500 disabled:opacity-40"
                  >
                    추가
                  </button>
                </div>
              </div>
            </div>
            <div>
              <p className="text-sm font-semibold text-zinc-700">
                📅 구글 캘린더 연동
              </p>
              <p className="text-[11px] text-zinc-400">
                구글 캘린더 → 내 캘린더 ⋮ → 설정 및 공유 → 맨 아래 &quot;iCal
                형식의 비밀 주소&quot;(…/private-…/basic.ics)를 붙여넣으면
                일정을 챙겨줘요
              </p>
              <input
                value={icsUrl}
                onChange={(e) => setIcsUrl(e.target.value)}
                placeholder="https://calendar.google.com/calendar/ical/…/private-…/basic.ics"
                className="mt-2 w-full rounded-2xl border border-rose-100 bg-white px-4 py-2.5 text-xs text-zinc-700 outline-none placeholder:text-zinc-300 focus:border-rose-300"
              />
              {icsStatus && (
                <p
                  className={`mt-1 px-1 text-[11px] ${
                    icsStatus.ok ? "text-emerald-600" : "text-rose-500"
                  }`}
                >
                  {icsStatus.text}
                </p>
              )}
            </div>
          </div>
        )}

        <div className="mt-3 flex gap-2">
          {!inline && (
            <button
              onClick={onClose}
              className="flex-1 rounded-2xl border border-zinc-200 py-2.5 text-sm text-zinc-500 hover:bg-zinc-50"
            >
              취소
            </button>
          )}
          <button
            onClick={save}
            disabled={saving || !loaded}
            className="flex-1 rounded-2xl bg-gradient-to-r from-rose-400 to-purple-400 py-2.5 text-sm font-medium text-white shadow-md shadow-rose-200/60 disabled:opacity-40"
          >
            {saving ? "저장 중..." : "저장"}
          </button>
        </div>
      </div>
  );
}

// 모달 래퍼 — 채팅방의 '이 채팅에서의 나'에서 쓴다
export default function ProfileModal({
  onClose,
  characterId,
}: {
  onClose: () => void;
  characterId?: string;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-900/30 px-6 backdrop-blur-sm"
      onClick={onClose}
    >
      <ProfileForm onClose={onClose} characterId={characterId} />
    </div>
  );
}
