/**
 * lean-layout.ts — העברת IR רזה בערוץ ה־Worker (פרוטוקול v2; תיקון שורש
 * 2026-11-09/ג' — פצצות זיכרון בספר בגודל אמיתי).
 *
 * הבעיה שנמדדה באתר החי: העברת ה־IR כמחרוזת JSON קנונית (layoutJson)
 * שילשה את הזיכרון — ספר של 517 עמודים מניב layout.json של 287MB: המחרוזת
 * בעובד, העתק postMessage, ואז JSON.parse + גרף אובייקטים נוסף בחוט
 * הראשי ⇒ פסגת 4GB+ וקריסת לשונית ("Aw snap") במכונות רגילות. נמדד
 * בפועל: הריצה טיפסה ל־4,029MB והלשונית קרסה.
 *
 * הפתרון: העובד מעביר **את אותו IR בלי נתוני הגליפים** (glyphs: [] —
 * ~87% מהנפח; הביקורת וההיטל אינם קוראים אותם; אומת בקוד audit-core
 * וב־preview-model) דרך structured clone — בלי מחרוזת ביניים ובלי פרסור
 * כפול. ה־layoutHash מגיע מהמניפסט של המנוע (אותה זהות קנונית; הסריאליזציה
 * הקנונית עצמה נשארת ב־CLI בלבד). העלאת פרוטוקול ל־v2 — עובד ישן שנטען
 * ממטמון דפדפן יידחה בקול רם (protocolVersion).
 *
 * טהור לחלוטין: אין DOM/Worker/רשת; אותו קלט ⇐ אותו פלט.
 */
import type { LayoutDocument, LayoutPage, PlacedItem } from '@tora/layout-api';

/** ריצה רזה — glyphs ריקים קבועים (משותף לכל הריצות; structured clone מעתיק מערכים). */
const EMPTY_GLYPHS: readonly never[] = Object.freeze([]);

function leanRun<T extends { readonly glyphs: readonly unknown[] }>(run: T): T {
  return { ...run, glyphs: EMPTY_GLYPHS };
}

function leanPage(page: LayoutPage): LayoutPage {
  const items = (page.items as readonly PlacedItem[]).map((item) => {
    if (item.kind !== 'line') return item; // סמני הערה — כמות שהם
    return { ...item, runs: item.runs.map(leanRun) };
  });
  return { ...page, items };
}

/**
 * היטל ה־IR לצורתו הרזה — אותם עמודים/קווים/ריצות/אטומים, בלי גליפים.
 * הטיפוס זהה (LayoutDocument) — מערך glyphs ריק הוא ערך חוקי של השדה;
 * הוולידציה הקנונית (parseLayoutDocument) דורשת glyphs לא־ריקים ולכן
 * הערוץ הרזה נבדק על ידי isLeanLayout בלבד.
 */
export function toLeanLayout(layout: LayoutDocument): LayoutDocument {
  return { ...layout, pages: layout.pages.map(leanPage) };
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/**
 * ולידציה מבנית של ה־IR הרזה בצד המקבל — הערוץ חייב להיבדק (כמו שהמחרוזת
 * נפרסה ב־parseLayoutDocument בעבר), אבל בלי לדרוש גליפים. בדיקת העומק
 * מדגימה עמוד ראשון ואחרון + כל סוגי הפריטים מתוך העמוד הראשון — שילוב
 * של עלות נמוכה וכיסוי מבני אמיתי.
 */
export function isLeanLayout(v: unknown): v is LayoutDocument {
  if (!isRecord(v)) return false;
  if (v.schemaVersion !== 1 || typeof v.policyId !== 'string') return false;
  if (!Array.isArray(v.pages) || v.pages.length === 0) return false;
  for (const page of [v.pages[0], v.pages[v.pages.length - 1]]) {
    if (!isRecord(page) || typeof page.id !== 'string' || !Array.isArray(page.items)) return false;
    for (const item of page.items) {
      if (!isRecord(item)) return false;
      if (item.kind !== 'line') continue;
      if (!Array.isArray(item.runs)) return false;
      for (const run of item.runs) {
        if (!isRecord(run)) return false;
        if (typeof run.id !== 'string' || typeof run.text !== 'string') return false;
        if (run.direction !== 'rtl' && run.direction !== 'ltr') return false;
        if (!Array.isArray(run.atomIds)) return false;
        if (run.glyphs !== undefined && !Array.isArray(run.glyphs)) return false;
      }
    }
  }
  return true;
}
