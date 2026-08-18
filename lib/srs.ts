/**
 * Araliklio tekrar zamanlamasi — FSRS.
 *
 * Onceki surum SM-2'nin sadelestirilmis haliydi: sabit bir formul, herkese ayni
 * araliklar. FSRS (Free Spaced Repetition Scheduler) bunun yerine iki degeri
 * takip ediyor:
 *   - stability:  bu kelimeyi ne kadar sure hatirlayabiliyorsun
 *   - difficulty: bu kelime senin icin ne kadar zor
 * ve araligi "unutma olasiligin %10'a ciktigi an" olacak sekilde seciyor.
 *
 * Asil kazanci: parametreleri (w dizisi) sabit degil. Yeterince tekrar
 * birikince tarayicidaki optimizer bunlari senin kendi gecmisinden yeniden
 * hesapliyor (bkz. lib/optimizer.ts), yani zamanlama zamanla sana gore
 * sekilleniyor.
 *
 * Disari verdigi arayuz (Grade, SrsState, schedule, dueLabel) bilerek eskisiyle
 * ayni tutuldu; cagiran ekranlarin degismesi gerekmedi.
 */

import {
  Rating,
  State,
  createEmptyCard,
  fsrs,
  generatorParameters,
  type Card,
  type FSRSParameters,
  type Grade as FsrsGrade,
} from "ts-fsrs";

export type Grade = "again" | "hard" | "good" | "easy";

export interface SrsState {
  /** Kac kez tekrar edildi. */
  reps: number;
  /** Gun cinsinden son verilen aralik — ekranda gosteriliyor. */
  interval: number;
  /**
   * Eski SM-2 kolaylik carpani. FSRS kullanmiyor ama eski kayitlar bu alanla
   * yazilmisti; silmek yerine birakiyoruz ki goc sirasinda veri kaybolmasin.
   */
  ease: number;
  /** Kac kez unutuldu. */
  lapses: number;
  /** Bir sonraki tekrar zamani (ms). */
  due: number;
  status: "new" | "learning" | "review";
  /** FSRS: hatirlama dayanikliligi (gun). */
  stability: number;
  /** FSRS: kelimenin zorlugu (1-10). */
  difficulty: number;
  /** FSRS: ogrenme adimlarinda kacinci basamak. */
  learningSteps: number;
  /** Son tekrarin zamani (ms); FSRS gecen sureyi buradan hesapliyor. */
  lastReview: number | null;
}

const DAY = 24 * 60 * 60 * 1000;

export const INITIAL_SRS: Omit<SrsState, "due"> = {
  reps: 0,
  interval: 0,
  ease: 2.5,
  lapses: 0,
  status: "new",
  stability: 0,
  difficulty: 0,
  learningSteps: 0,
  lastReview: null,
};

const RATING: Record<Grade, FsrsGrade> = {
  again: Rating.Again,
  hard: Rating.Hard,
  good: Rating.Good,
  easy: Rating.Easy,
};

const STATUS: Record<State, SrsState["status"]> = {
  [State.New]: "new",
  [State.Learning]: "learning",
  [State.Review]: "review",
  // Unutulmus kart yeniden ogreniliyor; bizim ucuncu bir durumumuz yok.
  [State.Relearning]: "learning",
};

const STATE: Record<SrsState["status"], State> = {
  new: State.New,
  learning: State.Learning,
  review: State.Review,
};

/**
 * Optimizer'in bulduğu parametreler. Bos birakilirsa FSRS'in varsayilanlari
 * kullaniliyor — yani optimizer hic calismasa da sistem calisir.
 */
let parameters: FSRSParameters = generatorParameters({
  // Hedef: tekrar aninda kelimeyi %90 ihtimalle hatirliyor olmak.
  request_retention: 0.9,
  learning_steps: ["1m", "10m"],
});
let scheduler = fsrs(parameters);

export function setSrsWeights(
  w: number[] | null,
  requestRetention = 0.9,
): void {
  parameters = generatorParameters({
    request_retention: requestRetention,
    learning_steps: ["1m", "10m"],
    ...(w && w.length ? { w } : {}),
  });
  scheduler = fsrs(parameters);
}

export function requestRetention(): number {
  return parameters.request_retention;
}

export function srsWeights(): readonly number[] {
  return parameters.w;
}

/** Kaydimizi FSRS kartina cevirir; eksik alanlar bos kart degerleriyle dolar. */
function toCard(state: SrsState): Card {
  const empty = createEmptyCard(state.lastReview ?? Date.now());
  return {
    ...empty,
    due: new Date(state.due),
    stability: state.stability || empty.stability,
    difficulty: state.difficulty || empty.difficulty,
    scheduled_days: state.interval,
    learning_steps: state.learningSteps,
    reps: state.reps,
    lapses: state.lapses,
    state: STATE[state.status],
    ...(state.lastReview ? { last_review: new Date(state.lastReview) } : {}),
  };
}

export function schedule(
  state: SrsState,
  grade: Grade,
  now = Date.now(),
): SrsState {
  const { card } = scheduler.next(toCard(state), now, RATING[grade]);
  return {
    ...state,
    reps: card.reps,
    interval: card.scheduled_days,
    lapses: card.lapses,
    due: card.due.getTime(),
    status: STATUS[card.state],
    stability: card.stability,
    difficulty: card.difficulty,
    learningSteps: card.learning_steps,
    lastReview: now,
  };
}

/**
 * Su an kelimeyi hatirlama olasiligin (0-1). Ekranda "hafizanda ne kadar
 * taze" cubugu olarak gosteriliyor.
 */
export function retrievability(state: SrsState, now = Date.now()): number {
  if (state.status === "new" || !state.stability) return 0;
  return scheduler.get_retrievability(toCard(state), now, false);
}

/** Insanin okuyabilecegi "ne zaman tekrar" metni. */
export function dueLabel(due: number, now = Date.now()): string {
  const diff = due - now;
  if (diff <= 0) return "şimdi";
  const minutes = Math.round(diff / 60000);
  if (minutes < 60) return `${minutes} dk sonra`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} saat sonra`;
  const days = Math.round(diff / DAY);
  if (days < 30) return `${days} gün sonra`;
  const months = Math.round(days / 30);
  return months < 12 ? `${months} ay sonra` : `${Math.round(days / 365)} yıl sonra`;
}
