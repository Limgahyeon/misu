import Link from "next/link";
import { getUserId } from "@/lib/auth";
import { characters } from "@/lib/characters";
import { getChatList, getCustomCharacters } from "@/lib/db";
import TabBar from "@/components/TabBar";

export const dynamic = "force-dynamic";

function formatTime(utc: string): string {
  const date = new Date(utc.replace(" ", "T") + "Z");
  const kstDay = (d: Date) =>
    d.toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul" });
  const now = new Date();
  if (kstDay(date) === kstDay(now)) {
    return date.toLocaleTimeString("ko-KR", {
      timeZone: "Asia/Seoul",
      hour: "numeric",
      minute: "2-digit",
    });
  }
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  if (kstDay(date) === kstDay(yesterday)) return "어제";
  return date.toLocaleDateString("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "long",
    day: "numeric",
  });
}

function preview(content: string): string {
  return content.replace(/\*[^*]*\*/g, "").replace(/\s+/g, " ").trim() || "...";
}

export default async function ChatsPage() {
  const userId = (await getUserId()) ?? 0;
  const [rows, custom] = userId
    ? await Promise.all([getChatList(userId), getCustomCharacters(userId)])
    : [[], []];
  const byId = new Map([...custom, ...characters].map((c) => [c.id, c]));
  const items = rows.flatMap((r) => {
    const c = byId.get(r.character_id);
    return c ? [{ ...r, c }] : [];
  });

  return (
    <main className="mx-auto flex min-h-full w-full max-w-md flex-col px-5 pb-24 pt-10">
      <header className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-zinc-800">
          채팅
          <span className="bg-gradient-to-r from-rose-400 to-purple-400 bg-clip-text text-transparent">
            .
          </span>
        </h1>
      </header>

      {items.length === 0 ? (
        <p className="pt-16 text-center text-sm text-zinc-400">
          아직 나눈 대화가 없어요.
          <br />
          친구 탭에서 말을 걸어보세요 💌
        </p>
      ) : (
        <ul className="flex flex-col">
          {items.map(({ c, content, created_at }) => (
            <li key={c.id}>
              <Link
                href={`/chat/${c.id}`}
                className="flex items-center gap-3.5 rounded-2xl px-2 py-3 transition-colors hover:bg-white/70"
              >
                <div
                  className={`flex h-[52px] w-[52px] shrink-0 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br ${c.gradient} text-xl shadow-inner`}
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
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="truncate font-semibold text-zinc-800">
                      {c.name}
                    </span>
                    <span className="shrink-0 text-[11px] text-zinc-400">
                      {formatTime(created_at)}
                    </span>
                  </div>
                  <p className="mt-0.5 truncate text-sm text-zinc-500">
                    {preview(content)}
                  </p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <TabBar active="/chats" />
    </main>
  );
}
