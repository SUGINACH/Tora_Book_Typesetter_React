/**
 * links.ts — מערכת הקישורים הסופית: LinkTable (שלב 72; אפיון §11, §14–15; M8).
 *
 * "קישורי עוגן↔הערה, TOC↔כותרת, הפניות פנימיות וקישורים חיצוניים לפי
 * מדיניות" (תכנית 72): טבלה אחת מאומתת לכל הקישורים שהמסמך מייצר — נבנית
 * **לאחר נקודת השבת** (שלב 71) מהתוצאות המיוצבות: זרם ה-endnotes, ערכי
 * ה-TOC והעוגנים. כל קישור דו-כיווני במפורש (הערה ⇄ גוף; TOC ⇄ כותרת).
 *
 * **מזהים דטרמיניסטיים** — "אין ids תלויי סדר ריצה אקראי": linkId נגזר
 * מהתוכן (סוג+מקור+יעד) ולא מסדר הבנייה; שתי הרצות ⇒ אותם מזהים.
 *
 * **הביקורת הסמנטית** (audit-core/link-audit.ts) בודקת כל target מול
 * ה-AnchorTable ומול מלאי ההערות/הכותרות — קישור שבור הוא ממצא, לא שקט.
 * חי ב-layout-api — החוזה המשותף של המנוע (הבונה), הביקורת וההיטלים
 * (render-html מוסיף data-link-* כשהטבלה מסופקת).
 */
import { canonicalJson } from './canonical-hash.js';
import { sha256Hex } from './hash.js';
import type { PageKind } from './ir.js';

// ─────────────────────────── סוגי קישורים ───────────────────────────

/** סוג הקישור — הזיווג והכיוון (§11; §14–15). */
export type LinkKind =
  /** הפניה בגוף ⇒ הערה (note-reference ⇒ note-body; קדימה). */
  | 'note'
  /** הערה ⇒ עוגן הגוף (קישור הדדי; חזרה). */
  | 'note-back'
  /** שורת TOC ⇒ כותרת (קדימה). */
  | 'toc'
  /** כותרת ⇒ שורת ה-TOC שלה (קישור הדדי; חזרה). */
  | 'toc-back'
  /** הפניה פנימית — עוגן ⇐ עוגן (inline anchor; §11). */
  | 'internal'
  /** קישור חיצוני — URL לפי מדיניות (סכמות מותרות בלבד). */
  | 'external';

export const LINK_KINDS: readonly LinkKind[] = Object.freeze(
  ['note', 'note-back', 'toc', 'toc-back', 'internal', 'external'] as const,
);

/** נקודת קצה של קישור — מקור או יעד. */
export interface LinkEndpoint {
  /** סוג הנקודה: בלוק גוף / הערה / כותרת / עוגן inline / URL חיצוני. */
  readonly kind: 'block' | 'note' | 'heading' | 'anchor' | 'url';
  /** המזהה הקנוני (blockId/noteId/anchorId) או ה-URL המלא (kind=url). */
  readonly id: string;
  /** סוג העמוד שבו הנקודה הוצבה (מהעוגן; אין כשטרם פוענח). */
  readonly pageKind?: PageKind;
  /** העמוד הפיזי שנפתח (מה-AnchorTable — התוצאה בפועל; אין הערכות). */
  readonly physicalPage?: number;
}

/** קישור אחד — מקור, יעד וכיוון. */
export interface LinkRecord {
  /** מזהה דטרמיניסטי — נגזר מהתוכן (makeLinkId); לא מסדר ריצה. */
  readonly linkId: string;
  readonly kind: LinkKind;
  readonly source: LinkEndpoint;
  readonly target: LinkEndpoint;
}

/** LinkTable — כל קישורי המסמך; קפואה ומאומתת. */
export interface LinkTable {
  readonly records: readonly LinkRecord[];
  readonly byId: ReadonlyMap<string, LinkRecord>;
  /** בעיות שנמצאו בבנייה (ריק = תקין): כפילויות, נקודות שגויות. */
  readonly issues: readonly string[];
}

// ─────────────────────────── מזהים ומדיניות ───────────────────────────

/** מזהה קישור דטרמיניסטי — מהתוכן בלבד; זהה בכל סדר בנייה. */
export function makeLinkId(kind: LinkKind, source: LinkEndpoint, target: LinkEndpoint): string {
  return `link:${kind}|${source.kind}:${source.id}|${target.kind}:${target.id}`;
}

/** הסכמות החיצוניות המותרות — מדיניות נעולה (אין javascript/data/file; §15). */
export const EXTERNAL_LINK_ALLOWED_SCHEMES: readonly string[] = Object.freeze(['http', 'https']);

/** קישור חיצוני לפי מדיניות — סכמה מותרת וערך שלם; דטרמיניסטי לחלוטין. */
export function externalLinkIssues(url: string): string[] {
  const issues: string[] = [];
  if (typeof url !== 'string' || url.length === 0 || url.length > 2048) {
    return ['url'];
  }
  if (/\s/.test(url)) return ['url:whitespace'];
  const m = /^([a-zA-Z][a-zA-Z0-9+.-]*):/.exec(url);
  if (m === null) return ['url:no-scheme'];
  const scheme = m[1]!.toLowerCase();
  if (!(EXTERNAL_LINK_ALLOWED_SCHEMES as readonly string[]).includes(scheme)) {
    issues.push(`scheme:${scheme}`);
  }
  return issues;
}

// ─────────────────────────── ולידציה ובנייה ───────────────────────────

