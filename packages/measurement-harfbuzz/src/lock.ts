/**
 * lock.ts — נעילות ADR-003: גרסאות וטביעות אצבע של שרשרת ה־shaping.
 *
 * כל שינוי בערכים אלה מחייב תיקון ADR-003 והוכחה מחדש של וקטורי הבדיקה.
 * הספק מאמת את ה־bytes האמיתיים מול נעילות אלה בזמן היצירה — הערכים
 * כאן הם האמת היחידה, ואין דרך להזריק גרסה אחרת בלי שהאימות ייכשל.
 */

/** נעילת ADR-003 — קפואה. */
export const HARFBUZZ_LOCK = Object.freeze({
  /** זהות הספק (אפיון §6.4) — מילולית בטיפוס. */
  providerId: 'harfbuzz-wasm' as const,
  /** חבילת harfbuzzjs (exact; נעולה גם ב־package-lock). */
  harfbuzzjsVersion: '1.6.4',
  /** גרסת HarfBuzz המובנית ב־WASM — נאמתת בזמן יצירה מול hb.version(). */
  harfbuzzVersion: '15.0.0',
  /** SHA-256 של node_modules/harfbuzzjs/dist/harfbuzz.wasm. */
  wasmSha256: '6eeed8e1bc9ad7773038e48ff8f9e07e0ad228572c594b45e5357e9c2f7a0b2e',
  /** פריקת WOFF2 — יישום הייחוס של Google. */
  wawoff2Version: '2.0.1',
  /** SHA-256 של node_modules/wawoff2/build/decompress_binding.js (ה־WASM מוטמע בו). */
  woff2DecoderSha256: '112a89e7497a856698103e2ce530d2b6fc27668c0cd56f45bcbf7850d73b7c2b',
  /**
   * תצורת Unicode: HarfBuzz 15.0.0 מסווג תווים לצורך shaping פנימי בלבד;
   * BiDi (UAX #9) ושבירת שורות (UAX #14) אינם חלק מהספק — מודולים עצמאיים
   * בשלבים 27–28. רישום זה נכנס ל־environmentHash כדי ששינוי תצורה יחליף זהות.
   */
  unicodeConfig: 'shaping-only; bidi=external(UAX#9,stage-28); line-break=external(UAX#14,stage-27)',
});

/** גרסת הספק הציבורית — יציבה וקריאה; נכנסת לזהות ולמפתח המטמון. */
export const PROVIDER_VERSION = '1.6.4+hb-15.0.0' as const;
