/**
 * hash.ts — SHA-256 נייד (JS טהור) עבור חוזי המדידה (שלב 22).
 *
 * ADR-002: חבילת המדידה אסורה בייבוא node:crypto או כל API של Node/DOM —
 * היא חייבת לרוץ זהה ב־Node, ב־Web Worker, ב־CLI וב־Tauri. החוזים
 * (requestHash, fontFingerprint, environmentHash, מפתח מטמון) זקוקים
 * ל־SHA-256, ולכן מימוש נייד מקומי — בדיוק בדפוס שתועד ב־layout-api
 * (שלב 10): אותו אלגוריתם FIPS-180-4, מאומת מול וקטורי FIPS ומול
 * node:crypto כאורקל בבדיקות היחידה (שלב 22).
 *
 * הערה על bitwise: פעולות סיביות מותרות בקובץ זה בלבד (מילים של 32 סיביות
 * הן טבע האלגוריתם) — איסור ה־bitwise של ADR-001 חל על קואורדינטות גאומטריות.
 */
import { EngineError } from './errors.js';

/** 64 קבועי ה־K — שברים חלקיים של שורשים שלישיים של 64 הראשוניות הראשונות. */
const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5,
  0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
  0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc,
  0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7,
  0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
  0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3,
  0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5,
  0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
  0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

const INITIAL_H = new Uint32Array([
  0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
  0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
]);

/** מילות ההרחבה — משותפות (נכתבות במלואן לפני כל שימוש; שלב 73). */
const SHARED_W = new Uint32Array(64);

const rotr = (x: number, n: number): number => (x >>> n) | (x << (32 - n));

function hex8(x: number): string {
  return (x >>> 24).toString(16).padStart(2, '0')
    + ((x >>> 16) & 0xff).toString(16).padStart(2, '0')
    + ((x >>> 8) & 0xff).toString(16).padStart(2, '0')
    + (x & 0xff).toString(16).padStart(2, '0');
}

/** SHA-256 של בתים → hex (קטן). מימוש נייב, ללא תלות בסביבה.
 *
 * חיסכון זיכרון (שלב 73): הריפוד רץ על חיץ משותף שגדל פי-שתיים בלבד —
 * במסלול החם (גיבובי בקשות shaping, מאות אלפי קריאות במסמך גדול)
 * הקצאת Uint8Array לכל קריאה צברה מאות MB זיכרון חיצוני שאינו נאסף
 * בלולאה סינכרונית וקרסה את הריצה המלאה. התוצאה זהה ביט-ביט.
 */
let padScratch = new Uint8Array(1 << 16);

export function sha256Bytes(input: Uint8Array): string {
  const len = input.length;
  if (!Number.isSafeInteger(len) || len < 0) {
    throw new EngineError('errors.hash.INVALID_LENGTH', { len });
  }
  const paddedLen = (Math.floor((len + 8) / 64) + 1) * 64;
  if (padScratch.length < paddedLen) {
    let next = padScratch.length;
    while (next < paddedLen) next *= 2;
    padScratch = new Uint8Array(next);
  }
  const buf = padScratch.subarray(0, paddedLen);
  buf.fill(0, len, paddedLen);
  buf.set(input);
  buf[len] = 0x80;
  // אורך בסיביות — 64 סיביות big-endian, בחישוב שלם בטוח (ללא גלישת 32 סיביות)
  const hi = Math.floor(len / 536870912); // len / 2^29 = (len*8) / 2^32
  const lo = (len - hi * 536870912) * 8;
  const put = (idx: number, v: number): void => {
    buf[idx] = v & 0xff;
  };
  put(paddedLen - 8, Math.floor(hi / 16777216));
  put(paddedLen - 7, Math.floor(hi / 65536));
  put(paddedLen - 6, Math.floor(hi / 256));
  put(paddedLen - 5, hi);
  put(paddedLen - 4, Math.floor(lo / 16777216));
  put(paddedLen - 3, Math.floor(lo / 65536));
  put(paddedLen - 2, Math.floor(lo / 256));
  put(paddedLen - 1, lo);

  let h0 = INITIAL_H[0]!, h1 = INITIAL_H[1]!, h2 = INITIAL_H[2]!, h3 = INITIAL_H[3]!;
  let h4 = INITIAL_H[4]!, h5 = INITIAL_H[5]!, h6 = INITIAL_H[6]!, h7 = INITIAL_H[7]!;
  // w משותף — נכתב במלואו (64 מילים) לפני כל שימוש בכל בלוק
  const w = SHARED_W;

  for (let block = 0; block < paddedLen; block += 64) {
    for (let t = 0; t < 16; t++) {
      const i = block + t * 4;
      const b0 = buf[i]!;
      const b1 = buf[i + 1]!;
      const b2 = buf[i + 2]!;
      const b3 = buf[i + 3]!;
      w[t] = ((b0 << 24) | (b1 << 16) | (b2 << 8) | b3) >>> 0;
    }
    for (let t = 16; t < 64; t++) {
      const w15 = w[t - 15]!;
      const w2 = w[t - 2]!;
      const s0 = rotr(w15, 7) ^ rotr(w15, 18) ^ (w15 >>> 3);
      const s1 = rotr(w2, 17) ^ rotr(w2, 19) ^ (w2 >>> 10);
      w[t] = (w[t - 16]! + s0 + w[t - 7]! + s1) >>> 0;
    }
    let a = h0, b = h1, c = h2, d = h3, e = h4, f = h5, g = h6, h = h7;
    for (let t = 0; t < 64; t++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const temp1 = (h + S1 + ch + K[t]! + w[t]!) >>> 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (S0 + maj) >>> 0;
      h = g; g = f; f = e;
      e = (d + temp1) >>> 0;
      d = c; c = b; b = a;
      a = (temp1 + temp2) >>> 0;
    }
    h0 = (h0 + a) >>> 0; h1 = (h1 + b) >>> 0; h2 = (h2 + c) >>> 0; h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0; h5 = (h5 + f) >>> 0; h6 = (h6 + g) >>> 0; h7 = (h7 + h) >>> 0;
  }
  return hex8(h0) + hex8(h1) + hex8(h2) + hex8(h3) + hex8(h4) + hex8(h5) + hex8(h6) + hex8(h7);
}

