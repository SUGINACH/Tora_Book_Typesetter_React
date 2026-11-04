/**
 * result-store.ts — תוצאות העימוד בלבד (שלב 76; אפיון §13.1).
 *
 * "resultStore — Layout IR, manifest, findings ו־AnchorTable."
 *
 *   1. ה־IR מגיע מוכן וקפוא מה־Worker (סריאליזציה קנונית); ה־store
 *      **אינו מייצר עימוד** — הוא מחזיק ומקפיא. כל הכנסה עוברת
 *      deepFreeze איטרטיבי (מחסנית, לא רקורסיה) שבטוח למחזורים —
 *      מסמך אמיתי הוא גרף, ו־RangeError על עומק אינו אופציה.
 *   2. ה־UI אינו יכול לשנות תוצאה: Object.freeze עמוק בכתיבה, ולא
 *      "אמון בהבטחות" — שינוי בזמן ריצה זורק במצב strict (המעטפת).
 *   3. הכנסה חדשה מחליפה את הקודמת בשלמותה — אין מיזוג; תוצאה ישנה
 *      לעולם אינה מוצגת כחדשה (stale-job בשכבת ה־run).
 */
import { create } from 'zustand';
import type { AnchorTable, LayoutDocument, RunManifest, SourceSpan } from '@tora/layout-api';

/** ממצא אחיד (§14.1) — חוזה משותף ל־TextAuditFinding ו־LayoutAuditFinding. */
export interface ResultFinding {
  readonly code: string;
  readonly severity: 'HIGH' | 'MEDIUM' | 'LOW';
  readonly messageKey: string;
  readonly params: Readonly<Record<string, string | number>>;
  readonly sourceSpans: readonly SourceSpan[];
  readonly pageId?: string;
  readonly regionId?: string;
  readonly itemId?: string;
  readonly actual?: string | number;
  readonly expected?: string | number;
}

export interface TypesetResultInput {
  readonly ir: LayoutDocument;
  readonly manifest: RunManifest;
  readonly findings?: readonly ResultFinding[];
  readonly anchors?: AnchorTable | null;
}

/**
 * deepFreeze איטרטיבי — מחסנית מפורשת (לא רקורסיה), WeakSet לזיהוי
 * מחזורים; פרימיטיבים ומבנים קפואים־מראש עוברים ללא מגע. טיפוסים
 * אטומים (Uint8Array וכו') אינם נאטמים — freeze על TypedArray זורק
 * ב־strict, והם מחוץ לחוזה כאן.
 */
export function deepFreeze<T>(value: T): T {
  const seen = new WeakSet<object>();
  const stack: unknown[] = [value];
  while (stack.length > 0) {
    const cur = stack.pop();
    if (cur === null || typeof cur !== 'object') continue;
    if (Object.isFrozen(cur)) continue;
    if (seen.has(cur)) continue; // מחזור — כבר בתהליך/נעשה
    seen.add(cur);
    if (ArrayBuffer.isView(cur)) continue; // TypedArray/ DataView — לא נאטמים
    Object.freeze(cur);
    for (const key of Reflect.ownKeys(cur)) {
      const child = (cur as Record<PropertyKey, unknown>)[key];
      if (child !== null && typeof child === 'object') stack.push(child);
    }
  }
  return value;
}

interface ResultStoreState {
  readonly ir: Readonly<LayoutDocument> | null;
  readonly manifest: Readonly<RunManifest> | null;
  readonly findings: readonly ResultFinding[];
  readonly anchors: Readonly<AnchorTable> | null;
  readonly layoutHash: string | null;
  setResult(input: TypesetResultInput, layoutHash: string): void;
  /** ניקוי מלא (מסמך חדש/ביטול) — אין "תוצאה ריקה חלקית". */
  reset(): void;
}

export const useResultStore = create<ResultStoreState>()((set) => ({
  ir: null,
  manifest: null,
  findings: Object.freeze([]),
  anchors: null,
  layoutHash: null,

  setResult: (input, layoutHash) =>
    set({
      // הכנסה ⇐ הקפאה עמוקה: מה שנכנס ל־store אינו בר־שינוי, כולל הממצאים.
      ir: deepFreeze(input.ir) as Readonly<LayoutDocument>,
      manifest: deepFreeze(input.manifest) as Readonly<RunManifest>,
      findings: deepFreeze([...(input.findings ?? [])]) as readonly ResultFinding[],
      anchors: input.anchors === null || input.anchors === undefined ? null : (deepFreeze(input.anchors) as Readonly<AnchorTable>),
      layoutHash,
    }),

  reset: () =>
    set({
      ir: null,
      manifest: null,
      findings: Object.freeze([]),
      anchors: null,
      layoutHash: null,
    }),
}));
