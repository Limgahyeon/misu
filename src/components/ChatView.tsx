"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { getPushStatus, subscribeToPush } from "@/lib/push-client";
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
  id?: number;
  role: "user" | "assistant";
  content: string;
  createdAt?: string;
  // 리롤로 쌓인 답장 버전들 — content는 그중 현재 선택된 것
  variants?: string[];
}

// API 원본 행 → ChatMessage (variants는 DB에 JSON 문자열로 저장돼 있다)
function toChatMessage(
  m: ChatMessage & { created_at?: string; variants?: string[] | string | null }
): ChatMessage {
  let variants: string[] | undefined;
  if (typeof m.variants === "string") {
    try {
      variants = JSON.parse(m.variants);
    } catch {
      variants = undefined;
    }
  } else {
    variants = m.variants ?? undefined;
  }
  return {
    id: m.id,
    role: m.role,
    content: m.content,
    createdAt: m.created_at ?? m.createdAt,
    variants,
  };
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
  allowPaidModels = true,
}: {
  character: CharacterInfo;
  initialMessages?: ChatMessage[];
  allowPaidModels?: boolean;
}) {
  // 친구 계정은 sonnet 비노출 (서버에서도 haiku로 강제되지만 UI에서부터 숨긴다)
  const visibleModels = allowPaidModels
    ? MODELS
    : MODELS.filter((m) => m.id !== "sonnet");
  const [messages, setMessages] = useState<ChatMessage[]>(
    initialMessages ?? []
  );
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [loaded, setLoaded] = useState(!!initialMessages);
  const [model, setModel] = useState<ModelId>("haiku");
  const [menuOpen, setMenuOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  // 아바타 클릭 시 프로필 사진 풀스크린 뷰어
  const [photoOpen, setPhotoOpen] = useState(false);
  // 내 메시지 꾹 누르면 복사 버튼 (copyTarget = 메시지 인덱스)
  const [copyTarget, setCopyTarget] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);
  // "이렇게 말해줘" — 마지막 답장을 직접 교정하면 말투 예시로도 학습된다
  const [correctOpen, setCorrectOpen] = useState(false);
  const [correctText, setCorrectText] = useState("");
  const [taught, setTaught] = useState(false);
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const startPress = (i: number) => {
    pressTimer.current = setTimeout(() => setCopyTarget(i), 500);
  };
  const cancelPress = () => {
    if (pressTimer.current) {
      clearTimeout(pressTimer.current);
      pressTimer.current = null;
    }
  };
  const copyMessage = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // 구형 브라우저·비보안 컨텍스트 폴백
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
    }
    setCopyTarget(null);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
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
  // 알림 유도 배너 — 대화를 시작했는데 아직 알림을 안 켠 유저에게 한 번 권한다
  const [pushNudge, setPushNudge] = useState<"push" | "ios" | null>(null);
  const [nudgeMsg, setNudgeMsg] = useState<string | null>(null);
  const [nudgeOk, setNudgeOk] = useState(false);
  const nudgeChecked = useRef(false);
  // 과거 대화 로드 — 위로 스크롤하면 50개씩 더 불러온다
  const [hasMore, setHasMore] = useState(true);
  const loadingOlder = useRef(false);
  // 프리펜드 직후 스크롤 위치 복원용 (이전 scrollHeight/scrollTop)
  const prependRestore = useRef<{ height: number; top: number } | null>(null);

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
    if ((saved === "claude" || saved === "opus") && allowPaidModels)
      setModel("sonnet");
    else if (saved && MODEL_IDS.includes(saved)) {
      // 예전에 sonnet을 골라뒀던 친구 계정은 haiku로
      const coerced =
        !allowPaidModels && saved === "sonnet" ? "haiku" : (saved as ModelId);
      setModel(coerced);
    }
    // 터치 기기면 엔터 = 줄바꿈, 전송은 버튼 (카톡과 동일)
    coarsePointer.current = window.matchMedia("(pointer: coarse)").matches;
  }, [character.id, allowPaidModels]);

  const selectModel = useCallback((id: ModelId) => {
    setModel(id);
    localStorage.setItem("misu-model", id);
  }, []);

  useEffect(() => {
    if (initialMessages) return; // 서버에서 이미 실어 보냄
    fetch(`/api/chat?characterId=${character.id}`)
      .then((r) => r.json())
      .then((data) => {
        setMessages((data.messages ?? []).map(toChatMessage));
        setLoaded(true);
      });
  }, [character.id, initialMessages]);

  // 위로 스크롤 시 이전 대화 로드
  const loadOlder = useCallback(async () => {
    if (loadingOlder.current || !hasMore) return;
    const el = scrollRef.current;
    const oldest = messages.find((m) => m.id != null);
    if (!el || !oldest?.id) return;
    loadingOlder.current = true;
    try {
      const res = await fetch(
        `/api/chat?characterId=${character.id}&before=${oldest.id}`
      );
      const data = await res.json();
      const older: ChatMessage[] = (data.messages ?? []).map(toChatMessage);
      if (older.length < 50) setHasMore(false);
      if (older.length > 0) {
        prependRestore.current = { height: el.scrollHeight, top: el.scrollTop };
        setMessages((prev) => [...older, ...prev]);
        return; // loadingOlder는 스크롤 복원 후에 푼다
      }
    } catch {
      /* 다음 스크롤에서 재시도 */
    }
    loadingOlder.current = false;
  }, [character.id, hasMore, messages]);

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
          messages: messages.slice(-30),
        })
      );
    } catch {
      /* 저장 공간 부족 등은 무시 */
    }
  }, [messages, loaded, sending, character]);

  // 직접 메시지를 보내본 유저가 알림을 안 켰으면 배너를 띄운다 (기기당 1회, 닫으면 다시 안 뜸)
  useEffect(() => {
    if (nudgeChecked.current || !loaded || sending) return;
    if (!messages.some((m) => m.role === "user")) return;
    if (localStorage.getItem("misu-push-nudge") === "off") return;
    nudgeChecked.current = true;
    getPushStatus().then((status) => {
      if (status === "off") setPushNudge("push");
      else if (
        status === "unsupported" &&
        /iPhone|iPad/.test(navigator.userAgent)
      ) {
        setPushNudge("ios");
      } else if (status === "on") {
        // 이미 켜져 있음 — 다음부터 확인 자체를 건너뛴다
        localStorage.setItem("misu-push-nudge", "off");
      }
    });
  }, [loaded, sending, messages]);

  const dismissNudge = () => {
    localStorage.setItem("misu-push-nudge", "off");
    setPushNudge(null);
  };

  const enableNudgePush = async () => {
    setNudgeMsg(null);
    const result = await subscribeToPush();
    if (result === "ok") {
      localStorage.setItem("misu-push-nudge", "off");
      setNudgeOk(true);
      setNudgeMsg("이제 그가 먼저 보낸 톡이 알림으로 와요 💌");
      setTimeout(() => setPushNudge(null), 2500);
    } else if (result === "denied") {
      setNudgeMsg(
        "알림이 차단돼 있어요. 휴대폰 설정에서 misu 알림을 허용한 뒤 다시 눌러주세요."
      );
    } else {
      setNudgeMsg(
        "등록에 실패했어요. iPhone은 Safari 공유 → '홈 화면에 추가'한 misu에서만 켤 수 있어요."
      );
    }
  };

  useEffect(() => {
    if (!loaded) return;
    const el = scrollRef.current;
    // 과거 대화를 위에 붙인 직후 — 보던 위치가 유지되도록 스크롤 보정
    if (prependRestore.current && el) {
      el.scrollTop =
        el.scrollHeight - prependRestore.current.height + prependRestore.current.top;
      prependRestore.current = null;
      loadingOlder.current = false;
      return;
    }
    if (!didInitialScroll.current) {
      // 처음 입장은 카톡처럼 바로 최근 메시지에서 시작
      didInitialScroll.current = true;
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
          content: "앗 연결이 잠깐 끊겼나 봐 🥲\n방금 뭐라고 했어? 다시 말해줘",
        };
        return next;
      });
    } finally {
      setSending(false);
      textareaRef.current?.focus();
    }
  }, [input, sending, character.id, model]);

  // 마지막 캐릭터 답장의 새 버전을 받는다 — 기존 버전은 variants에 남아 ‹ ›로 오갈 수 있다
  const reroll = useCallback(async () => {
    if (sending) return;
    const last = messages[messages.length - 1];
    if (last?.role !== "assistant") return;
    setSending(true);
    setRevealed(0);
    liveReveal.current = true;
    const prevContent = last.content;
    const baseVariants = last.variants ?? [last.content];
    setMessages((prev) => {
      const next = [...prev];
      next[next.length - 1] = {
        ...next[next.length - 1],
        content: "",
        createdAt: new Date().toISOString(),
      };
      return next;
    });

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          characterId: character.id,
          model,
          reroll: true,
        }),
      });
      if (!res.ok || !res.body) throw new Error("reroll failed");

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
      // 서버와 같은 규칙으로 버전 배열을 갱신 (새 버전이 맨 뒤 + 선택 상태)
      const newContent = acc;
      setMessages((prev) => {
        const next = [...prev];
        next[next.length - 1] = {
          ...next[next.length - 1],
          variants: [...baseVariants, newContent],
        };
        return next;
      });
    } catch {
      // 실패하면 원래 답장을 되돌린다
      setMessages((prev) => {
        const next = [...prev];
        next[next.length - 1] = {
          ...next[next.length - 1],
          content: prevContent,
        };
        return next;
      });
    } finally {
      setSending(false);
    }
  }, [messages, sending, character.id, model]);

  // ‹ › 로 답장 버전을 오간다 — 선택은 서버에도 저장돼 대화 맥락에 반영된다
  const selectVariant = useCallback(
    (idx: number) => {
      if (sending) return;
      const last = messages[messages.length - 1];
      const variants = last?.variants;
      if (last?.role !== "assistant" || !variants) return;
      if (idx < 0 || idx >= variants.length) return;
      liveReveal.current = false;
      setMessages((prev) => {
        const next = [...prev];
        next[next.length - 1] = {
          ...next[next.length - 1],
          content: variants[idx],
        };
        return next;
      });
      fetch("/api/chat", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ characterId: character.id, variantIdx: idx }),
      }).catch(() => {
        /* 다음 선택이나 새로고침 때 서버 상태로 복구된다 */
      });
    },
    [messages, sending, character.id]
  );

  // "이렇게 말해줘" 저장 — 마지막 답장을 교정문으로 교체하고 말투 예시로 학습
  const submitCorrection = useCallback(async () => {
    const text = correctText.trim();
    const last = messages[messages.length - 1];
    if (!text || sending || last?.role !== "assistant") return;
    setSending(true);
    try {
      const res = await fetch("/api/chat", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ characterId: character.id, correction: text }),
      });
      if (!res.ok) throw new Error("correction failed");
      liveReveal.current = false;
      setMessages((prev) => {
        const next = [...prev];
        const lastMsg = next[next.length - 1];
        next[next.length - 1] = {
          ...lastMsg,
          content: text,
          variants: [...(lastMsg.variants ?? [lastMsg.content]), text],
        };
        return next;
      });
      setCorrectOpen(false);
      setCorrectText("");
      setTaught(true);
      setTimeout(() => setTaught(false), 2000);
    } catch {
      /* 입력을 유지해서 다시 시도할 수 있게 둔다 */
    } finally {
      setSending(false);
    }
  }, [correctText, messages, sending, character.id]);

  // 이번 세션에서 받는 답장만 말풍선 단위로 텀을 두고 등장시킨다
  const lastMsg = messages[messages.length - 1];
  useEffect(() => {
    if (!liveReveal.current || lastMsg?.role !== "assistant") return;
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
  }, [lastMsg, sending, revealed]);

  const reset = useCallback(async () => {
    if (!confirm(`${character.name}와의 대화를 처음부터 다시 시작할까요?`))
      return;
    await fetch(`/api/chat?characterId=${character.id}`, { method: "DELETE" });
    const res = await fetch(`/api/chat?characterId=${character.id}`);
    const data = await res.json();
    setMessages((data.messages ?? []).map(toChatMessage));
    setHasMore(true);
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
          onClick={() => character.avatar && setPhotoOpen(true)}
          className={`flex h-9 w-9 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br ${character.gradient} text-lg ${character.avatar ? "cursor-pointer" : ""}`}
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
      {copyTarget !== null && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => setCopyTarget(null)}
          onTouchStart={() => setCopyTarget(null)}
        />
      )}
      {copied && (
        <div className="pointer-events-none fixed inset-x-0 bottom-28 z-[70] flex justify-center">
          <span className="rounded-full bg-zinc-800/90 px-4 py-2 text-xs text-white shadow-lg">
            복사했어요
          </span>
        </div>
      )}
      {taught && (
        <div className="pointer-events-none fixed inset-x-0 bottom-28 z-[70] flex justify-center">
          <span className="rounded-full bg-zinc-800/90 px-4 py-2 text-xs text-white shadow-lg">
            배웠어요 — 다음부터 이렇게 말할게요 ✏️
          </span>
        </div>
      )}
      {photoOpen && character.avatar && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/95"
          onClick={() => setPhotoOpen(false)}
        >
          <div className="absolute inset-x-0 top-0 flex items-center justify-between px-4 py-3 text-white/90">
            <span className="text-sm font-medium">{character.name}</span>
            <button
              onClick={() => setPhotoOpen(false)}
              aria-label="닫기"
              className="flex h-8 w-8 items-center justify-center rounded-full text-lg text-white/80 hover:bg-white/10"
            >
              ✕
            </button>
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={character.avatar}
            alt={character.name}
            className="max-h-full max-w-full object-contain"
          />
        </div>
      )}

      <div
        ref={scrollRef}
        onScroll={(e) => {
          if (e.currentTarget.scrollTop < 80) loadOlder();
        }}
        className="flex-1 space-y-4 overflow-y-auto overscroll-contain px-4 py-5"
      >
        {loaded && hasMore && messages.some((m) => m.id != null) && (
          <p className="pb-1 text-center text-[11px] text-zinc-300">
            위로 올리면 지난 대화를 불러와요
          </p>
        )}
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
                  <div
                    onTouchStart={() => startPress(i)}
                    onTouchEnd={cancelPress}
                    onTouchMove={cancelPress}
                    onMouseDown={() => startPress(i)}
                    onMouseUp={cancelPress}
                    onMouseLeave={cancelPress}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      cancelPress();
                      setCopyTarget(i);
                    }}
                    style={{ WebkitTouchCallout: "none" }}
                    className="relative max-w-[80%] select-none whitespace-pre-wrap rounded-3xl rounded-br-lg bg-gradient-to-br from-rose-400 to-pink-400 px-4 py-2.5 text-sm leading-relaxed text-white shadow-md shadow-rose-200/60"
                  >
                    {m.content}
                    {copyTarget === i && (
                      <button
                        onClick={() => copyMessage(m.content)}
                        className="absolute -top-10 right-0 z-50 whitespace-nowrap rounded-xl bg-zinc-800/95 px-3.5 py-2 text-xs font-medium text-white shadow-lg"
                      >
                        📋 복사
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          }

          // 시각 메타데이터가 새어 나온 과거 메시지 정리 + 줄 단위 말풍선 분할
          const clean = stripTimeMeta(m.content);
          const allParts = clean
            ? clean.split(/\n+/).filter((p) => p.trim())
            : [clean];
          // 이번에 도착 중인 답장은 revealed 개수만큼만 보여주고 나머지는 타이핑 표시
          const isLive = liveReveal.current && i === messages.length - 1;
          const parts = isLive ? allParts.slice(0, revealed) : allParts;
          const typing =
            isLive && (sending || revealed < allParts.length);
          const complete = !typing && parts.length === allParts.length;
          // 마지막 답장이고 그 앞이 유저 메시지면 다른 버전으로 다시 받을 수 있다
          const canReroll =
            !sending &&
            complete &&
            i === messages.length - 1 &&
            messages[i - 1]?.role === "user";
          // 현재 보고 있는 버전 번호 (content가 배열에 없으면 마지막 버전으로 간주)
          const vList = canReroll ? m.variants : undefined;
          const vIdx = vList
            ? (() => {
                const idx = vList.indexOf(m.content);
                return idx >= 0 ? idx : vList.length - 1;
              })()
            : 0;
          return (
            <div key={i}>
              {divider}
              <div className="flex gap-2">
                <div
                  onClick={() => character.avatar && setPhotoOpen(true)}
                  className={`flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br ${character.gradient} text-sm ${character.avatar ? "cursor-pointer" : ""}`}
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
                  {canReroll && (
                    <div className="flex items-center gap-2.5 px-1 pt-0.5">
                      {vList && vList.length > 1 && (
                        <span className="flex items-center gap-1.5 text-[11px] text-zinc-400">
                          <button
                            onClick={() => selectVariant(vIdx - 1)}
                            disabled={vIdx <= 0}
                            aria-label="이전 답장"
                            className="px-0.5 text-sm leading-none transition-colors hover:text-rose-400 disabled:opacity-30"
                          >
                            ‹
                          </button>
                          {vIdx + 1}/{vList.length}
                          <button
                            onClick={() => selectVariant(vIdx + 1)}
                            disabled={vIdx >= vList.length - 1}
                            aria-label="다음 답장"
                            className="px-0.5 text-sm leading-none transition-colors hover:text-rose-400 disabled:opacity-30"
                          >
                            ›
                          </button>
                        </span>
                      )}
                      <button
                        onClick={reroll}
                        className="text-[11px] text-zinc-300 transition-colors hover:text-rose-400"
                      >
                        ↻ 다른 답장 받기
                      </button>
                      <button
                        onClick={() => setCorrectOpen((v) => !v)}
                        className="text-[11px] text-zinc-300 transition-colors hover:text-rose-400"
                      >
                        ✏️ 이렇게 말해줘
                      </button>
                    </div>
                  )}
                  {canReroll && correctOpen && (
                    <div className="mt-1 flex flex-col gap-1.5 rounded-2xl border border-rose-100 bg-white/80 p-2.5">
                      <textarea
                        value={correctText}
                        onChange={(e) => setCorrectText(e.target.value)}
                        rows={3}
                        maxLength={2000}
                        placeholder={`그가 뭐라고 답했으면 좋겠어요?\n원하는 말투 그대로 써주면, 다음부터 이렇게 말하는 법을 배워요`}
                        className="w-full resize-none rounded-xl border border-rose-100 bg-white px-3 py-2 text-sm text-zinc-700 outline-none placeholder:text-zinc-400 focus:border-rose-300"
                      />
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => {
                            setCorrectOpen(false);
                            setCorrectText("");
                          }}
                          className="rounded-xl px-3 py-1.5 text-xs text-zinc-400 hover:text-zinc-600"
                        >
                          취소
                        </button>
                        <button
                          onClick={submitCorrection}
                          disabled={sending || !correctText.trim()}
                          className="rounded-xl bg-rose-400 px-3 py-1.5 text-xs font-medium text-white shadow-sm shadow-rose-200/60 disabled:opacity-40"
                        >
                          이걸로 바꾸고 배우기
                        </button>
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

      {pushNudge && (
        <div className="flex items-center gap-2 border-t border-rose-100/80 bg-rose-50/90 px-4 py-2 backdrop-blur-md">
          <p className="min-w-0 flex-1 text-[11px] leading-snug text-zinc-600">
            {nudgeMsg ??
              (pushNudge === "ios"
                ? "iPhone은 Safari 공유 → '홈 화면에 추가'하면 그가 먼저 보낸 톡을 알림으로 받을 수 있어요 💌"
                : "그가 먼저 보낸 톡, 놓치지 않게 알림으로 받아볼래요?")}
          </p>
          {pushNudge === "push" && !nudgeOk && (
            <button
              type="button"
              onClick={enableNudgePush}
              className="shrink-0 rounded-xl bg-rose-400 px-3 py-1.5 text-xs font-medium text-white shadow-sm shadow-rose-200/60"
            >
              알림 켜기
            </button>
          )}
          <button
            type="button"
            onClick={dismissNudge}
            aria-label="알림 권유 닫기"
            className="shrink-0 px-1 text-sm text-zinc-400 hover:text-zinc-600"
          >
            ✕
          </button>
        </div>
      )}
      <div className="flex items-center gap-2 border-t border-white/60 bg-white/60 px-4 pt-2.5 backdrop-blur-md">
        <span className="text-xs text-zinc-400">모델</span>
        <div className="flex gap-1 rounded-xl bg-rose-50/80 p-0.5">
          {visibleModels.map((m) => (
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
