import Link from "next/link";

const TABS = [
  { href: "/", label: "친구", icon: "🧸" },
  { href: "/chats", label: "채팅", icon: "💬" },
] as const;

export default function TabBar({ active }: { active: "/" | "/chats" }) {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40">
      <div className="mx-auto flex w-full max-w-md border-t border-white/60 bg-white/80 backdrop-blur-md">
        {TABS.map((t) => (
          <Link
            key={t.href}
            href={t.href}
            className={`flex flex-1 flex-col items-center gap-0.5 py-2.5 text-[11px] transition-colors ${
              active === t.href
                ? "font-semibold text-rose-400"
                : "text-zinc-400 hover:text-zinc-600"
            }`}
          >
            <span className="text-lg leading-none">{t.icon}</span>
            {t.label}
          </Link>
        ))}
      </div>
    </nav>
  );
}
