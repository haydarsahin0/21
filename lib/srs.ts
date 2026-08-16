/**
 * Araliklio tekrar zamanlamasi (SM-2'nin sadelestirilmis hali).
 *
 * Amac: bir kelimeyi tam unutmadan hemen once tekrar getirmek. Dogru
 * bilindikce aralik buyur, yanlis bilinince basa doner.
 */

export type Grade = "again" | "hard" | "good" | "easy";

export interface SrsState {
  /** Kac kez ust uste dogru bilindi. */
  reps: number;
  /** Gun cinsinden bir sonraki araligin uzunlugu. */
  interval: number;
  /** Kolaylik carpani; zorlandikca duser. */
  ease: number;
  /** Kac kez unutuldu. */
  lapses: number;
  /** Bir sonraki tekrar zamani (ms). */
  due: number;
  status: "new" | "learning" | "review";
}

export const INITIAL_SRS: Omit<SrsState, "due"> = {
  reps: 0,
  interval: 0,
  ease: 2.5,
  lapses: 0,
  status: "new",
};

const DAY = 24 * 60 * 60 * 1000;
/** Ilk ogrenme adimlari: ayni oturumda kisa araliklarla iki kez donuyor. */
const LEARNING_STEPS_MIN = [1, 10];

export function schedule(state: SrsState, grade: Grade, now = Date.now()): SrsState {
  const next: SrsState = { ...state };

  if (grade === "again") {
    next.reps = 0;
    next.lapses += 1;
    next.interval = 0;
    next.status = "learning";
    next.ease = Math.max(1.3, next.ease - 0.2);
    next.due = now + LEARNING_STEPS_MIN[0] * 60 * 1000;
    return next;
  }

  if (next.status !== "review") {
    // Ogrenme asamasi: once dakikalik adimlar, sonra gerceek araliga gec.
    const step = next.reps;
    if (step < LEARNING_STEPS_MIN.length) {
      next.reps += 1;
      next.status = "learning";
      next.due = now + LEARNING_STEPS_MIN[step] * 60 * 1000;
      return next;
    }
    next.status = "review";
    next.reps += 1;
    next.interval = grade === "easy" ? 3 : 1;
    next.due = now + next.interval * DAY;
    return next;
  }

  // Tekrar asamasi
  const factor = grade === "hard" ? 1.2 : grade === "easy" ? next.ease * 1.3 : next.ease;
  next.ease =
    grade === "hard"
      ? Math.max(1.3, next.ease - 0.15)
      : grade === "easy"
        ? next.ease + 0.15
        : next.ease;
  next.reps += 1;
  next.interval = Math.max(1, Math.round(Math.max(next.interval, 1) * factor));
  next.due = now + next.interval * DAY;
  return next;
}

/** Insanin okuyabilecegi "ne zaman tekrar" metni. */
export function dueLabel(due: number, now = Date.now()): string {
  const diff = due - now;
  if (diff <= 0) return "şimdi";
  const minutes = Math.round(diff / 60000);
  if (minutes < 60) return `${minutes} dk sonra`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} saat sonra`;
  const days = Math.round(hours / 24);
  return `${days} gün sonra`;
}
