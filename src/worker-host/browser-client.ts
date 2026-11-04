/**
 * browser-client.ts — קשירת ה־WorkerClient ל־Worker אמיתי בדפדפן (שלב 77).
 *
 * המנוע (layout-engine + HarfBuzz + הנכסים) נטען **בתוך ה־Worker** בלבד
 * (§12.1); החוט הראשי מחזיק רק את הפרוטוקול. vite בונה את העובד מה־entry
 * (new URL + type:module; תצורת worker.format:'es' כבר ב־vite.config).
 *
 * אין יצירה בזמן ייבוא — הפונקציה נקראת מ־ui-runtime בלבד (ובבדיקות
 * מוזרק client חלופי; לעולם לא נבנה Worker אמיתי ב־Node/jsdom).
 */
import { WorkerClient, type WorkerLike } from './worker-client.js';
import type { WorkerRequest, WorkerResponse } from './protocol.js';

/** בניית הלקוח על Worker אמיתי — לייצור בדפדפן בלבד. */
export function createBrowserWorkerClient(): WorkerClient {
  const worker = new Worker(new URL('./worker-entry.ts', import.meta.url), { type: 'module' });
  const workerLike: WorkerLike = {
    postMessage: (msg: WorkerRequest) => {
      worker.postMessage(msg);
    },
    onMessage: (handler: (msg: WorkerResponse) => void) => {
      worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
        handler(e.data);
      };
    },
  };
  return new WorkerClient(workerLike);
}
