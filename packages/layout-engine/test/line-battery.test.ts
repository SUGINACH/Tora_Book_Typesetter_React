/**
 * line-battery.test.ts — סוללת מבחני השורה החובה (שלב 46; אפיון §17.1–17.4, §8).
 *
 * שער השלב: **אין מקרה קצה ידוע ללא מבחן.** הסוללה מכסה את כל רשימת
 * החובה של התכנית — שורה ריקה, פסקה ארוכה, מילה אחת, מילה ארוכה, ניקוד,
 * BiDi, מקפים, סוגריים, note anchors, שורה ראשונה/אחרונה ורצפי whitespace —
 * כל אחת כקובץ fixture נעול בתיקיית test/fixtures/line-battery.
 *
 * מה מוכח כאן, לכל fixture (§17.3: "כל fixture עם audit ו־hash"):
 *   1. **כיסוי אטומים מלא דרך הסולם** (§8.2: אין מחיקת atoms): כל אטום
 *      מופיע בדיוק פעם אחת בקווי הפלט — ללא אובדן וללא שכפול.
 *   2. **חוקיות מתועדת**: כל קו עומד בכללי רמת-0, או נושא קוד fallback
 *      בפנקס (perLineFallback) — אין גלישה/חסר-מילוי בלתי מתועדים.
 *   3. **אין חציית שבירה כפויה** (§8.2): שום קו אינו חוצה explicit-break.
 *   4. **דטרמיניזם מלא**: שתי הרצות של הסולם זהות עד רמת הרשומות
 *      (קווים, דחיות, הדחות comparator, תקציב) — §17.2#1.
 *   5. **hash + audit ברמת המסמך**: typeset() ⇐ layoutHash יציב בין ריצות;
 *      הביקורת הגאומטרית מאפס HIGH; סדר מפתחות בהגדרות אינו משנה (§17.2#4).
 *
 * metamorphic (§17.2#6): פיצול פריט טקסט אחד לשניים (אותם אטומים בדיוק,
 * אותו תוכן משורשר) אינו משנה את פריסת השורות של הפסקה.
 *
 * רגרסיית החזית (נתגלה בבניית הסוללה): בתרחיש שבו כל קו חוקי הוא
 * חד־מילולי, גזימת האלומה הסירה את צומת החזית והפסקה חזרה ריקה —
 * הסוללה נועלת את התיקון (הגנת חזית ב־dp.ts) ואת כשל הרמה־3 המפורש
 * (emergency.ts): ליתר דיוק, מסמך שלם שהיה נעלם בשקט.
 */
import { describe, expect, test } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createTestMeasurementProvider } from '@tora/measurement-api/test';
import { parseSourceText } from '@tora/content-model';
import {
  allBlocks,
  layoutHash,
  type ContentBlock,
  type EffectiveSettings,
  type TypesetRequest,
} from '@tora/layout-api';
// בדיקות מתזמרות חבילות (פטורות מגרף התלות; תקדים brackets.differential)
import { auditLayout } from '../../audit-core/dist/index.js';
import { typeset, readV0Settings } from '../src/index.js';
import { tokenize, type InlineLike } from '../src/linebreak/tokens.js';
import { shapeParagraph } from '../src/linebreak/shaping.js';
import { LineCandidateIndex } from '../src/linebreak/candidates.js';
import { breakParagraphWithLadder } from '../src/linebreak/emergency.js';

const here = dirname(fileURLToPath(import.meta.url));
const BATTERY_DIR = join(here, 'fixtures', 'line-battery');

const FONT = Object.freeze({
  fontId: 'guttman-rashi-normal',
  contentSha256: 'a'.repeat(64),
  family: 'Guttman Rashi',
  weight: 400,
  style: 'normal' as const,
});
const provider = createTestMeasurementProvider();

const VALUES: Record<string, unknown> = {
  'size-body': 12,
  'line-height-body': 1.34,
  'prop-margin': 7.5,
  'note-marker-size': 8,
  'note-marker-type': 'super',
  'fn-reset-mode': 'page',
  'page-num-format': 'gematria',
  'page-num-initial-value': 1,
};

function makeSettings(values: Record<string, unknown> = VALUES): EffectiveSettings {
  return Object.freeze({
    schemaVersion: 1,
    enginePolicyId: 'torah-v1',
    values: Object.freeze(values),
    configHash: 'c'.repeat(64),
  });
}

