/**
 * ledger-adapter.ts — הפיכת תוצאת ה־DP לרשומות פנקס (שלב 43; אפיון §6.7, §8.2).
 *
 * "כל rejection וניצחון נרשמים ב־ledger": לכל קו שנבחר נבנית רשומת
 * line-break שמתעדת את ההכרעה בנקודת הקצה שלו — המועמדים שהוערכו
 * לאותו קצה (מכל start פעיל), הזוכה, הדחויים (עם קוד סיבה: הדחת
 * comparator או פסילת חוקיות), התקציב וה־spans. שלב 47 מחבר זאת
 * לתוך typeset.
 *
 * הסקלר ברשומה לתצוגה בלבד (ADR-004: ההשוואה האמיתית היא הווקטור).
 */
import { canonicalJson, type AppendDecision, sha256Hex } from '@tora/layout-api';
import { coalesceSpans, type Cell, type BlockTokens } from './tokens.js';
import type { DpResult } from './dp.js';
import { lineQualityVector, qualityDisplayScalar, type QualityVector } from './quality.js';

export function dpLedgerEntries(
  blockId: string,
  bt: BlockTokens,
  dp: DpResult<QualityVector>,
  columnWidthLu: number,
  perLineFallback?: ReadonlyMap<number, string>,
): readonly AppendDecision[] {
  const entries: AppendDecision[] = [];
  // מה הוערך בכל נקודת קצה: דחויים (חוקיות/comparator) — לרישום מלא
  const rejectedByEnd = new Map<number, { candidateId: string; reason: string }[]>();
  for (const r of dp.rejections) {
    const cur = rejectedByEnd.get(r.endTokenIndex) ?? [];
    cur.push({ candidateId: r.candidateId, reason: r.reason });
    rejectedByEnd.set(r.endTokenIndex, cur);
  }
  for (const d of dp.dominated) {
    const cur = rejectedByEnd.get(d.endTokenIndex) ?? [];
    cur.push({ candidateId: d.rejectedId, reason: 'dominated-by-comparator' });
    rejectedByEnd.set(d.endTokenIndex, cur);
  }

  dp.lines.forEach((line, i) => {
    const cells: Cell[] = [];
    for (let t = line.startTok; t < line.endTok; t++) {
      const tok = bt.tokens[t]!;
      if (tok.kind !== 'forced') cells.push(tok);
    }
    const rejected = (rejectedByEnd.get(line.endTok) ?? []).map((r) => ({ candidateId: r.candidateId, reason: r.reason }));
    const lineQuality = lineQualityVector(
      {
        candidate: line.candidate,
        lineIndex: i,
        isFirst: i === 0,
        isLast: line.breakPoint.kind === 'end',
        justification: line.justification,
      },
      columnWidthLu,
    );
    entries.push({
      stage: 'line-break',
      scopeId: `${blockId}#f${i}`,
      sourceSpans: coalesceSpans(cells, bt.atoms),
      stateHash: sha256Hex(canonicalJson({
        b: blockId, f: i, s: line.startTok, e: line.endTok, j: line.justification, r: line.breakPoint.rule,
      })),
      candidates: [
        { id: line.candidate.id, cost: qualityDisplayScalar(lineQuality) },
        ...rejected.map((r) => ({ id: r.candidateId, cost: 0 })),
      ],
      selectedCandidateId: line.candidate.id,
      rejected,
      ...(perLineFallback?.get(i) !== undefined ? { fallbackCode: perLineFallback.get(i) as string } : {}),
      budget: { generated: dp.budget.generated, pruned: dp.budget.pruned, exhausted: dp.budget.exhausted },
    });
  });
  return entries;
}
