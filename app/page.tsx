import { Dictionary } from "@/components/dictionary";
import { NebulaBackground } from "@/components/nebula-background";

export default function Home() {
  return (
    <div className="relative min-h-dvh overflow-x-hidden">
      <NebulaBackground />

      <main className="relative z-10 mx-auto w-full max-w-2xl px-5 pt-16 pb-24">
        <header className="mb-10 text-center">
          <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
            Kelime Sözlüğü
          </h1>
          <p className="text-muted-foreground mt-3 text-balance">
            Hedef dilde ara — Türkçe karşılığı, o dilin kendi tanımı ve eş
            anlamlıları bir arada.
          </p>
        </header>

        <Dictionary />
      </main>
    </div>
  );
}