const V0 = readV0Settings(makeSettings());
const COLUMN = V0.geometry.columnWidth as number;
const BUDGET = { maxCandidatesPerState: 512, maxBeamWidth: 64 };

const FIXTURES: readonly string[] = Object.freeze(
  readdirSync(BATTERY_DIR).filter((f) => f.endsWith('.txt')).sort(),
);

/** הרצת fixture שלם דרך פרסר ← טוקניזציה ← shaping ← סולם, לכל בלוק. */
interface BlockRun {
  readonly blockId: string;
  readonly role: string;
  readonly bt: ReturnType<typeof tokenize>;
  readonly ladder: ReturnType<typeof breakParagraphWithLadder>;
}

function runFixture(name: string, budget = BUDGET): readonly BlockRun[] {
  const raw = readFileSync(join(BATTERY_DIR, name), 'utf8');
  const parsed = parseSourceText(raw, { documentId: `battery:${name}`, sourceName: name });
  const blocks = allBlocks(parsed.doc).filter((b) => b.role !== 'note-body') as readonly ContentBlock[];
  const noteBlocks = [
    ...parsed.doc.notes.footnotes,
    ...parsed.doc.notes.endnotes,
    ...parsed.doc.notes.sidenotes,
    ...parsed.doc.notes.editorial,
  ].map((n) => n.block);
  const out: BlockRun[] = [];
  for (const b of [...blocks, ...noteBlocks]) {
    const bt = tokenize(b.id as string, b.inline as InlineLike, new Map());
    if (bt.tokens.length === 0) continue;
    const shaped = shapeParagraph(bt.atoms, provider, FONT, V0.bodyFontSizeLu);
    const index = new LineCandidateIndex(bt, shaped, () => 0);
    const ladder = breakParagraphWithLadder(bt.blockId, bt, index, COLUMN, budget);
    out.push({ blockId: bt.blockId, role: b.role === 'note-body' ? 'note-body' : String(b.role), bt, ladder });
  }
  return out;
}

/** כל האטומים של בלוק — כולל אטומי רווחים (§8.2: "אין מחיקת atoms"). */
function allAtomIds(bt: ReturnType<typeof tokenize>): string[] {
  return bt.atoms.map((a) => a.id);
}

function placedAtomIds(run: BlockRun): string[] {
  const placed: string[] = [];
  for (const line of run.ladder.dp.lines) {
    for (let t = line.startTok; t < line.endTok; t++) {
      const tok = run.bt.tokens[t]!;
      if (tok.kind === 'atom') placed.push(run.bt.atoms[tok.pIdx]!.id);
    }
  }
  return placed;
}

// ─────────────────── 1) כל fixture: כיסוי, חוקיות, חסימות, דטרמיניזם ───────────────────

