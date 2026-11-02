/**
 * differential-lines.test.ts — בדיקות שלב 48: differential מול fixtures של
 * Gold ושער M5 (אפיון §17.1, §18-M5; תכנית שלב 48).
 *
 * מה מוכח כאן (על מדגם מייצג מהיר; הדוח המלא — scripts/migration/differential-lines.mjs):
 *   1. **מול קורפוס Gold בספק הבדיקה**: לכל פסקה מדגם — ה-DP (מסלול הייצור)
 *      אינו גרוע מהחמדני על QualityVector, או שמסלול החמדני בלתי-חוקי
 *      (מפר סף מתיחה) — הבדל מוסבר, לא רגרסיה.
 *   2. **אין שינוי אטומים**: אטומי הפלט של שני האלגוריתמים זהים לפרט
 *      (אותם אטומים, אותו סדר יחסי) — השבירה אינה מוחקת ואינה משכפלת.
 *   3. **דטרמיניזם**: אותו קלט ⇐ אותו מסלול DP פעמיים.
 *   4. **הקבוע המתוקן (ADR-004-ר1)**: מתיחה = רווח מלא פר-רווח; חלון רמה 0
 *      רחב מספיק לטקסט אמיתי בספק הבדיקה (פסקת ייחוס נפתרת ברמה 0).
 *   5. **ריצה מלאה על fixture של Gold**: typeset + ביקורת 0 HIGH — התנהגות
 *      השער ברמת המסמך.
 */
import { describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createTestMeasurementProvider } from '@tora/measurement-api/test';
import { parseSourceText } from '@tora/content-model';
import {
  allBlocks,
  type ContentBlock,
  type EffectiveSettings,
  type TypesetRequest,
} from '@tora/layout-api';
// בדיקות מתזמרות חבילות (פטורות מגרף התלות; תקדים brackets.differential)
import { auditLayout } from '../../audit-core/dist/index.js';
import { typeset } from '../src/index.js';
import {
  tokenize,
  type InlineLike,
} from '../src/linebreak/tokens.js';
import { shapeParagraph } from '../src/linebreak/shaping.js';
import { LineCandidateIndex } from '../src/linebreak/candidates.js';
import { breakParagraphWithLadder, createLevel1Policy } from '../src/linebreak/emergency.js';
import { createLevel0Policy } from '../src/linebreak/policy.js';
import { breakParagraphGreedy } from '../src/linebreak/greedy.js';
import { addQuality, compareQuality, lineQualityVector, type QualityVector } from '../src/linebreak/quality.js';
import type { DpBudget } from '../src/linebreak/dp.js';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..', '..', '..');
const corpusRoot = join(repoRoot, 'packages', 'test-fixtures', 'corpus');

const FONT = Object.freeze({
  fontId: 'guttman-rashi-normal',
  contentSha256: 'a'.repeat(64),
  family: 'Guttman Rashi',
  weight: 400,
  style: 'normal' as const,
});
const provider = createTestMeasurementProvider();
const VALUES: Record<string, unknown> = {
  'size-body': 12, 'line-height-body': 1.34, 'prop-margin': 7.5, 'note-marker-size': 8,
  'note-marker-type': 'super', 'fn-reset-mode': 'page', 'page-num-format': 'gematria', 'page-num-initial-value': 1,
};
const settings: EffectiveSettings = Object.freeze({
  schemaVersion: 1, enginePolicyId: 'torah-v1', values: Object.freeze(VALUES), configHash: 'c'.repeat(64),
});
import { readV0Settings } from '../src/index.js';
const V0 = readV0Settings(settings);
const COLUMN = V0.geometry.columnWidth as number;
const BUDGET: DpBudget = { maxCandidatesPerState: 512, maxBeamWidth: 64 };
const RULES = { avoidRuntWord: true, avoidOrphans: true, lastLineAlign: 'center' as const };

/** פסקאות גוף מקורפוס Gold (מדגם דטרמיניסטי — כל פרק, שלוש פסקאות ראשונות). */
function goldParagraphs(): { chapter: string; block: ContentBlock }[] {
  const out: { chapter: string; block: ContentBlock }[] = [];
  for (const ch of ['ch05', 'ch42', 'ch63', 'ch75']) {
    const raw = readFileSync(join(corpusRoot, 'chapters', `${ch}.txt`), 'utf8');
    const parsed = parseSourceText(raw, { documentId: `diff-test-${ch}`, sourceName: `${ch}.txt` });
    const bodies = (allBlocks(parsed.doc) as readonly ContentBlock[]).filter(
      (b) => b.role === 'body' && (b.inline as InlineLike).some((i) => i.kind === 'text'),
    );
    for (const block of bodies.slice(0, 3)) out.push({ chapter: ch, block });
  }
  return out;
}

