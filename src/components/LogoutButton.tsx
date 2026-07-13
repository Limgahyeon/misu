"use client";

import { useState } from "react";

export default function LogoutButton() {
  const [busy, setBusy] = useState(false);

  async function logout() {
    if (busy) return;
    setBusy(true);
    await fetch("/api/logout", { method: "POST" });
    // 같은 기기에서 다른 계정으로 로그인할 수 있으니 대화 캐시 등 흔적을 지운다
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith("misu-")) localStorage.removeItem(key);
    }
    location.href = "/login";
  }

  return (
    <button
      onClick={logout}
      disabled={busy}
      className="mt-4 w-full rounded-2xl border border-zinc-200 py-2.5 text-sm text-zinc-400 transition-colors hover:border-rose-200 hover:text-rose-400 disabled:opacity-40"
    >
      {busy ? "로그아웃 중..." : "로그아웃"}
    </button>
  );
}