describe('שלב 46: סוללת השורה — כל fixture דרך הסולם', () => {
  test('רשימת ה-fixtures החובה שלמה (11 מקרי הקצה של התכנית)', () => {
    expect(FIXTURES).toEqual([
      'bidi_mixed.txt',
      'brackets_note.txt',
      'empty_line.txt',
      'first_last_line.txt',
      'hyphens.txt',
      'long_paragraph.txt',
      'long_word.txt',
      'niqqud.txt',
      'parens.txt',
      'single_word.txt',
      'whitespace_runs.txt',
    ]);
  });

  for (const name of FIXTURES) {
    test(`${name}: כיסוי אטומים מלא, חוקיות מתועדת, אין חציית כפייה, דטרמיניזם`, () => {
      const runs = runFixture(name);
      expect(runs.length).toBeGreaterThan(0);
      for (const run of runs) {
        // 1. כיסוי מלא: כל אטום (כולל רווחים) בדיוק פעם אחת
        const expected = allAtomIds(run.bt);
        const placed = placedAtomIds(run);
        expect([...placed].sort()).toEqual([...expected].sort());
        expect(new Set(placed).size).toBe(placed.length); // אין שכפול

        // 2. חוקיות: כל קו ברמה 0, או עם קוד fallback מתועד
        run.ladder.dp.lines.forEach((line, i) => {
          const m = line.candidate.metrics;
          if (line.justification === 'justify') {
            const overflow = m.widthLu - m.shrinkLu > COLUMN;
            const underfill = COLUMN - m.widthLu > m.stretchLu;
            if (overflow || underfill) {
              expect(run.ladder.perLineFallback.has(i)).toBe(true);
            }
          } else if (m.widthLu > COLUMN) {
            expect(run.ladder.perLineFallback.has(i)).toBe(true);
          }
        });

        // 3. אין קו החוצה שבירה כפויה
        for (const line of run.ladder.dp.lines) {
          for (let t = line.startTok; t < line.endTok; t++) {
            expect(run.bt.tokens[t]!.kind).not.toBe('forced');
          }
        }

        // 4. דטרמיניזם מלא — כולל דחיות, הדחות ותקציב
        const again = runFixture(name);
        const twin = again.find((r) => r.blockId === run.blockId);
        expect(twin).toBeDefined();
        expect(JSON.stringify(twin!.ladder)).toBe(JSON.stringify(run.ladder));
      }
    });
  }

  test('מילה אחת: קו יחיד חד־מילולי בלי חירום', () => {
    const runs = runFixture('single_word.txt');
    const body = runs.find((r) => r.role === 'body')!;
    expect(body.ladder.dp.lines).toHaveLength(1);
    expect(body.ladder.dp.lines[0]!.candidate.metrics.wordCount).toBe(1);
    expect(body.ladder.level).toBe(0);
    expect(body.ladder.perLineFallback.size).toBe(0);
  });

  test('מילה ארוכה: המילה בשלמותה על קו משלה עם EMERGENCY_LINE מתועד', () => {
    const runs = runFixture('long_word.txt');
    const body = runs.find((r) => r.role === 'body')!;
    expect(body.ladder.level).toBe(2);
    const emergencyLines = [...body.ladder.perLineFallback.entries()]
      .filter(([, code]) => code === 'EMERGENCY_LINE');
    expect(emergencyLines.length).toBeGreaterThan(0);
    for (const [i] of emergencyLines) {
      const line = body.ladder.dp.lines[i]!;
      // מקטע בלתי־ברי־שבירה בשלמותו — לא נחתך (§8.2, שלב 44)
      expect(line.candidate.metrics.wordCount).toBe(1);
      const atomIds = line.candidate.firstAtomId !== null && line.candidate.lastAtomId !== null
        ? [line.candidate.firstAtomId, line.candidate.lastAtomId]
        : [];
      expect(atomIds).toHaveLength(2);
      expect(line.candidate.metrics.widthLu).toBeGreaterThan(COLUMN);
    }
    // המילה הארוכה נשמרת כאטום אחד שלם — כיסוי מלא הוכח למעלה
    const longAtom = body.bt.atoms.find((a) => a.text.length > 100);
    expect(longAtom).toBeDefined();
    expect(placedAtomIds(body)).toContain(longAtom!.id);
  });

  test('רצפי רווחים: אטומי הרווחים אינם נמחקים (מחוץ לרוחב, בתוך הקו)', () => {
    const runs = runFixture('whitespace_runs.txt');
    const body = runs.find((r) => r.role === 'body')!;
    // אטום רווחים מרובה-תווים קיים בקלט ונשמר בפלט
    const multiSpace = body.bt.atoms.find((a) => a.text.length >= 3 && a.text.trim() === '');
    expect(multiSpace).toBeDefined();
    const allPlaced = placedAtomIds(body);
    for (const a of body.bt.atoms) {
      expect(allPlaced).toContain(a.id); // רווחים עוקבים בסוף קו — מחוץ לרוחב, לא נמחקים
    }
    // רוחב הקו אינו כולל את הרווחים העוקבים בסופו, אך הם נספרים במדידה
    const lastLine = body.ladder.dp.lines.at(-1)!;
    expect(lastLine.candidate.metrics.trailingSpaceLu).toBeGreaterThanOrEqual(0);
  });

  test('שורה ריקה במקור: אין בלוק ריק שמפיל את הסולם; הפסקאות שמסביב שלמות', () => {
    const runs = runFixture('empty_line.txt');
    const bodies = runs.filter((r) => r.role === 'body');
    expect(bodies.length).toBeGreaterThanOrEqual(2); // שתי הפסקאות שמסביב לשורה הריקה
    for (const b of bodies) {
      expect(placedAtomIds(b).length).toBe(allAtomIds(b.bt).length);
    }
  });

  test('הערה חוצת שורות: explicit-break בגוף ההערה מכובד (§8.2)', () => {
    const runs = runFixture('brackets_note.txt');
    const noteRuns = runs.filter((r) => r.role === 'note-body');
    expect(noteRuns.length).toBeGreaterThan(0);
    for (const run of noteRuns) {
      const hasForced = run.bt.tokens.some((t) => t.kind === 'forced');
      if (!hasForced) continue;
      // כל קו מסתיים בגבול הכפייה או לפניו — לעולם לא חוצה אותה
      for (const line of run.ladder.dp.lines) {
        for (let t = line.startTok; t < line.endTok; t++) {
          expect(run.bt.tokens[t]!.kind).not.toBe('forced');
        }
      }
      // הכיסוי מלא גם כאן (ההערה אינה נבלעת)
      expect([...placedAtomIds(run)].sort()).toEqual([...allAtomIds(run.bt)].sort());
    }
  });
});

