/**
 * firstword.ts — הכללים הטיפוגרפיים העדינים כמדיניות מדידה (שלב 64; אפיון §10.2):
 * first-word-window (sunken/inline/bold/none), dibbur hamatchil (דיבור המתחיל)
 * ו-drop-word (מילה ראשונה) — הכל זיהוי/מדיניות טהורים שמתבצעים **לפני** שבירת
 * השורות; אין עיטוף HTML מאוחר אחרי השבירה ואין regex ברנדרר.
 *
 * סדר ה-wrappers הקנוני (§10.2: "סדר wrappers אחד ויחיד במודל, לא CSS מקרי"):
 * דיבור-המתחיל חיצוני, מילה-ראשונה פנימית — כמו בישן (applyDibburHamatchil
 * מופעל אחרי createDropWord ועוטף אותו).
 */

/** מצבי מילה-ראשונה (§10.2: sunken/inline/bold/none — legacy drop-word-mode). */
export type FirstWordMode = 'window' | 'bold' | 'inline' | 'none';

/** מדיניות מילה-ראשונה — מדיניות מדידה: משפיעה על גובה/רוחב הקו הראשון. */
export interface FirstWordPolicy {
  readonly mode: FirstWordMode;
  /** drop-word-count — כמות המילים הראשונות (legacy: 1). */
  readonly wordCount: number;
  /** drop-word-min-lines — מספר קווים מינימלי לחלון (legacy: 2). */
  readonly minLines: number;
  /** font-first-word — גופן המילה הראשונה (מדידה). */
  readonly font: string;
  /** size-first-word — גודל המילה הראשונה (מדידה). */
  readonly size: string;
}

/** המצב האפקטיבי אחרי התנאים (חלון דורש מספר קווים; המשך פסקה — אין החלה). */
export type EffectiveFirstWordMode = 'window' | 'bold' | 'inline' | 'none';

/** פיצול מילה-ראשונה — טהור ודטרמיניסטי. */
export interface FirstWordSplit {
  /** המילים הראשונות (החלון/המודגשות); ריק כשלא הוחל. */
  readonly words: string;
  /** שארית הטקסט אחרי המילים הראשונות. */
  readonly rest: string;
  /** המצב האפקטיבי לאחר תנאי הסף (window דורש minLines; אחרת inline). */
  readonly effectiveMode: EffectiveFirstWordMode;
  /** האם הוחל בפועל (false = continuation / mode none / טקסט ריק). */
  readonly applied: boolean;
}

function readStr(settings: { readonly values: Readonly<Record<string, unknown>> }, key: string, fallback: string): string {
  const raw = settings.values[key];
  return typeof raw === 'string' && raw.length > 0 ? raw : fallback;
}
function readInt(settings: { readonly values: Readonly<Record<string, unknown>> }, key: string, fallback: number, max: number): number {
  const raw = settings.values[key];
  if (typeof raw === 'string' && /^\d+$/.test(raw.trim())) {
    const v = Number(raw.trim());
    if (Number.isSafeInteger(v) && v >= 1 && v <= max) return v;
  }
  if (typeof raw === 'number' && Number.isSafeInteger(raw) && raw >= 1 && raw <= max) return raw;
  return fallback;
}

/** מדיניות מילה-ראשונה מההגדרות (drop-word-mode/count/min-lines + font/size-first-word). */
export function firstWordPolicyOf(settings: { readonly values: Readonly<Record<string, unknown>> }): FirstWordPolicy {
  const rawMode = String(settings.values['drop-word-mode'] ?? 'window');
  const mode: FirstWordMode = (['window', 'bold', 'inline', 'none'] as const).includes(rawMode as never)
    ? rawMode as FirstWordMode
    : 'window';
  return Object.freeze({
    mode,
    wordCount: readInt(settings, 'drop-word-count', 1, 10),
    minLines: readInt(settings, 'drop-word-min-lines', 2, 100),
    font: readStr(settings, 'font-first-word', "'FrankReal', 'Frank Ruhl Libre', serif"),
    size: readStr(settings, 'size-first-word', '1.5'),
  });
}

/**
 * פיצול מילה-ראשונה (§10.2): **אין החלה על continuation: 'middle'** של אותה
 * פסקה; חלון (sunken) רק כשמספר הקווים ≥ minLines — אחרת inline; none —
 * אין החלה. המילים אינן נמחקות ואינן נבנות מחדש — רק זיהוי span למדידה.
 */
