"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { Character, GRADIENTS } from "@/lib/characters";

async function fileToDataUrl(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = reject;
      el.src = url;
    });
    const size = 512;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d")!;
    // 정사각형 중앙 크롭 후 512px로 리사이즈
    const sw = Math.min(img.width, img.height);
    ctx.drawImage(
      img,
      (img.width - sw) / 2,
      (img.height - sw) / 2,
      sw,
      sw,
      0,
      0,
      size,
      size
    );
    return canvas.toDataURL("image/jpeg", 0.85);
  } finally {
    URL.revokeObjectURL(url);
  }
}

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

function CreateForm() {
  const router = useRouter();
  const editId = useSearchParams().get("edit");
  const [concept, setConcept] = useState("");
  const [form, setForm] = useState(EMPTY);
  const [gradient, setGradient] = useState(GRADIENTS[1]);
  const [avatar, setAvatar] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!editId) return;
    fetch("/api/characters")
      .then((r) => r.json())
      .then((data) => {
        const c = (data.characters as Character[] | undefined)?.find(
          (x) => x.id === editId
        );
        if (!c) {
          setError("수정할 캐릭터를 찾지 못했어요.");
          return;
        }
        setForm({
          name: c.name,
          age: String(c.age),
          job: c.job,
          emoji: c.emoji,
          tagline: c.tagline,
          personality: c.personality,
          speechStyle: c.speechStyle,
          relationship: c.relationship,
          firstScene: c.firstScene,
        });
        setGradient(c.gradient);
        setAvatar(c.avatar ?? "");
      });
  }, [editId]);

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
        method: editId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          id: editId ?? undefined,
          age: Number(form.age),
          gradient,
          avatar: avatar || undefined,
        }),
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
          <h1 className="text-xl font-bold text-zinc-800">
            {editId ? "그를 다듬기" : "나만의 그를 만들기"}
          </h1>
          <p className="text-xs text-zinc-500">
            {editId
              ? "바꾸고 싶은 부분만 고치고 저장하세요"
              : "상상 속 그 사람, 여기서 현실이 돼요"}
          </p>
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
        <div className="flex flex-col items-center gap-2 pb-1">
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (!file) return;
              try {
                setAvatar(await fileToDataUrl(file));
              } catch {
                setError("사진을 불러오지 못했어요. 다른 사진으로 시도해주세요.");
              }
            }}
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className={`relative flex h-24 w-24 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br ${gradient} text-3xl shadow-inner ring-2 ring-white transition-transform hover:scale-105`}
          >
            {avatar ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={avatar}
                alt="프로필 사진"
                className="h-full w-full object-cover"
              />
            ) : (
              <span>{form.emoji || "📷"}</span>
            )}
          </button>
          <div className="flex items-center gap-2 text-xs">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="text-zinc-500 underline-offset-2 hover:text-zinc-700 hover:underline"
            >
              {avatar ? "사진 바꾸기" : "프로필 사진 올리기"}
            </button>
            {avatar && (
              <button
                type="button"
                onClick={() => setAvatar("")}
                className="text-rose-400 hover:text-rose-500"
              >
                삭제
              </button>
            )}
          </div>
        </div>
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
          {saving ? "저장 중..." : editId ? "수정 저장하기 💾" : "만나러 가기 💌"}
        </button>
      </section>
    </main>
  );
}

export default function CreatePage() {
  return (
    <Suspense>
      <CreateForm />
    </Suspense>
  );
}