/** סף המסלול הזורם — מעליו אין מקודדים את המחרוזת כולה לזיכרון
 * (layoutHash של IR שלם: מחרוזת של מאות MB; שלב 73). */
const STREAM_THRESHOLD = 1 << 18;

/** חיץ קידוד לנתחים — 16384 יחידות UTF-16 × 3 בתים = 48KB קבועים. */
const STREAM_CHUNK_UNITS = 1 << 14;
const sharedEncoder = new TextEncoder();
let encodeScratch = new Uint8Array(1 << 16);
const streamChunkBytes = new Uint8Array(STREAM_CHUNK_UNITS * 3);
const streamStage = new Uint8Array(128);
const streamState = new Uint32Array(8);

/** דחיסת בלוק אחד (64 בתים) אל תוך streamState — זהה מתמטית ללולאה
 * הפנימית של sha256Bytes (אותם קבועי K ואותם סבבים). */
function compress64(buf: Uint8Array, off: number, w: Uint32Array): void {
  for (let t = 0; t < 16; t++) {
    const i = off + t * 4;
    const b0 = buf[i]!;
    const b1 = buf[i + 1]!;
    const b2 = buf[i + 2]!;
    const b3 = buf[i + 3]!;
    w[t] = ((b0 << 24) | (b1 << 16) | (b2 << 8) | b3) >>> 0;
  }
  for (let t = 16; t < 64; t++) {
    const w15 = w[t - 15]!;
    const w2 = w[t - 2]!;
    const s0 = rotr(w15, 7) ^ rotr(w15, 18) ^ (w15 >>> 3);
    const s1 = rotr(w2, 17) ^ rotr(w2, 19) ^ (w2 >>> 10);
    w[t] = (w[t - 16]! + s0 + w[t - 7]! + s1) >>> 0;
  }
  let a = streamState[0]!, b = streamState[1]!, c = streamState[2]!, d = streamState[3]!;
  let e = streamState[4]!, f = streamState[5]!, g = streamState[6]!, h = streamState[7]!;
  for (let t = 0; t < 64; t++) {
    const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
    const ch = (e & f) ^ (~e & g);
    const temp1 = (h + S1 + ch + K[t]! + w[t]!) >>> 0;
    const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
    const maj = (a & b) ^ (a & c) ^ (b & c);
    const temp2 = (S0 + maj) >>> 0;
    h = g; g = f; f = e;
    e = (d + temp1) >>> 0;
    d = c; c = b; b = a;
    a = (temp1 + temp2) >>> 0;
  }
  streamState[0] = (streamState[0]! + a) >>> 0;
  streamState[1] = (streamState[1]! + b) >>> 0;
  streamState[2] = (streamState[2]! + c) >>> 0;
  streamState[3] = (streamState[3]! + d) >>> 0;
  streamState[4] = (streamState[4]! + e) >>> 0;
  streamState[5] = (streamState[5]! + f) >>> 0;
  streamState[6] = (streamState[6]! + g) >>> 0;
  streamState[7] = (streamState[7]! + h) >>> 0;
}

