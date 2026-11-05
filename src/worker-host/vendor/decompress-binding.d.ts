/**
 * decompress-binding.d.ts — הצהרת הטיפוסים של עותק ההפעלה המתוקן של
 * wawoff2/decompress_binding.js (ראו קובץ ה־JS שלצד זה — הפאץ' המתועד).
 *
 * המודול בזמן ריצה: onRuntimeInitialized נורה לאחר אתחול ה־wasm;
 * Module.decompress נרשם על ידי הדבק embind בסיום האתחול (הוכח באמת
 * מידה ב־Node: typeof Module.decompress === 'function' לאחר הריצה)
 * ומחזיר Promise<Uint8Array>; ערך false ⇐ כישלון פירוק מפורש.
 */
declare const Module: {
  onRuntimeInitialized?: () => void;
  decompress(bytes: Uint8Array): Promise<Uint8Array> | false;
  readonly [key: string]: unknown;
};
export default Module;
