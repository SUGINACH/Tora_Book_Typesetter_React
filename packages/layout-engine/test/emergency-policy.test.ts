/**
 * emergency-policy.test.ts — בדיקות שלב 44: מדיניות חירום מדורגת ומילה ארוכה (§8.2, §14; ADR-004).
 *
 * מה מוכח כאן:
 *   1. רמה 0 מספיקה לפסקה רגילה — אף רישום חירום, אף fallback.
 *   2. מתיחת חירום (רמה 1): EMERGENCY_STRETCH (MEDIUM) על הקו החורג
 *      בלבד; עלות החומרה בווקטור; שאר הקווים נקיים.
 *   3. מילה ארוכה מהטור (רמה 2): המילה על קו משלה בשלמותה — EMERGENCY_LINE
 *      (HIGH), האטומים לא נחתכים ולא נמחקים; הגלישה נרשמת ואינה שקטה.
 *   4. קו רב־מילילי אינו "מתמזג" למקטע ענק שממזער סכום חומרות — רמה 2
 *      מחייבת את כללי רמה 1 לקווים ברי־שבירה.
 *   5. כשל מפורש: allowOverflow=false ⇐ שגיאה מקוטלגת NO_LEGAL_LINE_BREAK —
 *      לא טקסט קטוע ולא פריסה חלקית בשקט.
 *   6. כל שלב חירום מתועד עם span ועלות: רשומות emergency תקפות בפנקס
 *      אמיתי; קודי fallback לקו דרך dpLedgerEntries.
 *   7. דטרמיניזם: אותם קלטים ⇐ אותה רמה, אותם קווים ואותם קודים.
 */
import { describe, expect, test } from 'vitest';
import { createTestMeasurementProvider } from '@tora/measurement-api/test';
import { parseSourceText } from '@tora/content-model';
import { allBlocks, DecisionLedgerBuilder, type ContentBlock } from '@tora/layout-api';
import { LineCandidateIndex } from '../src/linebreak/candidates.js';
import { tokenize, type InlineLike } from '../src/linebreak/tokens.js';
import { shapeParagraph } from '../src/linebreak/shaping.js';
import { breakParagraphWithLadder } from '../src/linebreak/emergency.js';
import { dpLedgerEntries } from '../src/linebreak/ledger-adapter.js';
import { LayoutEngineError } from '../src/errors.js';

const FONT = Object.freeze({
  fontId: 'guttman-rashi-normal',
  contentSha256: 'a'.repeat(64),
  family: 'Guttman Rashi',
  weight: 400,
  style: 'normal' as const,
});
const provider = createTestMeasurementProvider();
const FONT_SIZE_LU = 16000;
const BUDGET = { maxCandidatesPerState: 64, maxBeamWidth: 8 };

function ladderFor(text: string, W: number, options?: { allowOverflow?: boolean }) {
  const parsed = parseSourceText(`כותרת 1 - ח\n${text}\n`, { documentId: 'emg-test', sourceName: 'emg-test.txt' });
  const blocks = allBlocks(parsed.doc).filter((b) => b.role !== 'note-body') as readonly ContentBlock[];
  const bt = tokenize(blocks[1]!.id as string, blocks[1]!.inline as InlineLike, new Map());
  const shaped = shapeParagraph(bt.atoms, provider, FONT, FONT_SIZE_LU as never);
  const index = new LineCandidateIndex(bt, shaped, () => 0);
  return { result: breakParagraphWithLadder('emg-block', bt, index, W, BUDGET, options), bt, index };
}

