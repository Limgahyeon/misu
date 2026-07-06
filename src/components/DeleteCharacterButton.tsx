"use client";

import { useRouter } from "next/navigation";

export default function DeleteCharacterButton({
  id,
  name,
}: {
  id: string;
  name: string;
}) {
  const router = useRouter();

  async function remove() {
    if (!confirm(`${name}(와)과 헤어질까요? 대화 기록도 함께 사라져요.`)) return;
    await fetch(`/api/characters?id=${id}`, { method: "DELETE" });
    router.refresh();
  }

  return (
    <button
      onClick={remove}
      aria-label="캐릭터 삭제"
      className="absolute right-3 top-3 flex h-7 w-7 items-center justify-center rounded-full text-zinc-300 transition-colors hover:bg-rose-50 hover:text-rose-400"
    >
      ✕
    </button>
  );
}
