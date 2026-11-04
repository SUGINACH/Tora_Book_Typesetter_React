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

export interface UiRuntime {
  readonly client: WorkerClient;
  readonly bundle: BrowserAssetBundle;
  readonly controller: TypesetController;
}

let injected: UiRuntime | null = null;
let realRuntime: Promise<UiRuntime> | null = null;

/** הזרקת הקשר חלופי — בדיקות בלבד; null מחזיר לייצור. */
export function setUiRuntime(runtime: UiRuntime | null): void {
  injected = runtime;
  realRuntime = null;
}

/** ההקשר הפעיל — מוזרק אם יש, אחרת נבנה בעצלתם (ויחיד) לייצור. */
export function getUiRuntime(): Promise<UiRuntime> {
  if (injected !== null) return Promise.resolve(injected);
  if (realRuntime === null) {
    realRuntime = (async () => {
      const client = createBrowserWorkerClient();
      const bundle = await loadBrowserAssetBundle();
      const controller = new TypesetController({ client });
      return { client, bundle, controller };
    })();
  }
  return realRuntime;
}
