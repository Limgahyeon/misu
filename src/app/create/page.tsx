"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { GRADIENTS } from "@/lib/characters";

const EMPTY = {
  name: "",
  age: "",
  job: "",
  emoji: "💜",
  tagline: "",
  personality: "",
  speechStyle: "",
  relationship: "",
  firstScene: "",
};

const inputCls =
  "w-full rounded-2xl border border-rose-100 bg-white/80 px-4 py-3 text-sm text-zinc-700 outline-none placeholder:text-zinc-400 focus:border-rose-300 focus:bg-white";

export default function CreatePage() {
  const router = useRouter();
  const [concept, setConcept] = useState("");
  const [form, setForm] = useState(EMPTY);
  const [gradient, setGradient] = useState(GRADIENTS[1]);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const set = (key: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  async function generate() {
    if (!concept.trim() || generating) return;
    setGenerating(true);
    setError("");
    try {
      const res = await fetch("/api/characters/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ concept }),
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setForm({
        name: data.name ?? "",
        age: String(data.age ?? ""),
        job: data.job ?? "",
        emoji: data.emoji ?? "💜",
        tagline: data.tagline ?? "",
        personality: data.personality ?? "",
        speechStyle: data.speechStyle ?? "",
        relationship: data.relationship ?? "",
        firstScene: data.firstScene ?? "",
      });
    } catch {
      setError("생성에 실패했어요. 다시 시도해주세요.");
    } finally {
      setGenerating(false);
    }
  }

  async function save() {
    if (saving) return;
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/characters", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, age: Number(form.age), gradient }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      router.push(`/chat/${data.id}`);
    } catch (e) {
      setError(
        e instanceof Error && e.message.includes("age")
          ? "나이는 19~99 사이 숫자로 입력해주세요."
          : "모든 항목을 채워주세요."
      );
      setSaving(false);
    }
  }

  return (
    <main className="mx-auto w-full max-w-md px-5 py-8">
      <header className="mb-6 flex items-center gap-3">
        <Link
          href="/"
          className="flex h-9 w-9 items-center justify-center rounded-full bg-white/70 text-zinc-500 shadow-sm backdrop-blur hover:text-zinc-700"
        >
          ←
        </Link>
        <div>
          <h1 className="text-xl font-bold text-zinc-800">나만의 그를 만들기</h1>
          <p className="text-xs text-zinc-500">상상 속 그 사람, 여기서 현실이 돼요</p>
        </div>
      </header>

      <section className="mb-6 rounded-3xl border border-white/60 bg-white/70 p-5 shadow-[0_8px_32px_rgba(236,72,153,0.10)] backdrop-blur-md">
        <label className="mb-2 block text-sm font-semibold text-zinc-700">
          ✨ 컨셉만 적으면 AI가 완성해줘요
        </label>
        <textarea
          value={concept}
          onChange={(e) => setConcept(e.target.value)}
          rows={2}
          placeholder="예) 무뚝뚝한데 나한테만 다정한 옆집 수의사 오빠"
          className={inputCls}
        />
        <button
          onClick={generate}
          disabled={generating || !concept.trim()}
          className="mt-3 w-full rounded-2xl bg-gradient-to-r from-rose-400 to-purple-400 py-3 text-sm font-semibold text-white shadow-lg shadow-rose-200/60 transition-opacity disabled:opacity-40"
        >
          {generating ? "그를 만들고 있어요..." : "AI로 자동 완성"}
        </button>
      </section>

      <section className="space-y-3 rounded-3xl border border-white/60 bg-white/70 p-5 shadow-[0_8px_32px_rgba(236,72,153,0.10)] backdrop-blur-md">
        <div className="flex gap-3">
          <input value={form.name} onChange={set("name")} placeholder="이름" className={inputCls} />
          <input
            value={form.age}
            onChange={set("age")}
            placeholder="나이"
            inputMode="numeric"
            className={`${inputCls} w-24`}
          />
        </div>
        <div className="flex gap-3">
          <input value={form.job} onChange={set("job")} placeholder="직업" className={inputCls} />
          <input
            value={form.emoji}
            onChange={set("emoji")}
            placeholder="이모지"
            className={`${inputCls} w-24 text-center`}
          />
        </div>
        <input value={form.tagline} onChange={set("tagline")} placeholder="한 줄 소개" className={inputCls} />
        <textarea value={form.personality} onChange={set("personality")} rows={3} placeholder="성격" className={inputCls} />
        <textarea value={form.speechStyle} onChange={set("speechStyle")} rows={2} placeholder="말투 (반말/존댓말, 특유의 표현)" className={inputCls} />
        <textarea value={form.relationship} onChange={set("relationship")} rows={2} placeholder="나와의 관계 (어떻게 만나 사귀게 됐는지)" className={inputCls} />
        <textarea value={form.firstScene} onChange={set("firstScene")} rows={4} placeholder="첫 장면 (*지문*과 대사를 섞어서)" className={inputCls} />

        <div>
          <p className="mb-2 text-xs font-medium text-zinc-500">프로필 색</p>
          <div className="flex gap-2">
            {GRADIENTS.map((g) => (
              <button
                key={g}
                onClick={() => setGradient(g)}
                className={`h-9 w-9 rounded-full bg-gradient-to-br ${g} transition-transform ${
                  gradient === g ? "scale-110 ring-2 ring-rose-300 ring-offset-2 ring-offset-white" : ""
                }`}
              />
            ))}
          </div>
        </div>

        {error && <p className="text-center text-xs text-rose-500">{error}</p>}

        <button
          onClick={save}
          disabled={saving}
          className="w-full rounded-2xl bg-gradient-to-r from-purple-400 to-rose-400 py-3.5 text-sm font-semibold text-white shadow-lg shadow-purple-200/60 transition-opacity disabled:opacity-40"
        >
          {saving ? "저장 중..." : "만나러 가기 💌"}
        </button>
      </section>
    </main>
  );
}