describe('שלב 44: סולם החירום המדורג', () => {
  test('פסקה רגילה — רמה 0 בלבד; אפס רישומי חירום ואפס fallback', () => {
    const { result } = ladderFor('א ב ג ד ה ו ז ח ט י כ ל מ', 100000);
    expect(result.level).toBe(0);
    expect(result.perLineFallback.size).toBe(0);
    expect(result.emergencyRecords).toHaveLength(0);
    expect(result.dp.best?.fallbackSeverity).toBe(0);
  });

  test('מתיחת חירום — רמה 1 עם EMERGENCY_STRETCH (MEDIUM) על הקו החורג בלבד', () => {
    // W=43100: פער — [א ב ג|ד] (34688) רפוי ב-surplus 8412 > מתיחה 8000
    // (2 רווחים × 4000 במלואם — ADR-004-ר1), [א ב|ג ד] רפוי בהרבה יותר,
    // והפסקה בשלמותה (43584) גולשת — רמה 0 נכשלת; במתיחה כפולה (רמה 1)
    // [א ב ג|ד] חוקי עם EMERGENCY_STRETCH על הקו הראשון בלבד, [ד] נקי.
    // (עודכן בשלב 48 לקבוע המתיחה המתוקן — רווח מלא פר-רווח)
    const { result } = ladderFor('א ב ג ד', 43100);
    expect(result.level).toBe(1);
    expect(result.dp.lines.length).toBe(2);
    expect(result.perLineFallback.get(0)).toBe('EMERGENCY_STRETCH');
    expect(result.perLineFallback.get(1)).toBeUndefined(); // הקו האחרון נקי
    expect(result.dp.best?.fallbackSeverity).toBe(1); // MEDIUM=1
    expect(result.emergencyRecords.length).toBeGreaterThan(0);
  });

  test('מילה ארוכה מהטור — רמה 2; המילה בשלמותה על קו משלה; EMERGENCY_LINE (HIGH)', () => {
    const TEXT = 'א ב ג ד אאאאאאאאאאאאאאאאאאאא ה ו ז ח';
    const { result, bt } = ladderFor(TEXT, 30000);
    expect(result.level).toBe(2);
    // המילה הארוכה מופיעה על קו משלם בשלמותה — לא נחתכה
    const giantAtom = bt.atoms.find((a) => a.text.length >= 19)!;
    const giantLine = result.dp.lines.find((l) => {
      for (let t = l.startTok; t < l.endTok; t++) {
        const tok = bt.tokens[t]!;
        if (tok.kind === 'atom' && bt.atoms[tok.pIdx]!.id === giantAtom.id) return true;
      }
      return false;
    })!;
    expect(giantLine).toBeDefined();
    let wordAtomsInLine = 0;
    for (let t = giantLine.startTok; t < giantLine.endTok; t++) {
      const tok = bt.tokens[t]!;
      if (tok.kind === 'atom' && bt.atoms[tok.pIdx]!.text.trim().length > 0) wordAtomsInLine += 1;
    }
    expect(wordAtomsInLine).toBe(1); // קו המילה־הארוכה: המילה לבדה (רווח עוקב נחתך מהרוחב, האטום נשמר)
    expect(giantLine.candidate.metrics.widthLu).toBeGreaterThan(30000); // הגלישה נראית
    const giantIdx = result.dp.lines.indexOf(giantLine);
    expect(result.perLineFallback.get(giantIdx)).toBe('EMERGENCY_LINE');
    // כל אטומי המילים הוצבו — אין מחיקת תוכן
    const wordIds = new Set(bt.atoms.filter((a) => a.text.trim().length > 0).map((a) => a.id));
    const placed = new Set<string>();
    for (const l of result.dp.lines) {
      for (let t = l.startTok; t < l.endTok; t++) {
        const tok = bt.tokens[t]!;
        if (tok.kind === 'atom' && wordIds.has(bt.atoms[tok.pIdx]!.id)) placed.add(bt.atoms[tok.pIdx]!.id);
      }
    }
    expect(placed.size).toBe(wordIds.size);
  });

  test('קו רב־מילילי אינו מתמזג למקטע ענק — רמה 2 מחייבת כללי רמה 1 לבני־שבירה', () => {
    // בלי הכלל הזה ה־DP היה מעדיף מקטע אחד ענק (סכום חומרות מזערי) על פני
    // קווים נפרדים; עם הכלל — הפסקה נשברת לקווים והמילה הארוכה לבדה
    const { result } = ladderFor('א ב ג ד אאאאאאאאאאאאאאאאאאאא ה ו ז ח', 30000);
    expect(result.level).toBe(2);
    expect(result.dp.lines.length).toBeGreaterThan(4); // לא מקטע אחד
    for (const l of result.dp.lines) {
      // כל קו רב־מילילי מקיים את כללי רמה 1 (אין קו ענק גולש)
      if (l.candidate.metrics.wordCount > 1) {
        expect(l.candidate.metrics.widthLu).toBeLessThanOrEqual(30000);
      }
    }
  });

  test('כשל מפורש — allowOverflow=false ⇐ NO_LEGAL_LINE_BREAK מקוטלג, לא טקסט קטוע', () => {
    expect(() => ladderFor('א ב ג ד אאאאאאאאאאאאאאאאאאאא ה ו ז ח', 30000, { allowOverflow: false }))
      .toThrow(LayoutEngineError);
    try {
      ladderFor('א ב ג ד אאאאאאאאאאאאאאאאאאאא ה ו ז ח', 30000, { allowOverflow: false });
    } catch (e) {
      const err = e as LayoutEngineError;
      expect(err.catalogKey).toBe('errors.engine.NO_LEGAL_LINE_BREAK');
      expect(err.params.blockId).toBe('emg-block');
      expect(err.params.level).toBe(1);
    }
  });

  test('כל שלב חירום מתועד עם span ועלות — רשומות תקפות בפנקס אמיתי', () => {
    const { result, bt, index } = ladderFor('א ב ג ד אאאאאאאאאאאאאאאאאאאא ה ו ז ח', 30000);
    expect(result.emergencyRecords.length).toBe(3); // L0 נכשל, L1 נכשל, L2 הופעל
    const ledger = new DecisionLedgerBuilder('decisions');
    for (const rec of result.emergencyRecords) ledger.append(rec);
    const built = ledger.build();
    expect(built?.records.length).toBe(3);
    expect(built?.summary.fallbacks.EMERGENCY_LINE ?? 0).toBeGreaterThan(0);
    // רשומת ההפעלה נושאת spans של הקווים שנפגעו
    const applied = result.emergencyRecords.find((r) => r.scopeId.endsWith(':applied'));
    expect(applied).toBeDefined();
    expect(applied!.sourceSpans.length).toBeGreaterThan(0);
    // וקודי ה-fallback זורמים לרשומות הקו דרך המתאם
    const lineEntries = dpLedgerEntries('emg-block', bt, result.dp, 30000, result.perLineFallback);
    const withFallback = lineEntries.filter((e) => e.fallbackCode !== undefined);
    expect(withFallback.length).toBe(result.perLineFallback.size);
    void index;
  });

  test('דטרמיניזם — אותה רמה, אותם קווים ואותם קודים בכל ריצה', () => {
    const a = ladderFor('א ב ג ד אאאאאאאאאאאאאאאאאאאא ה ו ז ח', 30000).result;
    const b = ladderFor('א ב ג ד אאאאאאאאאאאאאאאאאאאא ה ו ז ח', 30000).result;
    expect(a.level).toBe(b.level);
    expect(JSON.stringify(a.dp.lines.map((l) => l.endTok))).toBe(JSON.stringify(b.dp.lines.map((l) => l.endTok)));
    expect(JSON.stringify([...a.perLineFallback.entries()])).toBe(JSON.stringify([...b.perLineFallback.entries()]));
    expect(JSON.stringify(a.emergencyRecords)).toBe(JSON.stringify(b.emergencyRecords));
  });

  test('אין hyphenation אוטומטי — המילה הארוכה לא נחתכה לאטומים חדשים', () => {
    const { result, bt } = ladderFor('א ב ג אאאאאאאאאאאאאאאאאאאא ד ה', 30000);
    const giant = bt.atoms.find((a) => a.text.length >= 19)!;
    // האטום עדיין אטום אחד שלם — לא פוצל
    expect(bt.atoms.filter((a) => a.id === giant.id)).toHaveLength(1);
    expect(result.dp.lines.length).toBeGreaterThan(2);
  });
});
