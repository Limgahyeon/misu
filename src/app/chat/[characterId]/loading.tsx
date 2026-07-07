export default function Loading() {
  return (
    <div className="fixed inset-x-0 top-0 mx-auto flex h-dvh w-full max-w-md flex-col">
      <header className="flex items-center gap-3 border-b border-white/60 bg-white/60 px-4 py-3 backdrop-blur-md">
        <div className="h-9 w-9 animate-pulse rounded-full bg-white/80" />
        <div className="h-4 w-20 animate-pulse rounded bg-white/80" />
      </header>
      <div className="flex-1 space-y-4 px-4 py-5">
        <div className="h-14 w-2/3 animate-pulse rounded-3xl bg-white/60" />
        <div className="ml-auto h-10 w-1/2 animate-pulse rounded-3xl bg-rose-100/70" />
        <div className="h-14 w-3/5 animate-pulse rounded-3xl bg-white/60" />
      </div>
    </div>
  );
}
