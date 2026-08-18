"use client";

/**
 * Akan metni duzgun bir tempoda ortaya cikarir.
 *
 * Model cevabi SSE ile parca parca geliyor ama parcalar duzensiz: bazen tek
 * kelime, bazen bir anda iki cumle. Ham haliyle basinca metin zipliyor. Burada
 * gelen metin bir hedef tampona yaziliyor, ekrana ise olculu bir tempoyla
 * aktariliyor.
 *
 * Tempo KARE sayisina degil GECEN ZAMANA bagli. Kare basina sabit adim
 * kullanmak, kare hizi dusen bir cihazda (arka plandaki parcacik sahnesi
 * zorlarsa ya da telefon yavassa) metnin surunmesine yol aciyordu.
 */

/** Taban hiz: saniyede kac karakter. */
const BASE_CHARS_PER_SECOND = 220;
/** Birikim buyudukce hizlan; okuyucu akisin gerisinde kalmasin. */
const BACKLOG_GAIN = 6;
/**
 * rAF hic calismazsa (sekme arka planda) finish() sonsuza kadar beklerdi ve
 * sohbet kilitli kalirdi. Bu sure sonunda kalan metin oldugu gibi gosterilir.
 */
const FINISH_FALLBACK_MS = 2500;

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

export class Typewriter {
  private target = "";
  private shownLength = 0;
  private raf = 0;
  private lastTs = 0;
  private finished = false;
  private resolveFinish: ((text: string) => void) | null = null;
  private fallback: ReturnType<typeof setTimeout> | null = null;
  /**
   * Iptal edildikten sonra hicbir sey yazilmamali. Akis kapanirken son parca
   * ya da gec cagrilan bir finish(), iptal edilmis yaziciyi yeniden
   * calistirip temizlenmis metni ekrana geri koyabiliyordu.
   */
  private cancelled = false;
  private readonly instant: boolean;

  constructor(private readonly onUpdate: (text: string) => void) {
    this.instant = prefersReducedMotion();
  }

  /** Modelden gelen yeni parca. */
  push(chunk: string): void {
    if (this.cancelled) return;
    this.target += chunk;
    if (this.instant) {
      this.shownLength = this.target.length;
      this.onUpdate(this.target);
      return;
    }
    this.start();
  }

  /**
   * Akis bitti. Ekrandaki metin hedefe yetisince cozulur — boylece kalan kisim
   * bir anda patlamak yerine akarak biter.
   */
  finish(): Promise<string> {
    if (this.cancelled) return Promise.resolve(this.target.slice(0, this.shownLength));
    this.finished = true;

    if (this.instant || this.shownLength >= this.target.length) {
      this.flush();
      return Promise.resolve(this.target);
    }

    this.start();
    return new Promise((resolve) => {
      this.resolveFinish = resolve;
      this.fallback = setTimeout(() => this.flush(), FINISH_FALLBACK_MS);
    });
  }

  /** Kullanici durdurdu: o ana kadar gorunen metni dondurur. */
  cancel(): string {
    this.cancelled = true;
    this.stopTimers();
    const resolve = this.resolveFinish;
    this.resolveFinish = null;
    const shown = this.target.slice(0, this.shownLength);
    // Bekleyen finish() sonsuza kadar asili kalmasin.
    resolve?.(shown);
    return shown;
  }

  private stopTimers(): void {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
    if (this.fallback) clearTimeout(this.fallback);
    this.fallback = null;
  }

  /** Kalan her seyi goster ve bekleyeni coz. */
  private flush(): void {
    this.stopTimers();
    if (this.shownLength < this.target.length) {
      this.shownLength = this.target.length;
      this.onUpdate(this.target);
    }
    const resolve = this.resolveFinish;
    this.resolveFinish = null;
    resolve?.(this.target);
  }

  private start(): void {
    if (this.raf || typeof window === "undefined") return;
    this.raf = requestAnimationFrame(this.tick);
  }

  private readonly tick = (ts: number): void => {
    this.raf = 0;

    const remaining = this.target.length - this.shownLength;
    if (remaining <= 0) {
      this.lastTs = 0;
      if (this.finished) this.flush();
      return;
    }

    // Ilk karede referans yok; bir kare varsay. Ust sinir, sekme arka plandan
    // dondugunde tek karede her seyi bosaltmasini engellemiyor — tam tersine,
    // geciken sureyi telafi etmesini istiyoruz.
    const delta = this.lastTs ? Math.min(ts - this.lastTs, 1000) : 16;
    this.lastTs = ts;

    const perSecond = BASE_CHARS_PER_SECOND + remaining * BACKLOG_GAIN;
    const step = Math.max(2, Math.round((delta / 1000) * perSecond));

    this.shownLength = Math.min(this.target.length, this.shownLength + step);
    this.onUpdate(this.target.slice(0, this.shownLength));

    if (this.shownLength >= this.target.length && this.finished) {
      this.flush();
      return;
    }

    this.start();
  };
}
