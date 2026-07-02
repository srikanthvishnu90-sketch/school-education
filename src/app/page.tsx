export default function Home() {
  return (
    <main className="flex flex-1 items-center justify-center p-8">
      <section className="w-full max-w-xl rounded-card bg-white p-10 shadow-sm ring-1 ring-ink-wash">
        <p className="text-sm font-medium tracking-wide text-ink-tint uppercase">
          plumb
        </p>
        <h1 className="mt-3 text-2xl font-semibold text-ink-black">
          Scaffold ready.
        </h1>
        <p className="mt-3 text-secondary">
          A personal instrument for accurate academic self-knowledge. Predict,
          see the truth, decompose the gap, commit one next action. No product
          surfaces yet — this page only confirms the build is wired.
        </p>

        {/* Token check: alignment vs gap use the ink/warm families, never red/green. */}
        <div className="mt-8 flex gap-3 text-sm">
          <span className="rounded-control bg-ink-wash px-3 py-1 text-aligned">
            aligned
          </span>
          <span className="rounded-control px-3 py-1 text-gap ring-1 ring-warm/40">
            gap
          </span>
        </div>
      </section>
    </main>
  );
}
