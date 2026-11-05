/**
 * progress-display.ts — תצוגת התקדמות דטרמיניסטית (שלב 83; אפיון §13.4
 * בתכנית — "progress דטרמיניסטי בתצוגה (אחוזים אינם קלט למנוע)").
 *
 * האחוזים נגזרים כאן, בתצוגה בלבד, מהיחידות שהמנוע דיווח דרך הפרוטוקול
 * (stage, completedUnits, totalUnits? — סבב ההעברה הנאמנה של שלב 83).
 * שום ערך מחושב כאן אינו חוזר אל המנוע, אל הבקשה אל אל ה־IR — טהור,
 * ללא DOM, ולכן אותה שורה מוצגת פעמיים זהה ביט־לביט (דטרמיניזם §17.2#1).
 */
export interface ProgressLike {
  readonly stage: string;
  readonly completedUnits: number;
  readonly totalUnits: number | null;
}

/** אחוז שלם 0..100 — ‎null‏ כשאין סך יחידות (אין המצאת מכנה). */
export function progressPercent(p: Readonly<ProgressLike>): number | null {
  if (p.totalUnits === null || !Number.isFinite(p.totalUnits) || p.totalUnits <= 0) return null;
  if (!Number.isFinite(p.completedUnits)) return null;
  const ratio = p.completedUnits / p.totalUnits;
  if (!Number.isFinite(ratio)) return null;
  return Math.max(0, Math.min(100, Math.floor(ratio * 100)));
}

/** שורת התקדמות אחידה לכל התצוגות: ‎`breaking 12/40 — 30%`‎ או ‎`parse 3`‎. */
export function formatProgress(p: Readonly<ProgressLike> | null): string {
  if (p === null) return '';
  const completed = Number.isFinite(p.completedUnits) ? p.completedUnits : 0;
  const withTotal =
    p.totalUnits !== null && Number.isFinite(p.totalUnits) && p.totalUnits > 0
      ? `${p.stage} ${completed}/${p.totalUnits}`
      : `${p.stage} ${completed}`;
  const pct = progressPercent(p);
  return pct === null ? withTotal : `${withTotal} — ${pct}%`;
}