// ─────────────────── 2) hash + audit + סדר מפתחות ברמת המסמך ───────────────────

describe('שלב 46: כל fixture עם audit ו־hash (§17.3)', () => {
  const POLICY = Object.freeze({ policyId: 'torah-v1' });

  function makeRequest(name: string, values: Record<string, unknown> = VALUES): TypesetRequest {
    const raw = readFileSync(join(BATTERY_DIR, name), 'utf8');
    const parsed = parseSourceText(raw, { documentId: `battery:${name}`, sourceName: name });
    return {
      document: { ...parsed.doc, transforms: parsed.transforms },
      settings: makeSettings(values),
      assets: {
        schemaVersion: 1,
        fonts: [{ usage: 'body', font: FONT }],
        fontsManifestSha256: 'f'.repeat(64),
        assetsManifestSha256: '0'.repeat(64),
      },
      trace: 'off',
      budget: { maxCandidatesPerState: 512, maxBeamWidth: 64, maxExpandedStates: 200000, maxOuterIterations: 8 },
      sourceSha256: '5'.repeat(64),
      parserVersion: 'test-1',
    } as TypesetRequest;
  }

  for (const name of FIXTURES) {
    test(`${name}: שתי ריצות ⇐ אותו layoutHash; הביקורת ללא HIGH; סדר מפתחות אינו משנה`, () => {
      const a = typeset(makeRequest(name), provider, POLICY);
      const b = typeset(makeRequest(name), provider, POLICY);
      expect(a.manifest.layoutHash).toBe(b.manifest.layoutHash);

      // הביקורת הגאומטרית על ה־IR שהופק — אפס HIGH (§17.3: NO_HIGH)
      // למעט long_word: שם הגלישה מתועדת במפורש (EMERGENCY_LINE ⇒ LINE_RUN_OVERFLOW
      // נראית בביקורת — "overflow הוא HIGH" §8.2; זו ההתנהגות הנכונה, לא כשל)
      const audit = auditLayout({ content: makeRequest(name).document, settings: {}, layout: a.layout });
      if (name === 'long_word.txt') {
        expect(audit.counts.HIGH).toBeGreaterThan(0);
        expect(audit.findings.some((f) => f.code === 'audit.layout.LINE_RUN_OVERFLOW')).toBe(true);
      } else {
        expect(audit.counts.HIGH).toBe(0);
      }

      // §17.2#4: סדר מפתחות בהגדרות אינו משנה
      const reordered = Object.fromEntries(Object.entries(VALUES).reverse());
      const c = typeset(makeRequest(name, reordered), provider, POLICY);
      expect(c.manifest.layoutHash).toBe(a.manifest.layoutHash);
    });
  }
});

// ─────────────────── 3) metamorphic: פיצול runs (§17.2#6) ───────────────────

