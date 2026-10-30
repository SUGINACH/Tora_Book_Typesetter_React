/**
 * hash.ts — פרימיטיבים של גיבוב: SHA-256 נייד (JS טהור) ו־FNV-1a היסטורי.
 *
 * ADR-002: ליבת המנוע אסורה בייבוא node:crypto — היא חייבת לרוץ זהה
 * ב־Node, ב־Web Worker, ב־CLI וב־Tauri. לכן SHA-256 ממומש כאן ב־JS טהור,
 * ומאומת מול וקטורי FIPS-180-4 ומול node:crypto כאורקל בבדיקות היחידה.
 *
 * הערה על bitwise: פעולות סיביות מותרות בקובץ זה בלבד (מילים של 32 סיביות
 * הן טבע האלגוריתם) — איסור ה־bitwise של ADR-001 חל על קואורדינטות גאומטריות.
 */
import { CanonicalHashError } from './canonical-hash-error.js';

/** 64 קבועי ה־K — שברים חלקיים של שורשים שלישיים של 64 הראשוניות הראשונות, מחושבו בחישוב שלם מדויק. */
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

const rotr = (x: number, n: number): number => (x >>> n) | (x << (32 - n));

function hex8(x: number): string {
  return (x >>> 24).toString(16).padStart(2, '0')
    + ((x >>> 16) & 0xff).toString(16).padStart(2, '0')
    + ((x >>> 8) & 0xff).toString(16).padStart(2, '0')
    + (x & 0xff).toString(16).padStart(2, '0');
}

/** SHA-256 של בתים → hex (קטן). מימוש נייב, ללא תלות בסביבה. */
export function sha256Bytes(input: Uint8Array): string {
  const len = input.length;
  if (!Number.isSafeInteger(len) || len < 0) {
    throw new CanonicalHashError('INVALID_LENGTH', { len });
  }
  const paddedLen = (Math.floor((len + 8) / 64) + 1) * 64;
  const buf = new Uint8Array(paddedLen);
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
  const w = new Uint32Array(64);

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

/** SHA-256 של מחרוזת (UTF-8) → hex (קטן). */
export function sha256Hex(text: string): string {
  return sha256Bytes(new TextEncoder().encode(text));
}

/**
 * FNV-1a 32 סיביות — נשמר להשוואה היסטורית עם התוכנה הישנה בלבד (ADR-002).
 * חוזים חדשים הם SHA-256 בלבד.
 */
export function fnv1a32(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0; // Math.imul: כפל 32-סיביות מדויק — כפל float רגיל גולש מ־2^53
  }
  return h.toString(16).padStart(8, '0');
}