/** SHA-256 זורם על מחרוזת ענקית: קידוד UTF-8 בנתחים (substring של
 * מחרוזת שטוחה הוא SlicedString ללא העתקה) ודחיסה מצטברת — זיכרון
 * העבודה O(48KB) בלבד, בלי להכפיל את המסמך בזיכרון חיצוני. התוצאה
 * זהה ביט-ביט לגיבוב המלא (אותם בתים באותו סדר; אותו ריפוד). */
function sha256HexStreaming(text: string, w: Uint32Array): string {
  streamState.set(INITIAL_H);
  let stageLen = 0;
  let total = 0;
  for (let pos = 0; pos < text.length; pos += STREAM_CHUNK_UNITS) {
    const end = Math.min(pos + STREAM_CHUNK_UNITS, text.length);
    const piece = text.substring(pos, end);
    const { read, written } = sharedEncoder.encodeInto(piece, streamChunkBytes);
    if (read < piece.length) {
      // בלתי-אפשרי תיאורטית (החיץ גדול משלושה בתים לכל יחידה) — החלפת
      // הנתח בקידוד מקצה אחד; תוצאה זהה.
      const enc = new TextEncoder().encode(piece);
      feedBytes(enc, enc.length);
      total += enc.length;
      continue;
    }
    feedBytes(streamChunkBytes, written);
    total += written;
  }
  // ריפוד סופי לפי FIPS-180-4: 0x80, אפסים עד 56 mod 64, אורך בסיביות
  streamStage[stageLen] = 0x80;
  stageLen += 1;
  if (stageLen > 56) {
    streamStage.fill(0, stageLen, 64);
    compress64(streamStage, 0, w);
    stageLen = 0;
  }
  streamStage.fill(0, stageLen, 56);
  const hi = Math.floor(total / 536870912);
  const lo = (total - hi * 536870912) * 8;
  const put = (idx: number, v: number): void => { streamStage[idx] = v & 0xff; };
  put(56, Math.floor(hi / 16777216));
  put(57, Math.floor(hi / 65536));
  put(58, Math.floor(hi / 256));
  put(59, hi);
  put(60, Math.floor(lo / 16777216));
  put(61, Math.floor(lo / 65536));
  put(62, Math.floor(lo / 256));
  put(63, lo);
  compress64(streamStage, 0, w);
  return hex8(streamState[0]!) + hex8(streamState[1]!) + hex8(streamState[2]!) + hex8(streamState[3]!)
    + hex8(streamState[4]!) + hex8(streamState[5]!) + hex8(streamState[6]!) + hex8(streamState[7]!);

  function feedBytes(src: Uint8Array, n: number): void {
    let i = 0;
    while (i < n) {
      const take = Math.min(64 - stageLen, n - i);
      streamStage.set(src.subarray(i, i + take), stageLen);
      stageLen += take;
      i += take;
      if (stageLen === 64) {
        compress64(streamStage, 0, w);
        stageLen = 0;
      }
    }
  }
}

/** SHA-256 של מחרוזת (UTF-8) → hex (קטן).
 *
 * חיסכון זיכרון (שלב 73): קידוד לחיץ משותף באמצעות encodeInto — במקום
 * TextEncoder().encode() שהקצה Uint8Array חדש (זיכרון חיצוני שאינו
 * מפעיל GC בלחץ) בכל קריאה. UTF-8 חסום ב־3 בתים ליחידת קוד UTF-16
 * (כולל מקרי קצה: surrogate בודד ← U+FFFD בן 3 בתים; זוג surrogate
 * ← 4 בתים לשתי יחידות) — לכן אורך החיץ תמיד מספיק בניסיון אחד.
 * קלטים ענקיים (מעל 256K יחידות) עוברים למסלול הזורם.
 */
export function sha256Hex(text: string): string {
  if (text.length > STREAM_THRESHOLD) {
    return sha256HexStreaming(text, SHARED_W);
  }
  const need = text.length * 3;
  if (encodeScratch.length < need) {
    let next = encodeScratch.length;
    while (next < need) next *= 2;
    encodeScratch = new Uint8Array(next);
  }
  const { read, written } = sharedEncoder.encodeInto(text, encodeScratch);
  if (read < text.length) {
    // בלתי-אפשרי תיאורטית — נתיב גיבוי מקצה אחד, תוצאה זהה
    return sha256Bytes(new TextEncoder().encode(text));
  }
  return sha256Bytes(encodeScratch.subarray(0, written));
}

