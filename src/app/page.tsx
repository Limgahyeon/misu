import Link from "next/link";
import { getUserId } from "@/lib/auth";
import { Character, characters } from "@/lib/characters";
import { getCustomCharacters } from "@/lib/db";
import DeleteCharacterButton from "@/components/DeleteCharacterButton";
import ProfileButton from "@/components/ProfileButton";
import TabBar from "@/components/TabBar";

export const dynamic = "force-dynamic";

function CharacterCard({ c }: { c: Character }) {
  const isCustom = c.id.startsWith("c_");
  return (
    <li className="relative">
      <Link
        href={`/chat/${c.id}`}
        className="block rounded-3xl border border-white/60 bg-white/70 p-5 shadow-[0_8px_32px_rgba(236,72,153,0.10)] backdrop-blur-md transition-all hover:-translate-y-0.5 hover:bg-white/90 active:scale-[0.99]"
      >
        <div className="flex items-center gap-4">
          <div
            className={`flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br ${c.gradient} text-2xl shadow-inner`}
          >
            {c.avatar ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={c.avatar}
                alt={c.name}
                className="h-full w-full object-cover"
              />
            ) : (
              c.emoji
            )}
          </div>
          <div className="min-w-0">
            <div className="flex items-baseline gap-2">
              <span className="font-semibold text-zinc-800">{c.name}</span>
              <span className="text-xs text-zinc-400">
                {c.age}세 · {c.job}
              </span>
              {isCustom && (
                <span className="rounded-full bg-purple-100 px-2 py-0.5 text-[10px] font-medium text-purple-500">
                  MY
                </span>
              )}
            </div>
            <p className="mt-1 truncate text-sm text-zinc-500">{c.tagline}</p>
          </div>
        </div>
      </Link>
      {isCustom && (
        <>
          <Link
            href={`/create?edit=${c.id}`}
            aria-label="캐릭터 수정"
            className="absolute right-11 top-3 flex h-7 w-7 items-center justify-center rounded-full text-zinc-300 transition-colors hover:bg-purple-50 hover:text-purple-400"
          >
            ✎
          </Link>
          <DeleteCharacterButton id={c.id} name={c.name} />
        </>
      )}
    </li>
  );
}

export default async function Home() {
  const userId = (await getUserId()) ?? 0;
  const custom = userId ? await getCustomCharacters(userId) : [];

  return (
    <main className="mx-auto flex min-h-full w-full max-w-md flex-col px-5 pb-24 pt-10">
      <header className="relative mb-8 text-center">
        <ProfileButton />
        <h1 className="text-4xl font-bold tracking-tight text-zinc-800">
          misu
          <span className="bg-gradient-to-r from-rose-400 to-purple-400 bg-clip-text text-transparent">
            .
          </span>
        </h1>
        <p className="mt-2 text-sm text-zinc-500">
          오늘 하루, 누구랑 나누고 싶어요?
        </p>
      </header>

      <Link
        href="/create"
        className="mb-6 block rounded-3xl border-2 border-dashed border-rose-200 bg-white/50 p-5 text-center backdrop-blur transition-colors hover:border-rose-300 hover:bg-white/80"
      >
        <span className="text-2xl">✨</span>
        <p className="mt-1 text-sm font-semibold text-zinc-700">
          나만의 그를 만들기
        </p>
        <p className="mt-0.5 text-xs text-zinc-400">
          컨셉만 적으면 AI가 완성해줘요
        </p>
      </Link>

      <ul className="flex flex-col gap-4">
        {[...custom, ...characters].map((c) => (
          <CharacterCard key={c.id} c={c} />
        ))}
      </ul>

      <footer className="mt-auto pt-10 text-center text-xs text-zinc-400">
        모든 대화 상대는 AI 캐릭터입니다
      </footer>

      <TabBar active="/" />
    </main>
  );
}
