"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { stripTimeMeta } from "@/lib/text";

interface CachedChat {
  name: string;
  emoji: string;
  gradient: string;
  job: string;
  kakao: boolean;
  messages: { role: "user" | "assistant"; content: string }[];
}

function Rich({ text }: { text: string }) {
  const parts = text.split(/(\*[^*]+\*)/g).filter(Boolean);
  return (
    <>
      {parts.map((part, i) =>
        part.startsWith("*") && part.endsWith("*") ? (
          <span key={i} className="italic text-purple-400/90">
            {part.slice(1, -1)}
          </span>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </>
  );
}

// 서버가 준비되는 동안 마지막 방문 때 저장한 대화 스냅샷을 즉시 보여준다
export default function Loading() {
  const pathname = usePathname();
  const [cached, setCached] = useState<CachedChat | null>(null);

  useEffect(() => {
    const id = pathname?.split("/").pop();
    if (!id) return;
    try {
      const raw = localStorage.getItem(`misu-chat-cache-${id}`);
      if (raw) setCached(JSON.parse(raw));
    } catch {
      /* 캐시 없음 */
    }
  }, [pathname]);

  if (!cached) {
    return (
      <div className="fixed inset-x-0 top-0 mx-auto flex h-dvh w-full max-w-md flex-col">
        <header className="flex items-center gap-3 border-b border-white/60 bg-white/60 px-4 py-3 backdrop-blur-md">
          <div className="h-9 w-9 animate-pulse rounded-full bg-white/80" />
          <div className="h-4 w-20 animate-pulse rounded bg-white/80" />
        </header>
        <div className="flex-1 space-y-4 px-4 py-5">
          <div className="h-14 w-2/3 animate-pulse rounded-3xl bg-white/60" />
          <div className="ml-auto h-10 w-1/2 animate-pulse rounded-3xl bg-rose-100/70" />
          <div className="h-14 w-3/5 animate-pulse rounded-3xl bg-white/60" />
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-x-0 top-0 mx-auto flex h-dvh w-full max-w-md flex-col">
      <header className="flex items-center gap-3 border-b border-white/60 bg-white/60 px-4 py-3 backdrop-blur-md">
        <span className="p-1 text-zinc-400">←</span>
        <div
          className={`flex h-9 w-9 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br ${cached.gradient} text-lg`}
        >
          {cached.emoji}
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-semibold leading-tight text-zinc-800">
            {cached.name}
          </div>
          <div className="text-xs text-zinc-400">{cached.job}</div>
        </div>
      </header>

      <div className="flex flex-1 flex-col justify-end space-y-4 overflow-hidden px-4 py-5">
        {cached.messages.slice(-12).map((m, i) => {
          if (m.role === "user") {
            return (
              <div key={i} className="flex justify-end">
                <div className="max-w-[80%] whitespace-pre-wrap rounded-3xl rounded-br-lg bg-gradient-to-br from-rose-400 to-pink-400 px-4 py-2.5 text-sm leading-relaxed text-white shadow-md shadow-rose-200/60">
                  {m.content}
                </div>
              </div>
            );
          }
          const clean = stripTimeMeta(m.content);
          const parts = cached.kakao
            ? clean.split(/\n+/).filter((p) => p.trim())
            : [clean];
          return (
            <div key={i} className="flex gap-2">
              <div
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br ${cached.gradient} text-sm`}
              >
                {cached.emoji}
              </div>
              <div className="flex min-w-0 flex-col gap-1">
                <span className="px-1 text-[11px] text-zinc-500">
                  {cached.name}
                </span>
                {parts.map((part, j) => (
                  <div key={j} className="flex items-end">
                    <div className="max-w-full whitespace-pre-wrap rounded-3xl rounded-bl-lg border border-white/70 bg-white/80 px-4 py-2.5 text-sm leading-relaxed text-zinc-700 shadow-sm backdrop-blur">
                      <Rich text={part} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex items-end gap-2 bg-white/60 px-4 py-3 backdrop-blur-md">
        <div className="max-h-32 flex-1 rounded-2xl border border-rose-100 bg-white/90 px-4 py-2.5 text-sm text-zinc-400">
          메시지 입력
        </div>
        <div className="rounded-2xl bg-gradient-to-r from-rose-400 to-pink-400 px-4 py-2.5 text-sm font-medium text-white opacity-40">
          전송
        </div>
      </div>
    </div>
  );
}
