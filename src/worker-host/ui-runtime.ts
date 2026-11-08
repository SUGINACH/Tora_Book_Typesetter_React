/**
 * ui-runtime.ts — הזמן־ריצה של מעטפת ה־UI (שלב 77).
 *
 * ייצור: לקוח Worker אמיתי (browser-client) + צרור נכסים אמיתי
 * (asset-bundle) — נבנים בעצלתם ונשמרים לכל חיי האפליקציה. בדיקות:
 * setUiRuntime מזריק הקשר חלופי (לקוח על פורט מזויף + נכסי דגל) — כך
 * ה־E2E של המעטפת רץ את המנוע האמיתי דרך הפרוטוקול בלי דפדפן.
 *
 * המנצח (TypesetController) נבנה פעם אחת לכל הריצה — אין שניים, אין
 * מצב משותף מתחרה (אין שיתוף provider לא נעול בין hosts; §12).
 */
import { TypesetController } from './typeset-run.js';
import type { BrowserAssetBundle } from './asset-bundle.js';
import { loadBrowserAssetBundle } from './asset-bundle.js';
import { createBrowserWorkerClient } from './browser-client.js';
import type { WorkerClient } from './worker-client.js';
import { previewFontFamilyOf } from '../renderers/preview-model.js';

export interface UiRuntime {
  readonly client: WorkerClient;
  readonly bundle: BrowserAssetBundle;
  readonly controller: TypesetController;
}

/**
 * רישום גופני התצוגה מה-bytes שכבר נטענו לעובד (תיקון שורש 2026-11-09 —
 * כישלון העמדה באתר החי): הריצות בתצוגה עוגנות למשפחת `tora-<fontId>`
 * (previewFontFamilyOf — זהה ל-CLI), ולכן המשפחה חייבת להירשם בדפדפן מאותם
 * bytes שאומתו ב-sha256 — אחרת הטקסט נפל לגופן חלופי במדדים זרים וכל
 * השורות נראו שבורות. לא רשת חדשה: אותם bytes, אותה זהות, בלבד הצבה
 * ב-fonts של המסמך. כשל רישום אינו מפיל את העימוד (העובד ממשיך מה-byts
 * שלו) — הוא נרשם ב-console והתצוגה נופלת לגופן ברירת המחדל; זהו מצב
 * מתועד של ירידת נאמנות תצוגה בלבד, לא איבוד שקט של תוצאה.
 */
function registerPreviewFonts(bundle: BrowserAssetBundle): void {
  if (typeof document === 'undefined' || typeof FontFace === 'undefined') return;
  for (const { record, bytes } of bundle.fonts) {
    try {
      const face = new FontFace(previewFontFamilyOf(record.fontId), bytes.slice().buffer as ArrayBuffer, {
        weight: String(record.weight ?? '400'),
        style: record.style === 'italic' ? 'italic' : 'normal',
      });
      document.fonts.add(face);
      void face.load().catch((e: unknown) => {
        console.error(`[preview-font] load failed: ${record.file} — ${e instanceof Error ? e.message : String(e)}`);
      });
    } catch (e) {
      console.error(`[preview-font] register failed: ${record.file} — ${e instanceof Error ? e.message : String(e)}`);
    }
  }
}

let injected: UiRuntime | null = null;
let realRuntime: Promise<UiRuntime> | null = null;
let resolvedReal: UiRuntime | null = null;

/** הזרקת הקשר חלופי — בדיקות בלבד; null מחזיר לייצור. */
export function setUiRuntime(runtime: UiRuntime | null): void {
  injected = runtime;
  realRuntime = null;
  resolvedReal = null;
}

/**
 * הצצה סינכרונית — ההקשר רק אם כבר קיים (מוזרק או שנבנה ונפרס עד תום).
 * שלב 80: ייבוא מסמך חדש מבטל ריצה פעילה דרך כאן — בלי לבנות זמן־ריצה
 * רק כדי לבטל (בנייה ראשונה טוענת גופנים; אם לא נבנה — אין job פעיל).
 */
export function peekUiRuntime(): UiRuntime | null {
  if (injected !== null) return injected;
  return resolvedReal;
}

/** ההקשר הפעיל — מוזרק אם יש, אחרת נבנה בעצלתם (ויחיד) לייצור. */
export function getUiRuntime(): Promise<UiRuntime> {
  if (injected !== null) return Promise.resolve(injected);
  if (realRuntime === null) {
    // הצרור נטען לפני יצירת העובד: כישלון רשת (404/מניפסט) אינו משאיר
    // Worker יתום שנוצר לשווא. תיקון שורש נוסף: הבטחה דחויה אינה נשמרת
    // במטמון — הניסיון הבא בונה מחדש (אחרת כל לחיצה נוספת הייתה נכשלת
    // מיד מאותה דחייה כלואה, גם אחרי התאוששות הרשת).
    const pending = (async () => {
      const bundle = await loadBrowserAssetBundle();
      registerPreviewFonts(bundle);
      const client = createBrowserWorkerClient();
      const controller = new TypesetController({ client });
      const runtime: UiRuntime = { client, bundle, controller };
      resolvedReal = runtime;
      return runtime;
    })();
    pending.catch(() => {
      if (realRuntime === pending) realRuntime = null;
    });
    realRuntime = pending;
  }
  return realRuntime;
}
