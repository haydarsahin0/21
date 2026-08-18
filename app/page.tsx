import { Dictionary } from "@/components/dictionary";
import { NebulaBackground } from "@/components/nebula-background";

export default function Home() {
  return (
    <div className="relative min-h-dvh overflow-x-hidden">
      <NebulaBackground />

      {/* Baslik telefonda ekranin yarisini yemesin: kucuk ekranda daha dar
          bosluk ve kisa alt yazi, genis ekranda eski ferahligi koruyor. */}
      <main className="relative z-10 mx-auto w-full max-w-2xl px-5 pt-8 pb-24 sm:pt-16">
        <header className="mb-6 text-center sm:mb-10">
          <h1 className="text-3xl font-semibold tracking-tight sm:text-5xl">
            Kelime Sözlüğü
          </h1>
          <p className="text-muted-foreground mt-2 hidden text-balance sm:mt-3 sm:block">
            Bir kelime yaz, öğretmenle konuşur gibi aç: anlamı, bağlamı, örnek
            cümleler. Sonra ne merak ediyorsan sor.
          </p>
        </header>

        <Dictionary />
      </main>
    </div>
  );
}
