"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

interface CharacterInfo {
  id: string;
  name: string;
  emoji: string;
  gradient: string;
  job: string;
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

function RichText({ text }: { text: string }) {
  const parts = text.split(/(\*[^*]+\*)/g).filter(Boolean);
  return (
    <>
      {parts.map((part, i) =>
        part.startsWith("*") && part.endsWith("*") ? (
          <span key={i} className="italic text-zinc-400">
            {part.slice(1, -1)}
          </span>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </>
  );
}

type ModelId = "gemini" | "claude";

const MODELS: { id: ModelId; label: string; badge: string }[] = [
  { id: "gemini", label: "Gemini", badge: "무료" },
  { id: "claude", label: "Claude", badge: "유료" },
];

export default function ChatView({ character }: { character: CharacterInfo }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [model, setModel] = useState<ModelId>("gemini");
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const saved = localStorage.getItem("misu-model");
    if (saved === "claude" || saved === "gemini") setModel(saved);
  }, []);

  const selectModel = useCallback((id: ModelId) => {
    setModel(id);
    localStorage.setItem("misu-model", id);
  }, []);

  useEffect(() => {
    fetch(`/api/chat?characterId=${character.id}`)
      .then((r) => r.json())
      .then((data) => {
        setMessages(
          (data.messages ?? []).map((m: ChatMessage) => ({
            role: m.role,
            content: m.content,
          }))
        );
        setLoaded(true);
      });
  }, [character.id]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || sending) return;
    setInput("");
    setSending(true);
    setMessages((prev) => [
      ...prev,
      { role: "user", content: text },
      { role: "assistant", content: "" },
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
          next[next.length - 1] = { role: "assistant", content: current };
          return next;
        });
      }
    } catch {
      setMessages((prev) => {
        const next = [...prev];
        next[next.length - 1] = {
          role: "assistant",
          content: "*연결이 잠시 끊겼다* ...방금 뭐라고 했어? 다시 말해줘.",
        };
        return next;
      });
    } finally {
      setSending(false);
    }
  }, [input, sending, character.id, model]);

  const reset = useCallback(async () => {
    if (!confirm(`${character.name}와의 대화를 처음부터 다시 시작할까요?`))
      return;
    await fetch(`/api/chat?characterId=${character.id}`, { method: "DELETE" });
    const res = await fetch(`/api/chat?characterId=${character.id}`);
    const data = await res.json();
    setMessages(
      (data.messages ?? []).map((m: ChatMessage) => ({
        role: m.role,
        content: m.content,
      }))
    );
  }, [character.id, character.name]);

  return (
    <div className="mx-auto flex h-dvh w-full max-w-md flex-col">
      <header className="flex items-center gap-3 border-b border-zinc-800 bg-zinc-950/90 px-4 py-3 backdrop-blur">
        <Link href="/" className="p-1 text-zinc-400 hover:text-zinc-100">
          ←
        </Link>
        <div
          className={`flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br ${character.gradient} text-lg`}
        >
          {character.emoji}
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-semibold leading-tight">{character.name}</div>
          <div className="text-xs text-zinc-500">{character.job}</div>
        </div>
        <button
          onClick={reset}
          className="rounded-lg px-2 py-1 text-xs text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300"
        >
          대화 초기화
        </button>
      </header>

      <div className="flex-1 space-y-4 overflow-y-auto px-4 py-5">
        {!loaded && (
          <p className="pt-10 text-center text-sm text-zinc-600">
            대화를 불러오는 중...
          </p>
        )}
        {messages.map((m, i) =>
          m.role === "user" ? (
            <div key={i} className="flex justify-end">
              <div className="max-w-[80%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-rose-500 px-4 py-2.5 text-sm leading-relaxed text-white">
                {m.content}
              </div>
            </div>
          ) : (
            <div key={i} className="flex justify-start">
              <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-bl-md bg-zinc-800 px-4 py-2.5 text-sm leading-relaxed">
                {m.content ? (
                  <RichText text={m.content} />
                ) : (
                  <span className="inline-block animate-pulse text-zinc-500">
                    ···
                  </span>
                )}
              </div>
            </div>
          )
        )}
        <div ref={bottomRef} />
      </div>

      <div className="flex items-center gap-2 border-t border-zinc-800 bg-zinc-950 px-4 pt-2.5">
        <span className="text-xs text-zinc-600">모델</span>
        <div className="flex gap-1 rounded-lg bg-zinc-900 p-0.5">
          {MODELS.map((m) => (
            <button
              key={m.id}
              onClick={() => selectModel(m.id)}
              className={`rounded-md px-2.5 py-1 text-xs transition-colors ${
                model === m.id
                  ? "bg-zinc-700 text-zinc-100"
                  : "text-zinc-500 hover:text-zinc-300"
              }`}
            >
              {m.label}
              <span
                className={`ml-1 ${
                  m.id === "gemini" ? "text-emerald-400" : "text-amber-400"
                }`}
              >
                {m.badge}
              </span>
            </button>
          ))}
        </div>
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
        className="flex items-end gap-2 bg-zinc-950 px-4 py-3"
      >
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              send();
            }
          }}
          rows={1}
          placeholder={`${character.name}에게 메시지 보내기`}
          className="max-h-32 flex-1 resize-none rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-2.5 text-sm outline-none placeholder:text-zinc-600 focus:border-rose-400/60"
        />
        <button
          type="submit"
          disabled={sending || !input.trim()}
          className="rounded-xl bg-rose-500 px-4 py-2.5 text-sm font-medium text-white transition-opacity disabled:opacity-40"
        >
          전송
        </button>
      </form>
    </div>
  );
}
