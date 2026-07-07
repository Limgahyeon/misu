"use client";

import { useEffect, useState } from "react";

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

  useEffect(() => {
    const query = characterId ? `?characterId=${characterId}` : "";
    fetch(`/api/profile${query}`)
      .then((r) => r.json())
      .then((data) => {
        setProfile(data.profile ?? "");
        setFallback(data.fallback ?? "");
        setLoaded(true);
      });
  }, [characterId]);

  async function save() {
    if (saving) return;
    setSaving(true);
    await fetch("/api/profile", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ profile, characterId }),
    });
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
              : "예)\n이름/호칭: 지은 (지은아 라고 불러줘)\n나이: 26세, 마케터\n좋아하는 것: 매운 음식, 고양이, 발라드\n요즘 고민: 이직 준비 중"
          }
          className="mt-3 w-full resize-none rounded-2xl border border-rose-100 bg-white px-4 py-3 text-sm text-zinc-700 outline-none placeholder:text-zinc-400 focus:border-rose-300"
        />
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
