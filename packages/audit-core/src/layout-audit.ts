/**
 * layout-audit.ts — ביקורת גאומטית וטקסטואלית על IR (שלב 38; אפיון §14, §12).
 *
 * שכבות (§14.2): כיסוי אטומים (כל אטום מקור בדיוק פעם אחת בגוף/notes,
 * בניכוי transformations מוצהרות), קישוריות הערות (סמן↔גוף), גאומטריה
 * (גלישת run, הכלה region⊆page ו-item⊆region, חפיפת קווים, baseline),
 * סדר טורים ב-RTL ואחידות גובה שורה.
 *
 * עקרונות: הביקורת עצמאית וטהורה — לא משנה את התוצאה, לא מריצה מדידה
 * מחדש (מבקרת את מה שיש ב-IR; חתימת המדידה נשמרת לפי §12 לשכבות
 * עתידיות), וממצאיה ממוקמים ב-IR (pageId/regionId/itemId) ובמקור
 * (sourceSpans). חומרה לפי §14.3: איבוד/שכפול/גלישה/חפיפה ⇒ HIGH;
 * איכות ואיזון ⇒ MEDIUM.
 */
import type { SourceSpan } from '@tora/content-model';
import { allBlocks } from '@tora/content-model';
import type { ContentDocument, LayoutDocument, LayoutRegion, LineFragment, PlacedItem } from '@tora/layout-api';
import { AuditCoreError, type AuditSeverity } from './text-audit.js';

// ─────────────────────────── ממצא ───────────────────────────

/** ממצא אחיד — בדיוק כמו §14.1 AuditFinding, ברמת הפריסה. */
export interface LayoutAuditFinding {
  readonly code: string;
  readonly severity: AuditSeverity;
  readonly messageKey: string;
  readonly params: Readonly<Record<string, string | number>>;
  readonly pageId?: string;
  readonly regionId?: string;
  readonly itemId?: string;
  readonly sourceSpans: readonly SourceSpan[];
  readonly actual?: string | number;
  readonly expected?: string | number;
}

/** כל קודי הממצא שהשכבה מפיקה — סגור ורשום (אין קוד צד). */
export const LAYOUT_AUDIT_FINDING_CODES: readonly string[] = Object.freeze([
  // טקסטואלי (§14.2 Text)
  'audit.layout.ATOM_MISSING',
  'audit.layout.ATOM_DUPLICATED',
  'audit.layout.NOTE_MARKER_WITHOUT_BODY',
  'audit.layout.NOTE_BODY_WITHOUT_MARKER',
  // גאומטרי (§14.2 Geometric)
  'audit.layout.LINE_RUN_OVERFLOW',
  'audit.layout.ITEM_OUT_OF_REGION',
  'audit.layout.REGION_OUT_OF_PAGE',
  'audit.layout.LINE_OVERLAP',
  'audit.layout.BASELINE_OUT_OF_LINE',
  'audit.layout.REGION_REF_UNKNOWN',
  'audit.layout.COLUMN_ORDER_RTL',
  'audit.layout.LINE_HEIGHT_NONUNIFORM',
  // נכסים (§14.2; שלב 69) — אף נכס אינו מכסה טקסט בשקט
  'audit.layout.ORNAMENT_OVERLAP',
]);

export interface LayoutAuditReport {
  /** אמת ⟺ אפס ממצאי HIGH (שער השלב). */
  readonly ok: boolean;
  readonly findingCount: number;
  readonly counts: Readonly<Record<AuditSeverity, number>>;
  readonly findings: readonly LayoutAuditFinding[];
  /** נתוני רקע לדוח — לא חלק מהקביעה. */
  readonly stats: {
    readonly pages: number;
    readonly lines: number;
    readonly contentAtoms: number;
    readonly placedAtomOccurrences: number;
  };
}

/** הקלט — חתימת §12: auditLayout(content, settings, measurement, layout). */
export interface LayoutAuditInput {
  readonly content: ContentDocument;
  readonly settings: unknown;
  /** נשמר לשכבות עתידיות (ניטור סחף מדידה) — v1 מבקר את ה-IR כמות שהוא. */
  readonly measurement?: unknown;
  readonly layout: LayoutDocument;
}

// ─────────────────────────── ביקורת ───────────────────────────

