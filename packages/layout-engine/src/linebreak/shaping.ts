/**
 * shaping.ts — shaping לפסקה לפי רצופי רמה (הוצא מ־typeset-v0.ts בשלב 41;
 * אפיון §8.1: "מבצעים shaping לרצפים ושומרים cluster→atom mapping").
 *
 * רוחב כל אטום הוא סכום ה־glyph advances של ה־clusters שלו — מהספק
 * בלבד, לא מ־CSS ולא מסכום מילים שהומדדו בנפרד (§8.1#5).
 */
import {
  type AnyProvider,
  asLu,
  computeBidi,
  type BidiRun,
  type FontFaceKey,
  type LayoutUnit,
  type ShapedRun,
  type TextAtom,
} from '@tora/layout-api';
import { LayoutEngineError } from '../errors.js';

export type ShapingAtomsArg = Parameters<AnyProvider['shape']>[0]['atoms'];

export interface ShapedParagraph {
  readonly advances: readonly number[];
  readonly ascentLu: number;
  readonly descentLu: number; // חיובי
  readonly runOfAtom: readonly number[];
  readonly runs: readonly { readonly run: BidiRun; readonly shaped: ShapedRun }[];
  readonly visualOrder: readonly number[];
}

export function toShapingAtoms(atoms: readonly TextAtom[]): ShapingAtomsArg {
  return atoms as unknown as ShapingAtomsArg;
}

export function shapeParagraph(atoms: readonly TextAtom[], provider: AnyProvider, font: FontFaceKey, fontSizeLu: LayoutUnit): ShapedParagraph {
  const shapingAtoms = toShapingAtoms(atoms);
  const bidi = computeBidi(shapingAtoms, { paragraphLevel: 'auto' });
  const runs: { run: BidiRun; shaped: ShapedRun }[] = [];
  for (const run of bidi.runs) {
    const slice = shapingAtoms.slice(run.startAtom, run.endAtom + 1);
    const shaped = provider.shape({
      atoms: slice,
      font,
      fontSizeLu,
      direction: run.direction,
      language: 'he',
      features: {},
      letterSpacingLu: asLu(0),
    });
    runs.push({ run, shaped });
  }
  const advances = new Array<number>(atoms.length).fill(0);
  const runOfAtom = new Array<number>(atoms.length).fill(-1);
  for (let ri = 0; ri < runs.length; ri++) {
    const { run, shaped } = runs[ri]!;
    for (const g of shaped.glyphs) {
      const ai = run.startAtom + g.clusterAtomIndex;
      if (ai < 0 || ai >= atoms.length) {
        throw new LayoutEngineError('errors.engine.SHAPING_MISMATCH', { where: `cluster ${g.clusterAtomIndex}` }, 'מיפוי cluster מחוץ לטווח');
      }
      advances[ai] = (advances[ai] ?? 0) + g.advanceLu;
    }
    for (let i = run.startAtom; i <= run.endAtom; i++) runOfAtom[i] = ri;
  }
  const first = runs[0]?.shaped;
  return {
    advances,
    ascentLu: first ? first.ascentLu : 0,
    descentLu: first ? first.descentLu : 0,
    runOfAtom,
    runs,
    visualOrder: bidi.visualOrder,
  };
}
