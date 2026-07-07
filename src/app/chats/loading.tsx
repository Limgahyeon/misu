export default function Loading() {
  return (
    <main className="mx-auto flex min-h-full w-full max-w-md flex-col px-5 pb-24 pt-10">
      <div className="mb-6 h-8 w-20 animate-pulse rounded-xl bg-white/60" />
      <div className="flex flex-col gap-2">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="flex items-center gap-3.5 px-2 py-3">
            <div className="h-[52px] w-[52px] animate-pulse rounded-full bg-white/70" />
            <div className="flex-1 space-y-2">
              <div className="h-4 w-24 animate-pulse rounded bg-white/70" />
              <div className="h-3 w-40 animate-pulse rounded bg-white/50" />
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}