export function auditLayout(input: LayoutAuditInput): LayoutAuditReport {
  const { content, layout } = input;
  if (content === null || typeof content !== 'object' || !Array.isArray((content as { parts?: unknown }).parts)) {
    throw new AuditCoreError('errors.audit.INVALID_INPUT', { reason: 'content' }, 'נדרש מסמך תוכן (parts)');
  }
  if (layout === null || typeof layout !== 'object' || !Array.isArray((layout as { pages?: unknown }).pages)) {
    throw new AuditCoreError('errors.audit.INVALID_INPUT', { reason: 'layout' }, 'נדרש IR (pages)');
  }

  const findings: LayoutAuditFinding[] = [];
  const counts: Record<AuditSeverity, number> = { HIGH: 0, MEDIUM: 0, LOW: 0 };
  const finding = (
    code: string, severity: AuditSeverity,
    params: Record<string, string | number>,
    loc: { pageId?: string; regionId?: string; itemId?: string },
    spans: readonly SourceSpan[],
    actual?: string | number, expected?: string | number,
  ): void => {
    if (!(LAYOUT_AUDIT_FINDING_CODES as readonly string[]).includes(code)) {
      throw new AuditCoreError('errors.audit.UNREGISTERED_FINDING_CODE', { code }, `קוד ממצא לא רשום: ${code}`);
    }
    counts[severity] += 1;
    findings.push(Object.freeze({
      code, severity, messageKey: code, params: Object.freeze({ ...params }),
      ...(loc.pageId !== undefined ? { pageId: loc.pageId } : {}),
      ...(loc.regionId !== undefined ? { regionId: loc.regionId } : {}),
      ...(loc.itemId !== undefined ? { itemId: loc.itemId } : {}),
      sourceSpans: Object.freeze([...spans]),
      ...(actual !== undefined ? { actual } : {}),
      ...(expected !== undefined ? { expected } : {}),
    }));
  };

  // ── 1. כיסוי אטומים: כל אטום מקור בדיוק פעם אחת (בניכוי suppress) ──
  const expected = new Set<string>();
  for (const block of allBlocks(content)) {
    for (const item of block.inline) {
      if (item.kind !== 'text') continue;
      for (const atom of item.atoms) expected.add(atom.id as string);
    }
  }
  const suppressed = new Set<string>();
  for (const t of content.transforms ?? []) {
    if (t.kind === 'suppress') for (const id of t.from) suppressed.add(id as string);
  }
  for (const id of suppressed) expected.delete(id);

  const placed = new Map<string, number>(); // atomId → מופעים בקווים
  let lineCount = 0;
  const noteBodyIds = new Set<string>();   // noteId מ-blockId 'note:<id>'
  const lineBlockSpans = new Map<string, readonly SourceSpan[]>();
  for (const page of layout.pages) {
    for (const item of page.items as readonly PlacedItem[]) {
      if (item.kind !== 'line') continue;
      lineCount += 1;
      const line = item as unknown as LineFragment;
      lineBlockSpans.set(line.id, line.sourceSpans ?? []);
      if (line.blockId.startsWith('note:')) noteBodyIds.add(line.blockId.slice('note:'.length));
      for (const run of line.runs) {
        for (const id of run.atomIds) placed.set(id as string, (placed.get(id as string) ?? 0) + 1);
      }
    }
  }
  for (const id of expected) {
    const n = placed.get(id) ?? 0;
    if (n === 0) {
      if (findings.length < 200) finding('audit.layout.ATOM_MISSING', 'HIGH', { atomId: id.slice(0, 80) }, {}, [], 0, 1);
    } else if (n > 1) {
      if (findings.length < 200) finding('audit.layout.ATOM_DUPLICATED', 'HIGH', { atomId: id.slice(0, 80) }, {}, [], n, 1);
    }
  }
  let placedOccurrences = 0;
  for (const n of placed.values()) placedOccurrences += n;
  for (const id of placed.keys()) {
    if (!expected.has(id) && !suppressed.has(id) && findings.length < 200) {
      finding('audit.layout.ATOM_DUPLICATED', 'HIGH', { atomId: id.slice(0, 80), reason: 'not-in-content' }, {}, [], placed.get(id) ?? 0, 0);
    }
  }

  // ── 2. קישוריות הערות: סמן↔גוף ──
  const markerIds = new Set<string>();
  for (const page of layout.pages) {
    for (const item of page.items as readonly PlacedItem[]) {
      if (item.kind === 'note-marker') {
        markerIds.add((item as unknown as { noteId: string }).noteId);
      }
    }
  }
  for (const noteId of markerIds) {
    if (!noteBodyIds.has(noteId)) {
      finding('audit.layout.NOTE_MARKER_WITHOUT_BODY', 'HIGH', { noteId }, {}, []);
    }
  }
  // גוף בלי סמן: חובה רק להערות ממוספרות (fn-/en-) — להן מוצב סמן בגוף;
  // sidenotes (sn-) אינן ממוספרות ואינן מקבלות סמן בגוף ב-v0 (החלטה מתועדת
  // במנוע: הדיבור המתחיל נדחה לעמודי ההערות עד כללי H של פרק ז).
  for (const noteId of noteBodyIds) {
    if (!markerIds.has(noteId) && (noteId.startsWith('fn-') || noteId.startsWith('en-'))) {
      finding('audit.layout.NOTE_BODY_WITHOUT_MARKER', 'HIGH', { noteId }, {}, []);
    }
  }

  // ── 3. גאומטריה: הכלה, גלישה, חפיפה, baseline ──
  for (const page of layout.pages) {
    const regions = new Map<string, LayoutRegion>();
    for (const r of page.regions) regions.set(r.id, r);
    for (const r of page.regions) {
      if (!contains(page.size.width as number, page.size.height as number, r.rect)) {
        finding('audit.layout.REGION_OUT_OF_PAGE', 'HIGH',
          { regionId: r.id, pageId: page.id }, { pageId: page.id, regionId: r.id }, []);
      }
    }
    // קווים לפי אזור — לחפיפה ולאחידות
    const linesByRegion = new Map<string, LineFragment[]>();
    for (const item of page.items as readonly PlacedItem[]) {
      if (item.kind !== 'line') continue;
      const line = item as unknown as LineFragment;
      const loc = { pageId: page.id, regionId: line.regionId, itemId: line.id };
      const region = regions.get(line.regionId);
      if (region === undefined) {
        finding('audit.layout.REGION_REF_UNKNOWN', 'HIGH', { regionId: line.regionId }, loc, line.sourceSpans ?? []);
        continue;
      }
      if (!contains(region.rect.width as number, region.rect.height as number,
        shift(line.rect, region.rect.x as number, region.rect.y as number))) {
        finding('audit.layout.ITEM_OUT_OF_REGION', 'HIGH', { itemId: line.id }, loc, line.sourceSpans ?? []);
      }
      const baselineInRect = (line.baseline as number) >= (line.rect.y as number)
        && (line.baseline as number) <= ((line.rect.y as number) + (line.rect.height as number));
      if (!baselineInRect) {
        finding('audit.layout.BASELINE_OUT_OF_LINE', 'HIGH', { itemId: line.id, baseline: line.baseline as number }, loc, line.sourceSpans ?? []);
      }
      for (const run of line.runs) {
        const end = (run.startLu as number) + (run.widthLu as number);
        if (end > (line.rect.width as number) + 1 || (run.startLu as number) < -1) {
          finding('audit.layout.LINE_RUN_OVERFLOW', 'HIGH',
            { runId: run.id, end, lineWidth: line.rect.width as number }, loc, line.sourceSpans ?? [], end, line.rect.width as number);
        }
      }
      const arr = linesByRegion.get(line.regionId) ?? [];
      arr.push(line);
      linesByRegion.set(line.regionId, arr);
    }
    for (const [regionId, lines] of linesByRegion) {
      const sorted = [...lines].sort((a, b) => (a.rect.y as number) - (b.rect.y as number));
      for (let i = 1; i < sorted.length; i++) {
        const prev = sorted[i - 1] as LineFragment;
        const cur = sorted[i] as LineFragment;
        if ((cur.rect.y as number) < (prev.rect.y as number) + (prev.rect.height as number)) {
          finding('audit.layout.LINE_OVERLAP', 'HIGH',
            { itemIdA: prev.id, itemIdB: cur.id, regionId },
            { pageId: page.id, regionId, itemId: cur.id }, cur.sourceSpans ?? [],
            cur.rect.y as number, (prev.rect.y as number) + (prev.rect.height as number));
        }
      }
      // אחידות גובה שורה (v0: כל המרווחים באזור זהים) — איכות, לא חוזה גאומטרי
      const deltas: number[] = [];
      for (let i = 1; i < sorted.length; i++) {
        deltas.push((sorted[i] as LineFragment).baseline as number - (sorted[i - 1] as LineFragment).baseline as number);
      }
      const distinct = new Set(deltas);
      if (distinct.size > 1 && deltas.length > 1) {
        finding('audit.layout.LINE_HEIGHT_NONUNIFORM', 'MEDIUM',
          { regionId, deltas: distinct.size }, { pageId: page.id, regionId }, [],
          distinct.size, 1);
      }
    }
    // סדר טורים RTL: טור שמאל (1) מלא בעוד טור ימין (0) ריק (§14.2)
    const rightCol = page.regions.find((r) => r.kind === 'body-column' && r.columnIndex === 0);
    const leftCol = page.regions.find((r) => r.kind === 'body-column' && r.columnIndex === 1);
    if (rightCol !== undefined && leftCol !== undefined) {
      const leftHas = (linesByRegion.get(leftCol.id) ?? []).length > 0;
      const rightHas = (linesByRegion.get(rightCol.id) ?? []).length > 0;
      if (leftHas && !rightHas) {
        finding('audit.layout.COLUMN_ORDER_RTL', 'MEDIUM',
          { pageId: page.id, rightRegion: rightCol.id, leftRegion: leftCol.id },
          { pageId: page.id, regionId: leftCol.id }, []);
      }
    }
    // ── עיטורים ונכסים: אף נכס אינו מכסה טקסט בשקט (§14.2; שלב 69) ──
    // רקע שער מתועד: פריט עיטור באזור ornament (השכבה שמאחורי ה-custom-box —
    // האזור הבטוח של העיצוב) אינו נבדק מול קווים; כל עיטור אחר — כן.
    const ornRegionIds = new Set(page.regions.filter((r) => r.kind === 'ornament').map((r) => r.id));
    const absLines: Array<{ id: string; x: number; y: number; w: number; h: number; spans: readonly unknown[] }> = [];
    for (const item of page.items as readonly PlacedItem[]) {
      if (item.kind !== 'line') continue;
      const line = item as unknown as LineFragment;
      const reg = regions.get(line.regionId);
      if (reg === undefined) continue;
      absLines.push({
        id: line.id,
        x: (reg.rect.x as number) + (line.rect.x as number),
        y: (reg.rect.y as number) + (line.rect.y as number),
        w: line.rect.width as number,
        h: line.rect.height as number,
        spans: line.sourceSpans ?? [],
      });
    }
    const overlaps = (a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }): boolean =>
      a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
    for (const item of page.items as readonly PlacedItem[]) {
      const isOrnament = item.kind === 'ornament'
        || (item.kind === 'rule' && (item as unknown as { ruleKind?: unknown }).ruleKind === 'ornament');
      if (!isOrnament || ornRegionIds.has((item as unknown as { regionId: string }).regionId)) continue;
      const orn = item as unknown as { id: string; regionId: string; rect: RectLike };
      const reg = regions.get(orn.regionId);
      if (reg === undefined) continue;
      const abs = {
        x: (reg.rect.x as number) + (orn.rect.x as number),
        y: (reg.rect.y as number) + (orn.rect.y as number),
        w: orn.rect.width as number,
        h: orn.rect.height as number,
      };
      for (const l of absLines) {
        if (overlaps(abs, l)) {
          finding('audit.layout.ORNAMENT_OVERLAP', 'HIGH',
            { itemId: orn.id, lineId: l.id, regionId: orn.regionId },
            { pageId: page.id, regionId: orn.regionId, itemId: orn.id }, l.spans as readonly SourceSpan[], 1, 0);
        }
      }
    }
    // אזור עיטור החופף אזור תוכן בעמוד שאינו שער — בשער הרקע מתועד (§11.2).
    const pageKind = String((page as unknown as { kind?: unknown }).kind ?? '');
    const isShaarPage = pageKind === 'main-shaar' || pageKind === 'back-shaar' || pageKind === 'sub-shaar';
    if (!isShaarPage) {
      const contentKinds = new Set(['body-column', 'header', 'footnotes', 'outer-notes', 'footer']);
      const ornRegions = page.regions.filter((r) => r.kind === 'ornament');
      for (const orn of ornRegions) {
        const o = { x: orn.rect.x as number, y: orn.rect.y as number, w: orn.rect.width as number, h: orn.rect.height as number };
        for (const r of page.regions) {
          if (r.id === orn.id || !contentKinds.has(String(r.kind))) continue;
          const c = { x: r.rect.x as number, y: r.rect.y as number, w: r.rect.width as number, h: r.rect.height as number };
          if (overlaps(o, c)) {
            finding('audit.layout.ORNAMENT_OVERLAP', 'HIGH',
              { regionId: orn.id, overlapsRegion: r.id, pageId: page.id },
              { pageId: page.id, regionId: r.id }, []);
          }
        }
      }
    }
  }

  const ok = counts.HIGH === 0;
  return Object.freeze({
    ok,
    findingCount: findings.length,
    counts: Object.freeze({ ...counts }),
    findings: Object.freeze([...findings]),
    stats: Object.freeze({
      pages: layout.pages.length,
      lines: lineCount,
      contentAtoms: expected.size,
      placedAtomOccurrences: placedOccurrences,
    }),
  });
}

// ─────────────────────────── עזרי גאומטריה ───────────────────────────

interface RectLike { x: number; y: number; width: number; height: number }

function contains(w: number, h: number, rect: RectLike): boolean {
  return rect.x >= 0 && rect.y >= 0
    && rect.x + rect.width <= w + 1
    && rect.y + rect.height <= h + 1;
}

function shift(rect: RectLike, dx: number, dy: number): RectLike {
  return { x: (rect.x as number) - dx, y: (rect.y as number) - dy, width: rect.width, height: rect.height };
}
