/**
 * בדיקות יחידה לגיבוב הקנוני (שלב 10; ADR-002).
 * אורקלים: וקטורי FIPS-180-4 הרשמיים + node:crypto (בבדיקות בלבד — מותר Node).
 */
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  CanonicalHashError, canonicalJson, configHash, environmentHash,
  inputHash, layoutHash, runFingerprint,
} from '../src/canonical-hash.js';
import { fnv1a32, sha256Bytes, sha256Hex } from '../src/hash.js';

/** אורקל node:crypto — לבדיקה בלבד (הליבה עצמה אינה מייבאת אותו). */
const nodeSha256 = (s: string) => createHash('sha256').update(s, 'utf8').digest('hex');

describe('sha256 — וקטורי FIPS-180-4', () => {
  it('מחרוזת ריקה', () => {
    expect(sha256Hex('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  });
  it('"abc"', () => {
    expect(sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });
  it('שני בלוקים (448 סיביות)', () => {
    expect(sha256Hex('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq'))
      .toBe('248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1');
  });
  it('מיליון האותיות "a"', () => {
    expect(sha256Hex('a'.repeat(1_000_000)))
      .toBe('cdc76e5c9914fb9281a1c7e284d73e67f1809a48a497200e046d39ccc7112cd0');
  });
});

describe('sha256 — אורקל node:crypto על קלטים מגוונים', () => {
  it('50 קלטים אקראיים-דטרמיניסטיים, כולל עברית ותווים מיוחדים', () => {
    let seed = 42;
    const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
    const samples = ['', 'x', 'שלום עולם', 'לחם פנים וקדש הקדשים', '‍״𐍈😀', 'line\nbreak\ttab'];
    for (let i = 0; i < 50; i++) {
      const len = Math.floor(rnd() * 5000);
      let s = '';
      for (let j = 0; j < len; j++) s += String.fromCharCode(32 + Math.floor(rnd() * 90));
      samples.push(s);
    }
    for (const s of samples) {
      expect(sha256Hex(s)).toBe(nodeSha256(s));
    }
  });
  it('בתים גולמיים (Uint8Array) — אורקל', () => {
    const bytes = new Uint8Array([0, 1, 2, 254, 255, 128, 127, 0]);
    expect(sha256Bytes(bytes)).toBe(createHash('sha256').update(bytes).digest('hex'));
  });
});

describe('canonicalJson — סדר מפתחות לא משנה', () => {
  it('אובייקטים בסדר הכנסה שונה → סריאליזציה זהה', () => {
    const a = { b: 2, a: 1, c: { z: 26, y: 25 } };
    const b = { c: { y: 25, z: 26 }, a: 1, b: 2 };
    expect(canonicalJson(a)).toBe(canonicalJson(b));
  });
  it('מערכים — הסדר משמעותי', () => {
    expect(canonicalJson([1, 2])).not.toBe(canonicalJson([2, 1]));
  });
  it('אפס שלילי מנורמל', () => {
    expect(canonicalJson({ a: -0 })).toBe(canonicalJson({ a: 0 }));
  });
  it('מחרוזות: escaping קבוע', () => {
    expect(canonicalJson('שלום\n"quoted"\\')).toBe(JSON.stringify('שלום\n"quoted"\\'));
  });
  it('דוחה ערכים לא-סדירים', () => {
    expect(() => canonicalJson({ u: undefined })).toThrowError(CanonicalHashError);
    expect(() => canonicalJson({ n: Number.NaN })).toThrowError(CanonicalHashError);
    expect(() => canonicalJson({ i: Number.POSITIVE_INFINITY })).toThrowError(CanonicalHashError);
    expect(() => canonicalJson({ f: () => 1 })).toThrowError(CanonicalHashError);
    expect(() => canonicalJson({ s: Symbol('x') })).toThrowError(CanonicalHashError);
    expect(() => canonicalJson({ b: 1n })).toThrowError(CanonicalHashError);
  });
  it('אידמפוטנטיות: canonicalJson(JSON.parse(canonicalJson(x))) === canonicalJson(x)', () => {
    const x = { pages: [{ id: 'p1', lines: ['א', 'ב'] }, { id: 'p2' }], meta: { version: 1, ok: true } };
    const once = canonicalJson(x);
    const twice = canonicalJson(JSON.parse(once));
    expect(twice).toBe(once);
  });
});

describe('layoutHash — שער השימור (ADR-002 §6)', () => {
  const ir = {
    schemaVersion: 1,
    pages: [
      { id: 'p1', number: 1, columns: [{ x: 100, width: 500 }, { x: 650, width: 500 }] },
      { id: 'p2', number: 2, columns: [{ x: 100, width: 500 }] },
    ],
    anchors: { 'h2-1': { page: 1, y: 2000 } },
  };

  it('סריאליזציה ← פרסור משמר layoutHash', () => {
    const h1 = layoutHash(ir);
    const roundTripped = JSON.parse(canonicalJson(ir));
    expect(layoutHash(roundTripped)).toBe(h1);
  });

  it('סדר הכנסת מפתחות שונה → אותו layoutHash', () => {
    const shuffled = { anchors: ir.anchors, pages: [...ir.pages].reverse().map(p => ({ columns: p.columns, number: p.number, id: p.id })), schemaVersion: 1 };
    // שים לב: סדר המערך pages הפוך — זה שינוי תוכן אמיתי, לכן בונים אובייקט עם אותו סדר מערך
    const sameOrder = { schemaVersion: 1, pages: ir.pages, anchors: ir.anchors };
    const shuffledKeys: Record<string, unknown> = {};
    shuffledKeys['anchors'] = sameOrder.anchors;
    shuffledKeys['pages'] = sameOrder.pages;
    shuffledKeys['schemaVersion'] = sameOrder.schemaVersion;
    expect(layoutHash(shuffledKeys)).toBe(layoutHash(sameOrder));
  });

  it('שינוי תוכן → hash שונה', () => {
    const modified = { ...ir, pages: [{ ...ir.pages[0], number: 999 }, ir.pages[1]] };
    expect(layoutHash(modified)).not.toBe(layoutHash(ir));
  });

  it('יציבות: 1,000 חישובים → אותו ערך', () => {
    const first = layoutHash(ir);
    for (let i = 0; i < 1000; i++) expect(layoutHash(ir)).toBe(first);
  });
});

describe('שלושת ה־hashes — הרכב מדויק (ADR-002 §5)', () => {
  const base = {
    sourceSha256: 'a'.repeat(64),
    effectiveSettings: { page: { widthMm: 210 }, font: { size: 12 } },
    fontsManifestSha256: 'b'.repeat(64),
    assetsManifestSha256: 'c'.repeat(64),
    parserVersion: 'parser-1',
    engineVersion: 'engine-1',
  };

  it('configHash תלוי הגדרות בלבד', () => {
    expect(configHash({ a: 1, b: 2 })).toBe(configHash({ b: 2, a: 1 }));
    expect(configHash({ a: 1 })).not.toBe(configHash({ a: 2 }));
  });

  it('inputHash משתנה כשכל רכיב משתנה', () => {
    const h0 = inputHash(base);
    expect(inputHash({ ...base, sourceSha256: 'd'.repeat(64) })).not.toBe(h0);
    expect(inputHash({ ...base, effectiveSettings: { other: 1 } })).not.toBe(h0);
    expect(inputHash({ ...base, fontsManifestSha256: 'e'.repeat(64) })).not.toBe(h0);
    expect(inputHash({ ...base, assetsManifestSha256: 'f'.repeat(64) })).not.toBe(h0);
    expect(inputHash({ ...base, parserVersion: 'parser-2' })).not.toBe(h0);
    expect(inputHash({ ...base, engineVersion: 'engine-2' })).not.toBe(h0);
    expect(inputHash(base)).toBe(h0); // יציבות
  });

  it('runFingerprint — קלט+פלט', () => {
    const ih = inputHash(base);
    const lh = layoutHash({ x: 1 });
    expect(runFingerprint(ih, lh)).toBe(runFingerprint(ih, lh));
    expect(runFingerprint(ih, lh)).not.toBe(runFingerprint(ih, layoutHash({ x: 2 })));
  });

  it('environmentHash — לתיעוד בלבד; אינו משפיע על layoutHash', () => {
    const e1 = environmentHash({ runtime: 'node', runtimeVersion: '22', platform: 'linux', measurementProvider: 'harfbuzz', measurementProviderVersion: '8' });
    const e2 = environmentHash({ runtime: 'worker', runtimeVersion: '22', platform: 'linux', measurementProvider: 'harfbuzz', measurementProviderVersion: '8' });
    expect(e1).not.toBe(e2);
    // layoutHash של אותו IR אינו תלוי סביבה כלל — אין לו גישה אליה
    expect(layoutHash({ stable: true })).toBe(layoutHash({ stable: true }));
  });
});

describe('fnv1a32 — היסטורי בלבד', () => {
  it('וקטורים ידועים', () => {
    expect(fnv1a32('')).toBe('811c9dc5');
    expect(fnv1a32('a')).toBe('e40c292c');
    expect(fnv1a32('foobar')).toBe('bf9cf968');
  });
});
