import Link from "next/link";
import { characters } from "@/lib/characters";

export default function Home() {
  return (
    <main className="mx-auto flex min-h-full w-full max-w-md flex-col px-5 py-10">
      <header className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">
          misu<span className="text-rose-400">.</span>
        </h1>
        <p className="mt-2 text-sm text-zinc-400">
          오늘 하루, 누구랑 나누고 싶어요?
        </p>
      </header>

      <ul className="flex flex-col gap-4">
        {characters.map((c) => (
          <li key={c.id}>
            <Link
              href={`/chat/${c.id}`}
              className="block rounded-2xl border border-zinc-800 bg-zinc-900 p-5 transition-colors hover:border-rose-400/50 hover:bg-zinc-800/80 active:scale-[0.99]"
            >
              <div className="flex items-center gap-4">
                <div
                  className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-gradient-to-br ${c.gradient} text-2xl`}
                >
                  {c.emoji}
                </div>
                <div className="min-w-0">
                  <div className="flex items-baseline gap-2">
                    <span className="font-semibold">{c.name}</span>
                    <span className="text-xs text-zinc-500">
                      {c.age}세 · {c.job}
                    </span>
                  </div>
                  <p className="mt-1 truncate text-sm text-zinc-400">
                    {c.tagline}
                  </p>
                </div>
              </div>
            </Link>
          </li>
        ))}
      </ul>

      <footer className="mt-auto pt-10 text-center text-xs text-zinc-600">
        모든 대화 상대는 AI 캐릭터입니다
      </footer>
    </main>
  );
}
