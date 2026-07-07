"use client";

import { useEffect, useState } from "react";

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  const arr = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

export default function ProfileModal({
  onClose,
  characterId,
}: {
  onClose: () => void;
  characterId?: string;
}) {
  const [profile, setProfile] = useState("");
  const [fallback, setFallback] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [icsUrl, setIcsUrl] = useState("");
  const [userName, setUserName] = useState("");
  const [fallbackName, setFallbackName] = useState("");
  const [pushState, setPushState] = useState<"unknown" | "on" | "off" | "unsupported">(
    "unknown"
  );

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
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") return;
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
    } catch {
      setPushState("off");
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

  async function save() {
    if (saving) return;
    setSaving(true);
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
      await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ics_url: icsUrl, user_name: userName }),
      });
    }
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-900/30 px-6 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-3xl border border-white/60 bg-white/95 p-5 shadow-xl"
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
            characterId
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
            characterId
              ? fallback
                ? `비워두면 기본 내 정보를 사용:\n${fallback.slice(0, 120)}`
                : "예)\n이름/호칭: 지은\n역할: MUSE 소속 B급 가이드\n관계: 결속 파트너 후보로 배정됨"
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
            <div>
              <p className="text-sm font-semibold text-zinc-700">
                📅 구글 캘린더 연동
              </p>
              <p className="text-[11px] text-zinc-400">
                캘린더 설정 → 내 캘린더 → &quot;iCal 형식의 비밀 주소&quot;를
                붙여넣으면 일정을 챙겨줘요
              </p>
              <input
                value={icsUrl}
                onChange={(e) => setIcsUrl(e.target.value)}
                placeholder="https://calendar.google.com/calendar/ical/…/basic.ics"
                className="mt-2 w-full rounded-2xl border border-rose-100 bg-white px-4 py-2.5 text-xs text-zinc-700 outline-none placeholder:text-zinc-300 focus:border-rose-300"
              />
            </div>
          </div>
        )}

        <div className="mt-3 flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 rounded-2xl border border-zinc-200 py-2.5 text-sm text-zinc-500 hover:bg-zinc-50"
          >
            취소
          </button>
          <button
            onClick={save}
            disabled={saving || !loaded}
            className="flex-1 rounded-2xl bg-gradient-to-r from-rose-400 to-purple-400 py-2.5 text-sm font-medium text-white shadow-md shadow-rose-200/60 disabled:opacity-40"
          >
            {saving ? "저장 중..." : "저장"}
          </button>
        </div>
      </div>
    </div>
  );
}
