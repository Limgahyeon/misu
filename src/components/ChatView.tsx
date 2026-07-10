"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { stripTimeMeta } from "@/lib/text";
import ProfileModal from "./ProfileModal";

interface CharacterInfo {
  id: string;
  name: string;
  emoji: string;
  gradient: string;
  job: string;
  avatar?: string;
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  createdAt?: string;
}

// DB의 UTC 시각("YYYY-MM-DD HH:MM:SS") 또는 ISO 문자열을 Date로
function parseTime(raw?: string): Date | undefined {
  if (!raw) return undefined;
  const iso = raw.includes("T") ? raw : raw.replace(" ", "T") + "Z";
  const d = new Date(iso);
  return isNaN(d.getTime()) ? undefined : d;
}

function timeLabel(raw?: string): string {
  const d = parseTime(raw);
  return d
    ? d.toLocaleTimeString("ko-KR", { hour: "numeric", minute: "2-digit" })
    : "";
}

function dateLabel(raw?: string): string {
  const d = parseTime(raw);
  return d
    ? d.toLocaleDateString("ko-KR", {
        year: "numeric",
        month: "long",
        day: "numeric",
        weekday: "long",
      })
    : "";
}

function RichText({ text }: { text: string }) {
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

type ModelId = "gemini" | "haiku" | "sonnet" | "opus";

const MODELS: { id: ModelId; label: string; badge?: string }[] = [
  { id: "gemini", label: "Gemini", badge: "무료" },
  { id: "haiku", label: "Haiku" },
  { id: "sonnet", label: "Sonnet" },
];

const MODEL_IDS = MODELS.map((m) => m.id) as string[];

export default function ChatView({
  character,
  initialMessages,
}: {
  character: CharacterInfo;
  initialMessages?: ChatMessage[];
}) {
  const [messages, setMessages] = useState<ChatMessage[]>(
    initialMessages ?? []
  );
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [loaded, setLoaded] = useState(!!initialMessages);
  const [model, setModel] = useState<ModelId>("haiku");
  const [kakaoMode, setKakaoMode] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [viewportHeight, setViewportHeight] = useState<number>();
  // 카톡 모드에서 마지막 답장을 말풍선 단위로 순차 등장시키기 위한 카운터
  const [revealed, setRevealed] = useState(0);
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const coarsePointer = useRef(false);
  const didInitialScroll = useRef(false);
  // 이번 세션에서 전송한 뒤 도착하는 답장에만 순차 등장을 적용
  const liveReveal = useRef(false);

  // 키보드 애니메이션이 끝날 때까지 여러 번 바닥으로 스크롤해서 마지막 메시지를 보이게 유지
  const stickToBottom = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const toBottom = () => {
      el.scrollTop = el.scrollHeight;
    };
    toBottom();
    [80, 180, 320, 500].forEach((ms) => setTimeout(toBottom, ms));
  }, []);

  // 키보드가 올라오면 채팅 컨테이너 높이를 보이는 영역에 맞춰 줄인다 (iOS 대응)
  useEffect(() => {
    document.body.style.overflow = "hidden";
    document.documentElement.style.overscrollBehavior = "none";

    const vv = window.visualViewport;
    if (!vv) {
      return () => {
        document.body.style.overflow = "";
        document.documentElement.style.overscrollBehavior = "";
      };
    }
    const update = () => {
      setViewportHeight(vv.height);
      window.scrollTo(0, 0);
      stickToBottom();
    };
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
      document.body.style.overflow = "";
      document.documentElement.style.overscrollBehavior = "";
    };
  }, [stickToBottom]);

  useEffect(() => {
    const saved = localStorage.getItem("misu-model");
    if (saved === "claude" || saved === "opus") setModel("sonnet");
    else if (saved && MODEL_IDS.includes(saved)) setModel(saved as ModelId);
    setKakaoMode(localStorage.getItem(`misu-kakao-${character.id}`) === "1");
    // 터치 기기면 엔터 = 줄바꿈, 전송은 버튼 (카톡과 동일)
    coarsePointer.current = window.matchMedia("(pointer: coarse)").matches;
  }, [character.id]);

  const toggleKakaoMode = useCallback(() => {
    setKakaoMode((v) => {
      localStorage.setItem(`misu-kakao-${character.id}`, v ? "0" : "1");
      return !v;
    });
  }, [character.id]);

  const selectModel = useCallback((id: ModelId) => {
    setModel(id);
    localStorage.setItem("misu-model", id);
  }, []);

  useEffect(() => {
    if (initialMessages) return; // 서버에서 이미 실어 보냄
    fetch(`/api/chat?characterId=${character.id}`)
      .then((r) => r.json())
      .then((data) => {
        setMessages(
          (data.messages ?? []).map(
            (m: ChatMessage & { created_at?: string }) => ({
              role: m.role,
              content: m.content,
              createdAt: m.created_at,
            })
          )
        );
        setLoaded(true);
      });
  }, [character.id, initialMessages]);

  // 다음 방문 때 0초로 보여줄 스냅샷을 저장 (아바타 제외 — 용량 큼).
  // 스트리밍 중(sending)에는 청크마다 직렬화하지 않도록 완료 후에만 저장한다.
  useEffect(() => {
    if (!loaded || sending || messages.length === 0) return;
    try {
      localStorage.setItem(
        `misu-chat-cache-${character.id}`,
        JSON.stringify({
          name: character.name,
          emoji: character.emoji,
          gradient: character.gradient,
          job: character.job,
          kakao: kakaoMode,
          messages: messages.slice(-30),
        })
      );
    } catch {
      /* 저장 공간 부족 등은 무시 */
    }
  }, [messages, loaded, sending, kakaoMode, character]);

  useEffect(() => {
    if (!loaded) return;
    if (!didInitialScroll.current) {
      // 처음 입장은 카톡처럼 바로 최근 메시지에서 시작
      didInitialScroll.current = true;
      const el = scrollRef.current;
      if (el) el.scrollTop = el.scrollHeight;
      return;
    }
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loaded, revealed]);

  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || sending) return;
    setInput("");
    setSending(true);
    setRevealed(0);
    liveReveal.current = true;
    const now = new Date().toISOString();
    setMessages((prev) => [
      ...prev,
      { role: "user", content: text, createdAt: now },
      { role: "assistant", content: "", createdAt: now },
    ]);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          characterId: character.id,
          message: text,
          model,
          kakaoMode,
        }),
      });
      if (!res.ok || !res.body) throw new Error("request failed");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let acc = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        acc += decoder.decode(value, { stream: true });
        const current = acc;
        setMessages((prev) => {
          const next = [...prev];
          next[next.length - 1] = {
            ...next[next.length - 1],
            content: current,
          };
          return next;
        });
      }
    } catch {
      setMessages((prev) => {
        const next = [...prev];
        next[next.length - 1] = {
          ...next[next.length - 1],
          content: "*연결이 잠시 끊겼다* ...방금 뭐라고 했어? 다시 말해줘.",
        };
        return next;
      });
    } finally {
      setSending(false);
      textareaRef.current?.focus();
    }
  }, [input, sending, character.id, model, kakaoMode]);

  // 카톡 모드: 이번 세션에서 받는 답장만 말풍선 단위로 텀을 두고 등장시킨다
  const lastMsg = messages[messages.length - 1];
  useEffect(() => {
    if (!kakaoMode || !liveReveal.current || lastMsg?.role !== "assistant")
      return;
    const parts = stripTimeMeta(lastMsg.content)
      .split(/\n+/)
      .filter((p) => p.trim());
    // 스트리밍 중엔 마지막 줄이 미완성일 수 있으니 제외
    const available = sending ? Math.max(0, parts.length - 1) : parts.length;
    if (revealed >= available) return;
    const t = setTimeout(
      () => setRevealed((r) => r + 1),
      revealed === 0 ? 250 : 700
    );
    return () => clearTimeout(t);
  }, [kakaoMode, lastMsg, sending, revealed]);

  const reset = useCallback(async () => {
    if (!confirm(`${character.name}와의 대화를 처음부터 다시 시작할까요?`))
      return;
    await fetch(`/api/chat?characterId=${character.id}`, { method: "DELETE" });
    const res = await fetch(`/api/chat?characterId=${character.id}`);
    const data = await res.json();
    setMessages(
      (data.messages ?? []).map(
        (m: ChatMessage & { created_at?: string }) => ({
          role: m.role,
          content: m.content,
          createdAt: m.created_at,
        })
      )
    );
  }, [character.id, character.name]);

  return (
    <div
      className="fixed inset-x-0 top-0 mx-auto flex w-full max-w-md flex-col"
      style={{ height: viewportHeight ?? "100dvh" }}
    >
      <header className="relative z-30 flex items-center gap-3 border-b border-white/60 bg-white/60 px-4 py-3 backdrop-blur-md">
        <Link href="/" className="p-1 text-zinc-400 hover:text-zinc-700">
          ←
        </Link>
        <div
          className={`flex h-9 w-9 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br ${character.gradient} text-lg`}
        >
          {character.avatar ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={character.avatar}
              alt={character.name}
              className="h-full w-full object-cover"
            />
          ) : (
            character.emoji
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-semibold leading-tight text-zinc-800">
            {character.name}
          </div>
          <div className="text-xs text-zinc-400">{character.job}</div>
        </div>
        <div className="relative">
          <button
            onClick={() => setMenuOpen((v) => !v)}
            aria-label="메뉴"
            className="flex h-8 w-8 flex-col items-center justify-center gap-[3px] rounded-lg text-zinc-400 hover:bg-rose-50 hover:text-zinc-600"
          >
            <span className="block h-0.5 w-4 rounded bg-current" />
            <span className="block h-0.5 w-4 rounded bg-current" />
            <span className="block h-0.5 w-4 rounded bg-current" />
          </button>
          {menuOpen && (
            <>
              <div
                className="fixed inset-0 z-40"
                onClick={() => setMenuOpen(false)}
              />
              <div className="absolute right-0 top-10 z-50 w-40 overflow-hidden rounded-2xl border border-white/70 bg-white/95 py-1 shadow-xl backdrop-blur">
                <button
                  onClick={() => {
                    setMenuOpen(false);
                    setProfileOpen(true);
                  }}
                  className="block w-full px-4 py-2.5 text-left text-sm text-zinc-600 hover:bg-rose-50"
                >
                  💌 내 정보
                </button>
                <button
                  onClick={toggleKakaoMode}
                  className="flex w-full items-center justify-between px-4 py-2.5 text-left text-sm text-zinc-600 hover:bg-rose-50"
                >
                  <span>💬 카톡 모드</span>
                  <span
                    className={`text-[11px] font-semibold ${
                      kakaoMode ? "text-amber-500" : "text-zinc-300"
                    }`}
                  >
                    {kakaoMode ? "ON" : "OFF"}
                  </span>
                </button>
                <button
                  onClick={() => {
                    setMenuOpen(false);
                    reset();
                  }}
                  className="block w-full px-4 py-2.5 text-left text-sm text-rose-400 hover:bg-rose-50"
                >
                  🗑 대화 초기화
                </button>
              </div>
            </>
          )}
        </div>
      </header>
      {profileOpen && (
        <ProfileModal
          characterId={character.id}
          onClose={() => setProfileOpen(false)}
        />
      )}

      <div
        ref={scrollRef}
        className="flex-1 space-y-4 overflow-y-auto overscroll-contain px-4 py-5"
      >
        {!loaded && (
          <p className="pt-10 text-center text-sm text-zinc-400">
            대화를 불러오는 중...
          </p>
        )}
        {messages.map((m, i) => {
          const prev = messages[i - 1];
          const divider =
            dateLabel(m.createdAt) &&
            dateLabel(m.createdAt) !== dateLabel(prev?.createdAt) ? (
              <div className="flex items-center gap-3 py-2">
                <div className="h-px flex-1 bg-zinc-200/70" />
                <span className="text-[11px] text-zinc-400">
                  {dateLabel(m.createdAt)}
                </span>
                <div className="h-px flex-1 bg-zinc-200/70" />
              </div>
            ) : null;
          const time = timeLabel(m.createdAt);

          if (m.role === "user") {
            return (
              <div key={i}>
                {divider}
                <div className="flex items-end justify-end gap-1.5">
                  {time && (
                    <span className="mb-0.5 shrink-0 text-[10px] text-zinc-400">
                      {time}
                    </span>
                  )}
                  <div className="max-w-[80%] whitespace-pre-wrap rounded-3xl rounded-br-lg bg-gradient-to-br from-rose-400 to-pink-400 px-4 py-2.5 text-sm leading-relaxed text-white shadow-md shadow-rose-200/60">
                    {m.content}
                  </div>
                </div>
              </div>
            );
          }

          // 시각 메타데이터가 새어 나온 과거 메시지 정리 + 카톡 모드면 줄 단위 분할
          const clean = stripTimeMeta(m.content);
          const allParts =
            kakaoMode && clean
              ? clean.split(/\n+/).filter((p) => p.trim())
              : [clean];
          // 이번에 도착 중인 답장은 revealed 개수만큼만 보여주고 나머지는 타이핑 표시
          const isLive =
            kakaoMode && liveReveal.current && i === messages.length - 1;
          const parts = isLive ? allParts.slice(0, revealed) : allParts;
          const typing =
            isLive && (sending || revealed < allParts.length);
          const complete = !typing && parts.length === allParts.length;
          return (
            <div key={i}>
              {divider}
              <div className="flex gap-2">
                <div
                  className={`flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br ${character.gradient} text-sm`}
                >
                  {character.avatar ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={character.avatar}
                      alt={character.name}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    character.emoji
                  )}
                </div>
                <div className="flex min-w-0 flex-col gap-1">
                  <span className="px-1 text-[11px] text-zinc-500">
                    {character.name}
                  </span>
                  {parts.map((part, j) => (
                    <div
                      key={j}
                      className={`flex items-end gap-1.5 ${isLive ? "msg-pop" : ""}`}
                    >
                      <div className="max-w-full whitespace-pre-wrap rounded-3xl rounded-bl-lg border border-white/70 bg-white/80 px-4 py-2.5 text-sm leading-relaxed text-zinc-700 shadow-sm backdrop-blur">
                        {part ? (
                          <RichText text={part} />
                        ) : (
                          <span className="inline-block animate-pulse text-zinc-400">
                            ···
                          </span>
                        )}
                      </div>
                      {time && complete && j === parts.length - 1 && (
                        <span className="mb-0.5 shrink-0 text-[10px] text-zinc-400">
                          {time}
                        </span>
                      )}
                    </div>
                  ))}
                  {typing && (
                    <div className="msg-pop flex items-end">
                      <div className="rounded-3xl rounded-bl-lg border border-white/70 bg-white/80 px-4 py-2.5 text-sm shadow-sm backdrop-blur">
                        <span className="inline-block animate-pulse text-zinc-400">
                          ···
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      <div className="flex items-center gap-2 border-t border-white/60 bg-white/60 px-4 pt-2.5 backdrop-blur-md">
        <span className="text-xs text-zinc-400">모델</span>
        <div className="flex gap-1 rounded-xl bg-rose-50/80 p-0.5">
          {MODELS.map((m) => (
            <button
              key={m.id}
              onClick={() => selectModel(m.id)}
              className={`rounded-lg px-2.5 py-1 text-xs transition-colors ${
                model === m.id
                  ? "bg-white text-zinc-700 shadow-sm"
                  : "text-zinc-400 hover:text-zinc-600"
              }`}
            >
              {m.label}
              {m.badge && (
                <span className="ml-1 text-emerald-500">{m.badge}</span>
              )}
            </button>
          ))}
        </div>
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
        className="flex items-end gap-2 bg-white/60 px-4 py-3 backdrop-blur-md"
      >
        <textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onFocus={stickToBottom}
          onKeyDown={(e) => {
            // PC: 엔터 = 전송, Shift+엔터 = 줄바꿈 / 모바일: 엔터 = 줄바꿈 (카톡과 동일)
            if (
              e.key === "Enter" &&
              !e.shiftKey &&
              !e.nativeEvent.isComposing &&
              !coarsePointer.current
            ) {
              e.preventDefault();
              send();
            }
          }}
          rows={1}
          placeholder="메시지 입력"
          className="max-h-32 flex-1 resize-none rounded-2xl border border-rose-100 bg-white/90 px-4 py-2.5 text-sm text-zinc-700 outline-none placeholder:text-zinc-400 focus:border-rose-300"
        />
        <button
          type="submit"
          disabled={sending || !input.trim()}
          onPointerDown={(e) => e.preventDefault()}
          className="rounded-2xl bg-gradient-to-r from-rose-400 to-pink-400 px-4 py-2.5 text-sm font-medium text-white shadow-md shadow-rose-200/60 transition-opacity disabled:opacity-40"
        >
          전송
        </button>
      </form>
    </div>
  );
}