export function splitFirstWord(
  text: string,
  policy: FirstWordPolicy,
  opts: { readonly isContinuation: boolean; readonly lineCount: number },
): FirstWordSplit {
  const trimmed = text.trim();
  if (policy.mode === 'none' || opts.isContinuation || trimmed.length === 0) {
    return { words: '', rest: trimmed, effectiveMode: policy.mode, applied: false };
  }
  const words = trimmed.split(/\s+/);
  const n = Math.min(policy.wordCount, words.length);
  const first = words.slice(0, n).join(' ');
  const rest = words.slice(n).join(' ');
  const effectiveMode: EffectiveFirstWordMode = policy.mode === 'window'
    ? (opts.lineCount >= policy.minLines ? 'window' : 'inline')
    : policy.mode;
  return { words: first, rest, effectiveMode, applied: true };
}

/** ── דיבור המתחיל (ד"ה; §10.2) — זיהוי span סמנטי בלבד ── */

/** המפרידים הקנוניים של הדיבור-המתחיל (legacy: . - – —; במדיניות, לא ברנדרר). */
export const DIBBUR_DELIMITERS: readonly string[] = Object.freeze(['.', '—', '–', '-']);

/**
 * מגבלת אורך הביטוי (legacy: {1,80}). §10.2: "מגבלת אורך נשמרים ב-Settings" —
 * קבוע מדיניות נעול עד שייפתח מפתח הגדרה ייעודי (תועד במרשם).
 */
export const DIBBUR_MAX_PHRASE_LEN = 80;

/** פיצול דיבור-המתחיל: הפתיח עד המפריד הראשון (כוללו) + השארית. */
export interface DibburSplit {
  /** הפתיח כולל המפריד (כמו בישן: match[1]); ריק כשאין זיהוי. */
  readonly phrase: string;
  /** ההמשך אחרי המפריד (חתוך רווחים). */
  readonly rest: string;
  /** המפריד שזיהה (לרישום); null כשאין. */
  readonly delimiter: string | null;
}

/**
 * זיהוי דיבור-המתחיל — טהור ודטרמיניסטי: המפריד הראשון שלפניו 1..80 תווים
 * שאינם מפרידים; הביטוי כולל את המפריד. אין זיהוי ⇒ הטקסט כולו rest.
 */
export function splitDibburHamatchil(text: string): DibburSplit {
  const trimmed = text.trim();
  if (trimmed.length === 0) return { phrase: '', rest: '', delimiter: null };
  // מציאת המפריד הראשון; הביטוי חוקי רק אם לפניו אין מפריד נוסף ואורכו בגבול
  let firstDelimIdx = -1;
  let firstDelim = '';
  for (const delim of DIBBUR_DELIMITERS) {
    const idx = trimmed.indexOf(delim);
    if (idx >= 0 && (firstDelimIdx === -1 || idx < firstDelimIdx || (idx === firstDelimIdx && delim.length > firstDelim.length))) {
      firstDelimIdx = idx;
      firstDelim = delim;
    }
  }
  if (firstDelimIdx < 1) return { phrase: '', rest: trimmed, delimiter: null }; // מפריד בתחילת הטקסט — אין ביטוי
  const phraseEnd = firstDelimIdx + firstDelim.length;
  if (phraseEnd > DIBBUR_MAX_PHRASE_LEN) return { phrase: '', rest: trimmed, delimiter: null }; // חריגה במגבלת האורך
  const phrase = trimmed.slice(0, phraseEnd);
  // אין מפריד נוסף בתוך הביטוי (מלבד המפריד שבקצהו) — כמו [^.\-–—]{1,80}
  for (const delim of DIBBUR_DELIMITERS) {
    const inner = phrase.slice(0, phrase.length - firstDelim.length);
    if (delim !== firstDelim && inner.includes(delim)) return { phrase: '', rest: trimmed, delimiter: null };
    if (delim === firstDelim && inner.includes(delim)) return { phrase: '', rest: trimmed, delimiter: null };
  }
  return { phrase, rest: trimmed.slice(phraseEnd).trim(), delimiter: firstDelim };
}

/**
 * סדר ה-wrappers הקנוני במודל (§10.2: "סדר wrappers אחד ויחיד… לא CSS מקרי"):
 * דיבור-המתחיל חיצוני, מילה-ראשונה פנימית — הסדר ההיסטורי (הדיבור עוטף את
 * החלון). נצרך על-ידי שכבת המדידה/ה-IR; הרנדרר אינו קובע סדר.
 */
export const FIRST_WORD_WRAP_ORDER: readonly ['dibbur', 'first-word'] = Object.freeze(['dibbur', 'first-word']);