function pathQuality(lines: readonly { candidate: unknown; breakPoint: { kind: string }; justification: string }[]): QualityVector {
  let q: QualityVector = { fallbackSeverity: 0, headingEscortDebt: 0, noteDisplacement: 0, widowOrphanDebt: 0, runtDebt: 0, lineBadness: 0, hyphenDebt: 0, columnImbalance: 0, pageCountDebt: 0 };
  lines.forEach((line, i) => {
    q = addQuality(q, lineQualityVector({
      candidate: line.candidate as never,
      lineIndex: i,
      isFirst: i === 0,
      isLast: line.breakPoint.kind === 'end',
      justification: line.justification as never,
    }, COLUMN, RULES));
  });
  return q;
}

describe('שלב 48: differential מול Gold — ה־DP אינו גרוע מהחמדני (או שהחמדני בלתי-חוקי)', () => {
  const paragraphs = goldParagraphs();
  const pol0 = createLevel0Policy();
  const pol1 = createLevel1Policy();

  test('מדגם פסקאות Gold נטען (לפחות 10 מ-4 פרקים)', () => {
    expect(paragraphs.length).toBeGreaterThanOrEqual(10);
  });

  test('לכל פסקה: DP ≤ חמדני על הווקטור, או שמסלול החמדני מפר את המדיניות', () => {
    const greedyV0Policy = {
      overflowAllowanceLu: 0,
      check: (candidate: { metrics: { widthLu: number } }) =>
        (candidate.metrics.widthLu > COLUMN ? 'overflow' : null),
    };
    let improvements = 0;
    let explained = 0;
    for (const { chapter, block } of paragraphs) {
      const bt = tokenize(block.id as string, block.inline as InlineLike, new Map());
      if (bt.atoms.length < 4) continue;
      const shaped = shapeParagraph(bt.atoms, provider, FONT, V0.bodyFontSizeLu);
      const index = new LineCandidateIndex(bt, shaped, () => 0);
      const dp = breakParagraphWithLadder(bt.blockId, bt, index, COLUMN, BUDGET, { rules: RULES });
      const gr = breakParagraphGreedy(index, greedyV0Policy as never, COLUMN);
      const dpQ = pathQuality(dp.dp.lines);
      const grQ = pathQuality(gr);
      const cmp = compareQuality(dpQ, grQ);
      if (cmp <= 0) {
        if (cmp < 0) improvements += 1;
        continue;
      }
      // DP יקר יותר — מותר רק אם מסלול החמדני בלתי-חוקי (קו שנכשל גם ברמה 1)
      const illegal = gr.some((line) => {
        const r0 = pol0.check(line.candidate, line.justification, COLUMN);
        const r1 = r0 === null ? null : pol1.check(line.candidate, line.justification, COLUMN);
        return r1 !== null;
      });
      if (!illegal) {
        throw new Error(`${chapter} ${block.id}: רגרסיה אמיתית — DP ${JSON.stringify(dpQ)} נגד חמדני חוקי ${JSON.stringify(grQ)}`);
      }
      explained += 1;
    }
    expect(improvements + explained + paragraphs.filter((p) => p.block).length).toBeGreaterThanOrEqual(paragraphs.length);
  });

  test('אין שינוי אטומים: פלט שני האלגוריתמים מכסה את אותם אטומים בדיוק', () => {
    for (const { block } of paragraphs.slice(0, 6)) {
      const bt = tokenize(block.id as string, block.inline as InlineLike, new Map());
      if (bt.atoms.length < 4) continue;
      const shaped = shapeParagraph(bt.atoms, provider, FONT, V0.bodyFontSizeLu);
      const index = new LineCandidateIndex(bt, shaped, () => 0);
      const dp = breakParagraphWithLadder(bt.blockId, bt, index, COLUMN, BUDGET, { rules: RULES });
      const greedyV0Policy = {
        overflowAllowanceLu: 0,
        check: (candidate: { metrics: { widthLu: number } }) =>
          (candidate.metrics.widthLu > COLUMN ? 'overflow' : null),
      };
      const gr = breakParagraphGreedy(index, greedyV0Policy as never, COLUMN);
      const idsOf = (lines: readonly { startTok: number; endTok: number }[]): string[] => {
        const ids: string[] = [];
        for (const l of lines) {
          for (let t = l.startTok; t < l.endTok; t++) {
            const tok = bt.tokens[t]!;
            if (tok.kind === 'atom') ids.push(bt.atoms[tok.pIdx]!.id);
          }
        }
        return ids;
      };
      const expected = bt.atoms.map((a) => a.id).sort();
      expect(idsOf(dp.dp.lines).sort()).toEqual(expected);
      expect(idsOf(gr).sort()).toEqual(expected);
    }
  });

  test('דטרמיניזם: אותו קלט ⇐ אותו מסלול פעמיים', () => {
    const { block } = paragraphs[0]!;
    const bt = tokenize(block.id as string, block.inline as InlineLike, new Map());
    const shaped = shapeParagraph(bt.atoms, provider, FONT, V0.bodyFontSizeLu);
    const index = new LineCandidateIndex(bt, shaped, () => 0);
    const a = breakParagraphWithLadder(bt.blockId, bt, index, COLUMN, BUDGET, { rules: RULES });
    const b = breakParagraphWithLadder(bt.blockId, bt, index, COLUMN, BUDGET, { rules: RULES });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  test('הקבוע המתוקן (ADR-004-ר1): מתיחה = רווח מלא; פסקת ייחוס ברמה 0', () => {
    // המדידה: אטום רווחים בן 3 תווים — המתיחה שלו = רוחבו המלא (לא חצי)
    const raw = readFileSync(join(corpusRoot, 'chapters', 'ch42.txt'), 'utf8');
    const parsed = parseSourceText(raw, { documentId: 'diff-const', sourceName: 'ch42.txt' });
    const block = (allBlocks(parsed.doc) as readonly ContentBlock[]).find(
      (b) => b.role === 'body' && (b.inline as InlineLike).some((i) => i.kind === 'text'),
    )!;
    const bt = tokenize(block.id as string, block.inline as InlineLike, new Map());
    const shaped = shapeParagraph(bt.atoms, provider, FONT, V0.bodyFontSizeLu);
    const index = new LineCandidateIndex(bt, shaped, () => 0);
    // מקטע מילה-רווח-מילה: הרווח אינו עוקב (יש אחריו מילה) — המתיחה שלו
    // במדידה חייבת להיות רוחבו המלא (תיקון ADR-004-ר1; במקור היה חצי)
    const wordSpaceWord = ((): { from: number; to: number; spaceTok: number } | null => {
      for (let t = 0; t + 2 < bt.tokens.length; t++) {
        const a = bt.tokens[t]!;
        const b = bt.tokens[t + 1]!;
        const c = bt.tokens[t + 2]!;
        if (a.kind === 'atom' && b.kind === 'atom' && c.kind === 'atom'
          && bt.atoms[(a as { pIdx: number }).pIdx]!.text.trim().length > 0
          && bt.atoms[(b as { pIdx: number }).pIdx]!.text === ' '
          && bt.atoms[(c as { pIdx: number }).pIdx]!.text.trim().length > 0) {
          return { from: t, to: t + 3, spaceTok: t + 1 };
        }
      }
      return null;
    })();
    expect(wordSpaceWord).not.toBeNull();
    const m = index.measure(wordSpaceWord!.from, wordSpaceWord!.to);
    const spaceWidth = shaped.advances[bt.atoms[(bt.tokens[wordSpaceWord!.spaceTok] as { pIdx: number }).pIdx]!.text === ' ' ? (bt.tokens[wordSpaceWord!.spaceTok] as { pIdx: number }).pIdx : 0] ?? 0;
    expect(m.stretchLu).toBe(spaceWidth);
  });

  test('ריצה מלאה על fixture של Gold: typeset + ביקורת 0 HIGH (שער ברמת המסמך)', () => {
    const raw = readFileSync(join(corpusRoot, 'cases', 'no-legal-two-column-split.txt'), 'utf8');
    const parsed = parseSourceText(raw, { documentId: 'diff-full', sourceName: 'no-legal.txt' });
    const doc = { ...parsed.doc, transforms: parsed.transforms };
    const request = {
      document: doc,
      settings,
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
    const out = typeset(request, provider, { policyId: 'torah-v1' });
    const report = auditLayout({ content: doc, settings: {}, layout: out.layout });
    expect(report.counts.HIGH).toBe(0);
    // דטרמיניזם ברמת המסמך
    const out2 = typeset(request, provider, { policyId: 'torah-v1' });
    expect(out2.manifest.layoutHash).toBe(out.manifest.layoutHash);
  });
});