const ENDPOINT_KINDS: readonly string[] = ['block', 'note', 'heading', 'anchor', 'url'];

/** ולידציה של נקודת קצה — רשימת בעיות (ריקה = תקינה). */
export function linkEndpointIssues(e: unknown): string[] {
  const issues: string[] = [];
  if (typeof e !== 'object' || e === null) return ['not-an-object'];
  const v = e as Record<string, unknown>;
  if (!ENDPOINT_KINDS.includes(v.kind as string)) issues.push(`kind:${String(v.kind)}`);
  if (typeof v.id !== 'string' || v.id.length === 0 || v.id.length > 2048) issues.push('id');
  if (v.pageKind !== undefined && typeof v.pageKind !== 'string') issues.push('pageKind');
  if (v.physicalPage !== undefined && (typeof v.physicalPage !== 'number' || !Number.isSafeInteger(v.physicalPage) || v.physicalPage < 1)) issues.push('physicalPage');
  if (v.kind === 'url' && externalLinkIssues(v.id as string).length > 0) issues.push(`url:${externalLinkIssues(v.id as string).join(',')}`);
  return issues;
}

/** בעיות של רשומת קישור בודדת — כולל התאמת linkId לנגזרת (אכיפת דטרמיניזם). */
export function linkRecordIssues(r: unknown): string[] {
  const issues: string[] = [];
  if (typeof r !== 'object' || r === null) return ['not-an-object'];
  const v = r as Record<string, unknown>;
  if (!(LINK_KINDS as readonly string[]).includes(v.kind as string)) issues.push(`kind:${String(v.kind)}`);
  if (typeof v.linkId !== 'string' || v.linkId.length === 0) issues.push('linkId');
  issues.push(...linkEndpointIssues(v.source).map((i) => `source:${i}`));
  issues.push(...linkEndpointIssues(v.target).map((i) => `target:${i}`));
  // המזהה חייב להיות הנגזרת הקנונית — מזהה "זר" הוא בעיה (תלות בסדר ריצה וכד')
  if (typeof v.linkId === 'string' && typeof v.kind === 'string' && (LINK_KINDS as readonly string[]).includes(v.kind)
    && typeof v.source === 'object' && typeof v.target === 'object') {
    const expected = makeLinkId(v.kind as LinkKind, v.source as LinkEndpoint, v.target as LinkEndpoint);
    if (v.linkId !== expected) issues.push('linkId:not-derived');
  }
  // כיווניות לפי סוג: note/note-back/toc/toc-back/internal דו-כיווניים במפורש
  if (v.kind === 'note' && (v.source as { kind?: string } | undefined)?.kind !== 'block') issues.push('note:source-not-block');
  if (v.kind === 'note' && (v.target as { kind?: string } | undefined)?.kind !== 'note') issues.push('note:target-not-note');
  if (v.kind === 'note-back' && (v.source as { kind?: string } | undefined)?.kind !== 'note') issues.push('note-back:source-not-note');
  if (v.kind === 'note-back' && (v.target as { kind?: string } | undefined)?.kind !== 'block') issues.push('note-back:target-not-block');
  if (v.kind === 'toc' && (v.target as { kind?: string } | undefined)?.kind !== 'heading') issues.push('toc:target-not-heading');
  if (v.kind === 'toc-back' && (v.source as { kind?: string } | undefined)?.kind !== 'heading') issues.push('toc-back:source-not-heading');
  if (v.kind === 'external' && (v.target as { kind?: string } | undefined)?.kind !== 'url') issues.push('external:target-not-url');
  return issues;
}

/** בעיות של טבלה שלמה — כפילויות מזהים ורשומות שגויות. */
export function linkTableIssues(t: LinkTable): readonly string[] {
  const issues: string[] = [];
  const seen = new Set<string>();
  for (const r of t.records) {
    issues.push(...linkRecordIssues(r).map((i) => `${r.linkId}:${i}`));
    if (seen.has(r.linkId)) issues.push(`duplicate:${r.linkId}`);
    seen.add(r.linkId);
  }
  return issues;
}

/** בניית טבלה מרשומות — מאמתת ומדווחת בעיות (לא זורקת; הביקורת מכריעה). */
export function buildLinkTable(records: readonly LinkRecord[]): LinkTable {
  const list = Object.freeze([...records]);
  const byId = new Map<string, LinkRecord>();
  for (const r of list) byId.set(r.linkId, r);
  const table: LinkTable = Object.freeze({ records: list, byId, issues: [] });
  const issues = linkTableIssues(table);
  return Object.freeze({ records: list, byId, issues: Object.freeze([...issues]) });
}

/**
 * חתימה קנונית של הטבלה — לנעילת artifacts ולדטרמיניזם: אותן רשומות ⇒
 * אותה חתימה **בכל סדר בנייה** (ממוין לפי linkId — המזהה עצמו נגזר מהתוכן).
 */
export function linkMappingHash(t: LinkTable): string {
  const sorted = [...t.records].map((r) => r.linkId).sort();
  return sha256Hex(canonicalJson({
    v: 1,
    kind: 'link-mapping',
    links: sorted.map((id) => {
      const r = t.byId.get(id)!;
      return {
        id: r.linkId, kind: r.kind,
        s: { k: r.source.kind, i: r.source.id, p: r.source.physicalPage ?? null },
        t: { k: r.target.kind, i: r.target.id, p: r.target.physicalPage ?? null },
      };
    }),
  } as unknown as Record<string, unknown>));
}
