/**
 * worker-entry.ts — קשירת ה-handler ל-Worker האמיתי בדפדפן (שלב 35; שלב 85 —
 * תיקון שורש: פריקת ה־WOFF2 עברה ל־woff2-browser, ראו שם).
 *
 * דק במכוון: כל הלוגיקה ב-engine-worker.ts (טהורה, נבדקת ב-Node);
 * כאן רק הקשירה ל-self.onmessage + מפעל הספק מהנכסים שהועברו בערוץ
 * (harfbuzzjs/WASM — הזרקה מלאה לפי ADR-003; אין רשת, §19).
 * המנוע נטען בתוך ה-Worker (לא ב-main thread; §12.1).
 */
import { createHarfbuzzProvider } from '@tora/measurement-harfbuzz';
import { verifyFontBytes } from '@tora/measurement-api';
import { typeset } from '@tora/layout-engine';
import { createEngineHandler, type WorkerPort } from './engine-worker.js';
import { decompressWoff2Browser } from './woff2-browser.js';
import type { PreparePayload } from './protocol.js';

const ctx = self as unknown as {
  onmessage: ((e: { data: unknown }) => void) | null;
  postMessage: (msg: unknown) => void;
};

const port: WorkerPort = { post: (msg) => ctx.postMessage(msg) };

/** הספק מהנכסים שבמטען — אותם bytes שהועברו מקומית מאומתים שוב (hash). */
async function createProviderFromPayload(payload: PreparePayload) {
  const hbMod = (await import('harfbuzzjs')) as unknown as { default?: unknown };
  const hb = (hbMod.default ?? hbMod) as never;
  // שלב 85: 'wawoff2' אינו בר-הפעלה בבניית הדפדפן (השמת module.exports
  // חיה בענף ENVIRONMENT_IS_NODE בלבד — הבטחת האתחול נרשמת על אובייקט
  // ריק והריצה נתלית ב-preparing). פריקת ה־WOFF2 עוברת לעטיפה הייעודית
  // — woff2-browser — על עותק ההפעלה המתוקן (ראו שם את התיעוד המלא).
  return createHarfbuzzProvider({
    hb,
    wasmBytes: payload.wasmBytes,
    woff2DecoderBytes: payload.woff2DecoderBytes,
    decompressWoff2: (bytes: Uint8Array) => decompressWoff2Browser(bytes),
    fonts: payload.fonts.map((f) => {
      // אימות hash שוב בצד העובד — אותם bytes או כלום (שלב 25)
      const key = verifyFontBytes(f.record, f.bytes);
      return { record: f.record, bytes: f.bytes, key };
    }),
  });
}

const handler = createEngineHandler({
  createProvider: createProviderFromPayload,
  typeset,
});

ctx.onmessage = (e: { data: unknown }) => {
  void handler(e.data, port);
};
