"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function LoginForm({
  kakaoEnabled,
  kakaoError,
}: {
  kakaoEnabled: boolean;
  kakaoError: boolean;
}) {
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
      <p className="mt-3 text-sm text-zinc-500">나만의 AI 남자친구</p>

      {kakaoEnabled && (
        <>
          <a
            href="/api/auth/kakao"
            className="mt-8 flex w-full items-center justify-center gap-2 rounded-2xl bg-[#FEE500] py-3 text-sm font-medium text-[#191919] shadow-lg shadow-amber-200/40"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden>
              <path
                fill="#191919"
                d="M12 3C6.48 3 2 6.54 2 10.9c0 2.8 1.85 5.26 4.63 6.66l-.94 3.53c-.08.31.27.56.54.38l4.15-2.79c.53.07 1.07.11 1.62.11 5.52 0 10-3.54 10-7.9S17.52 3 12 3z"
              />
            </svg>
            카카오로 시작하기
          </a>
          {kakaoError && (
            <p className="mt-3 text-center text-xs text-rose-500">
              카카오 로그인에 실패했어요. 잠시 후 다시 시도해주세요.
            </p>
          )}
          <div className="mt-6 flex w-full items-center gap-3 text-[11px] text-zinc-400">
            <div className="h-px flex-1 bg-zinc-200" />
            또는 접속 코드로
            <div className="h-px flex-1 bg-zinc-200" />
          </div>
        </>
      )}

      <form
        onSubmit={submit}
        className={`${kakaoEnabled ? "mt-6" : "mt-8"} flex w-full flex-col gap-3`}
      >
        <input
          type="password"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="접속 코드"
          autoFocus={!kakaoEnabled}
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
