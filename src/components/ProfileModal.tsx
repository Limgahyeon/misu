"use client";

import { useEffect, useState } from "react";

export default function ProfileModal({ onClose }: { onClose: () => void }) {
  const [profile, setProfile] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/profile")
      .then((r) => r.json())
      .then((data) => {
        setProfile(data.profile ?? "");
        setLoaded(true);
      });
  }, []);

  async function save() {
    if (saving) return;
    setSaving(true);
    await fetch("/api/profile", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ profile }),
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
        <h2 className="text-base font-bold text-zinc-800">내 정보 💌</h2>
        <p className="mt-1 text-xs text-zinc-500">
          여기 적은 내용을 그가 기억하고 대화에 반영해요.
        </p>
        <textarea
          value={profile}
          onChange={(e) => setProfile(e.target.value)}
          rows={6}
          maxLength={2000}
          disabled={!loaded}
          placeholder={"예)\n이름/호칭: 지은 (지은아 라고 불러줘)\n나이: 26세, 마케터\n좋아하는 것: 매운 음식, 고양이, 발라드\n요즘 고민: 이직 준비 중"}
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
