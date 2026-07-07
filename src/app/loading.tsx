export default function Loading() {
  return (
    <main className="mx-auto flex min-h-full w-full max-w-md flex-col px-5 pb-24 pt-10">
      <div className="mb-8 flex justify-center">
        <div className="h-10 w-24 animate-pulse rounded-2xl bg-white/60" />
      </div>
      <div className="mb-6 h-24 animate-pulse rounded-3xl bg-white/50" />
      <div className="flex flex-col gap-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-24 animate-pulse rounded-3xl bg-white/60" />
        ))}
      </div>
    </main>
  );
}
