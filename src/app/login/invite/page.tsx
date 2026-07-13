"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

// 카카오 인증 직후 처음 온 사람이 도착하는 곳 — 초대 코드를 내야 가입된다.
// 기존 접속 코드를 입력하면 그 계정에 카카오가 연결된다(친구들 마이그레이션용).
export default function InvitePage() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!code.trim() || busy) return;
    setBusy(true);
    setError(null);
    const res = await fetch("/api/auth/kakao/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: code.trim() }),
    });
    if (res.ok) {
      router.replace("/");
      router.refresh();
      return;
    }
    if (res.status === 401) {
      const data = await res.json().catch(() => ({}));
      if (data.error === "expired") {
        setError("시간이 지나 처음부터 다시 해야 해요. 로그인 화면으로 이동할게요.");
        setTimeout(() => router.replace("/login"), 1500);
        return;
      }
    }
    setError("코드가 맞지 않아요. 다시 확인해주세요.");
    setBusy(false);
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col items-center justify-center px-8">
      <h1 className="text-4xl font-bold tracking-tight text-zinc-800">
        misu
        <span className="bg-gradient-to-r from-rose-400 to-purple-400 bg-clip-text text-transparent">
          .
        </span>
      </h1>
      <p className="mt-3 text-center text-sm text-zinc-500">
        처음 오셨네요! 초대 코드를 입력해주세요.
      </p>
      <p className="mt-1 text-center text-xs text-zinc-400">
        원래 쓰던 접속 코드가 있다면 그걸 입력하면
        <br />
        기존 계정에 카카오가 연결돼요.
      </p>

      <form onSubmit={submit} className="mt-8 flex w-full flex-col gap-3">
        <input
          type="text"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="초대 코드"
          autoFocus
          autoComplete="off"
          className="w-full rounded-2xl border border-rose-100 bg-white/80 px-4 py-3 text-center text-sm text-zinc-700 outline-none backdrop-blur placeholder:text-zinc-400 focus:border-rose-300"
        />
        {error && (
          <p className="text-center text-xs text-rose-500">{error}</p>
        )}
        <button
          type="submit"
          disabled={busy || !code.trim()}
          className="rounded-2xl bg-gradient-to-r from-rose-400 to-purple-400 py-3 text-sm font-medium text-white shadow-lg shadow-rose-200/60 transition-opacity disabled:opacity-40"
        >
          시작하기
        </button>
      </form>
    </main>
  );
}