describe('שלב 46: metamorphic — פיצול runs שאינו משנה תוכן אינו משנה פריסה', () => {
  test('פיצול פריט טקסט לשניים ⇐ אותם קווים בדיוק', () => {
    const name = 'first_last_line.txt';
    const raw = readFileSync(join(BATTERY_DIR, name), 'utf8');
    const parsed = parseSourceText(raw, { documentId: `battery:${name}`, sourceName: name });
    const body = (allBlocks(parsed.doc) as readonly ContentBlock[]).find((b) => b.role === 'body'
      && (b.inline as InlineLike).some((i) => i.kind === 'text' && (i.atoms?.length ?? 0) >= 8))!;
    expect(body).toBeDefined();

    const original = tokenize(body.id as string, body.inline as InlineLike, new Map());
    // פיצול: פריט הטקסט הראשון מפוצל לשני פריטים באותם אטומים בדיוק (מודל
    // DOCX: אותו תוכן, runs נפרדים — הסמנטיקה אינה משתנה)
    const items = [...(body.inline as InlineLike)];
    const firstText = items.find((i) => i.kind === 'text' && (i.atoms?.length ?? 0) >= 8)!;
    const atoms = firstText.atoms!;
    const cut = Math.floor(atoms.length / 2);
    const idx = items.indexOf(firstText);
    const splitItems = [
      ...items.slice(0, idx),
      { ...firstText, atoms: atoms.slice(0, cut) },
      { ...firstText, atoms: atoms.slice(cut) },
      ...items.slice(idx + 1),
    ];
    const split = tokenize(body.id as string, splitItems, new Map());

    const run = (bt: ReturnType<typeof tokenize>) => {
      const shaped = shapeParagraph(bt.atoms, provider, FONT, V0.bodyFontSizeLu);
      const index = new LineCandidateIndex(bt, shaped, () => 0);
      return breakParagraphWithLadder(bt.blockId, bt, index, COLUMN, BUDGET);
    };
    const a = run(original);
    const b = run(split);
    // אותם גבולות קו בדיוק (התוכן זהה ⇒ אין סיבה להבדל)
    expect(b.dp.lines.map((l) => [l.startTok, l.endTok])).toEqual(a.dp.lines.map((l) => [l.startTok, l.endTok]));
    expect(b.level).toBe(a.level);
    expect(JSON.stringify(b.perLineFallback)).toBe(JSON.stringify(a.perLineFallback));
  });
});

// ─────────────────── 4) רגרסיית החזית (הבאג שהסוללה גילתה) ───────────────────

describe('שלב 46: רגרסיה — הגנת חזית האלומה וכשל מפורש ברמה 3', () => {
  // תרחיש החזית (עודכן בשלב 48 לקבוע המתיחה המתוקן ADR-004-ר1): טור צר
  // מרוחב כל מילה מכריח קווים חד-מילוליים בלבד ברמה 2 — שם צומת החזית הוא
  // היחיד שיכול להמשיך, והאלומה הדוקה גוזמת אותו ראשון בלי ההגנה.
  const NARROW = 26688; // 3 תווים — כל מילה בפסקה רחבה ממנו

  test('פסקה ארוכה בטור צר ובתקציב דוק (64/8): כיסוי מלא למרות מיצוי תקציב נרשם', () => {
    // לפני התיקון: האלומה גזמה את צומת החזית והפסקה חזרה עם 0 קווים בשקט
    const raw = readFileSync(join(BATTERY_DIR, 'long_paragraph.txt'), 'utf8');
    const parsed = parseSourceText(raw, { documentId: 'battery:frontier', sourceName: 'long_paragraph.txt' });
    const body = (allBlocks(parsed.doc) as readonly ContentBlock[]).find((b) => b.role === 'body')!;
    const bt = tokenize(body.id as string, body.inline as InlineLike, new Map());
    const shaped = shapeParagraph(bt.atoms, provider, FONT, V0.bodyFontSizeLu);
    const index = new LineCandidateIndex(bt, shaped, () => 0);
    const ladder = breakParagraphWithLadder(bt.blockId, bt, index, NARROW, { maxCandidatesPerState: 64, maxBeamWidth: 8 });
    expect(ladder.dp.lines.length).toBeGreaterThan(0);
    const placed: string[] = [];
    for (const line of ladder.dp.lines) {
      for (let t = line.startTok; t < line.endTok; t++) {
        const tok = bt.tokens[t]!;
        if (tok.kind === 'atom') placed.push(bt.atoms[tok.pIdx]!.id);
      }
    }
    expect([...placed].sort()).toEqual([...bt.atoms.map((a) => a.id)].sort());
    expect(ladder.level).toBe(2);
    expect(ladder.dp.budget.exhausted).toBe(true); // המיצוי נרשם, לא שקט (§9.2)
  });

  test('פסקה ארוכה בטור האמיתי: כיסוי מלא בשני התקציבים; הנדיב אינו גרוע', () => {
    const tight = runFixture('long_paragraph.txt', { maxCandidatesPerState: 64, maxBeamWidth: 8 })
      .find((r) => r.role === 'body')!;
    const wide = runFixture('long_paragraph.txt')
      .find((r) => r.role === 'body')!;
    expect([...placedAtomIds(wide)].sort()).toEqual([...allAtomIds(wide.bt)].sort());
    expect([...placedAtomIds(tight)].sort()).toEqual([...allAtomIds(tight.bt)].sort());
    // התקציב הנדיב אינו מניב איכות נמוכה מהדוק (fallbacks ≤)
    expect(wide.ladder.perLineFallback.size).toBeLessThanOrEqual(tight.ladder.perLineFallback.size);
  });
});
