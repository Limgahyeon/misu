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
      <h1 className="text-4xl font-bold tracking-tight">
        misu<span className="text-rose-400">.</span>
      </h1>
      <p className="mt-3 text-sm text-zinc-400">접속 코드를 입력해주세요</p>

      <form onSubmit={submit} className="mt-8 flex w-full flex-col gap-3">
        <input
          type="password"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="접속 코드"
          autoFocus
          className="w-full rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-3 text-center text-sm outline-none placeholder:text-zinc-600 focus:border-rose-400/60"
        />
        {error && (
          <p className="text-center text-xs text-rose-400">
            코드가 맞지 않아요. 다시 확인해주세요.
          </p>
        )}
        <button
          type="submit"
          disabled={busy || !code.trim()}
          className="rounded-xl bg-rose-500 py-3 text-sm font-medium text-white transition-opacity disabled:opacity-40"
        >
          입장하기
        </button>
      </form>
    </main>
  );
}
