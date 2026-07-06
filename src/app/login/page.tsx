"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function LoginPage() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!code.trim() || busy) return;
    setBusy(true);
    setError(false);
    const res = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: code.trim() }),
    });
    if (res.ok) {
      router.replace("/");
      router.refresh();
    } else {
      setError(true);
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col items-center justify-center px-8">
      <h1 className="text-4xl font-bold tracking-tight text-zinc-800">
        misu
        <span className="bg-gradient-to-r from-rose-400 to-purple-400 bg-clip-text text-transparent">
          .
        </span>
      </h1>
      <p className="mt-3 text-sm text-zinc-500">접속 코드를 입력해주세요</p>

      <form onSubmit={submit} className="mt-8 flex w-full flex-col gap-3">
        <input
          type="password"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="접속 코드"
          autoFocus
          className="w-full rounded-2xl border border-rose-100 bg-white/80 px-4 py-3 text-center text-sm text-zinc-700 outline-none backdrop-blur placeholder:text-zinc-400 focus:border-rose-300"
        />
        {error && (
          <p className="text-center text-xs text-rose-500">
            코드가 맞지 않아요. 다시 확인해주세요.
          </p>
        )}
        <button
          type="submit"
          disabled={busy || !code.trim()}
          className="rounded-2xl bg-gradient-to-r from-rose-400 to-purple-400 py-3 text-sm font-medium text-white shadow-lg shadow-rose-200/60 transition-opacity disabled:opacity-40"
        >
          입장하기
        </button>
      </form>
    </main>
  );
}
