/**
 * tokens.ts — מודל הטוקנים של הפסקה (שלב 41; אפיון §8.1).
 *
 * הוצא מ־typeset-v0.ts בשלב 41 בלי שינוי התנהגות: הטוקנים הם תשתית
 * משותפת לשבירת השורות (פרק ו) ולהצבה. כל תא הוא אטום, סמן הערה,
 * עוגן או שבירה כפויה (explicit-break); סדר הטוקנים הוא סדר המקור
 * ואינו משתנה בשום שלב — "אין מחיקת atoms" (§8.2).
 */
import type { SourceSpan, TextAtom } from '@tora/layout-api';

export type Cell =
  | { readonly kind: 'atom'; readonly pIdx: number }
  | { readonly kind: 'marker'; readonly noteId: string; readonly label: string; readonly source: SourceSpan; readonly bodyPrefix: boolean }
  | { readonly kind: 'anchor'; readonly anchorId: string; readonly source: SourceSpan };

export interface BlockTokens {
  readonly blockId: string;
  readonly tokens: readonly Token[];
  readonly atoms: readonly TextAtom[];
}
export type Token = Cell | { readonly kind: 'forced' };

export type InlineLike = readonly { kind: string; atoms?: readonly TextAtom[]; noteId?: string; source?: SourceSpan; anchorId?: string }[];

export function pushInlineItem(tokens: Token[], atoms: TextAtom[], item: NonNullable<InlineLike[number]>, noteLabels: ReadonlyMap<string, string>): void {
  switch (item.kind) {
    case 'text': {
      for (const atom of item.atoms ?? []) {
        tokens.push({ kind: 'atom', pIdx: atoms.length });
        atoms.push(atom);
      }
      break;
    }
    case 'note-reference': {
      // סמן בגוף: נוצר רק להפניה ממוספרת (H7/sidenote ללא מספור — v0 אינו מציב סמן)
      const label = item.noteId !== undefined ? noteLabels.get(item.noteId) : undefined;
      if (label !== undefined && item.source) {
        tokens.push({ kind: 'marker', noteId: item.noteId as string, label, source: item.source, bodyPrefix: false });
      }
      break;
    }
    case 'anchor': {
      if (item.anchorId && item.source) tokens.push({ kind: 'anchor', anchorId: item.anchorId, source: item.source });
      break;
    }
    case 'explicit-break': {
      tokens.push({ kind: 'forced' });
      break;
    }
    default: break; // inline-box — v0 אינו מציב (M6); הביקורת מדווחת דחייה מתועדת.
  }
}

export function tokenize(blockId: string, inline: InlineLike, noteLabels: ReadonlyMap<string, string>): BlockTokens {
  const tokens: Token[] = [];
  const atoms: TextAtom[] = [];
  for (const item of inline) pushInlineItem(tokens, atoms, item, noteLabels);
  return { blockId, tokens, atoms };
}

/** טוקניזציה של גוף הערה עם קידומת תווית (bodyPrefix ⇒ רווח אחרי התווית). */
export function tokenizeNotesBody(noteId: string, label: string | null, src: SourceSpan, inline: InlineLike): BlockTokens {
  const tokens: Token[] = [];
  const atoms: TextAtom[] = [];
  if (label !== null) {
    tokens.push({ kind: 'marker', noteId, label, source: src, bodyPrefix: true });
  }
  for (const item of inline) pushInlineItem(tokens, atoms, item, new Map());
  return { blockId: `note:${noteId}`, tokens, atoms };
}

/** איחוי spans מקור רצופים של תאי הקו (אטומים ואז סמנים/עוגנים) — לאיתור במקור. */
export function coalesceSpans(cells: readonly Cell[], atoms: readonly TextAtom[]): readonly SourceSpan[] {
  const body: SourceSpan[] = [];
  let cur: SourceSpan | null = null;
  for (const cell of cells) {
    if (cell.kind !== 'atom') continue;
    const sp = atoms[cell.pIdx]!.source;
    if (cur !== null && cur.stream === sp.stream && cur.endUtf16 === sp.startUtf16) {
      cur = { ...cur, endUtf16: sp.endUtf16 } as SourceSpan;
    } else {
      if (cur !== null) body.push(cur);
      cur = sp;
    }
  }
  if (cur !== null) body.push(cur);
  const extras: SourceSpan[] = [];
  for (const cell of cells) {
    if (cell.kind === 'marker' || cell.kind === 'anchor') extras.push(cell.source);
  }
  return Object.freeze([...body, ...extras]);
}

/** מיפוי אטום ← אינדקס הטוקן הראשון שלו (או tokens.length אם אינו נמצא). */
export function atomTokenIndexMap(bt: BlockTokens): readonly number[] {
  const map = new Array<number>(bt.atoms.length).fill(bt.tokens.length);
  for (let t = 0; t < bt.tokens.length; t++) {
    const tok = bt.tokens[t]!;
    if (tok.kind === 'atom' && map[tok.pIdx] === bt.tokens.length) map[tok.pIdx] = t;
  }
  return map;
}
