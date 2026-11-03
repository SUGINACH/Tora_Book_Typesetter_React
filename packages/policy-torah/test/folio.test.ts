/**
 * folio.test.ts — בדיקות שלב 67: כותרות רצות, פוליו וגימטריה
 * (אפיון §10.1, §11.1, §16; פרק ח/M7 — שער הפרק).
 *
 * מבחני החובה: same_as_even ו-hdr-h1-title-mode; מספור התחלתי; גימטריה.
 */
import { describe, expect, test } from 'vitest';
import {
  gematriaOf,
  gematriaWithGereshOf,
  folioPolicyOf,
  folioLabelOf,
  runningHeadPolicyOf,
  runningHeadOf,
  type RunningHeadContext,
} from '../src/index.js';
import type { EffectiveSettings } from '@tora/layout-api';

const mkSettings = (values: Record<string, unknown> = {}): EffectiveSettings =>
  ({ schemaVersion: 1, enginePolicyId: 'torah-v1', values, configHash: 'test' });

describe('שלב 67 — גימטריה (domain formatter; לא Intl)', () => {
  test('האלגוריתם ההיסטורי: אותיות, עשרות, מאות; טו/טז; תחום 1..999', () => {
    expect(gematriaOf(1)).toBe('א');
    expect(gematriaOf(2)).toBe('ב');
    expect(gematriaOf(9)).toBe('ט');
    expect(gematriaOf(10)).toBe('י');
    expect(gematriaOf(11)).toBe('יא');
    expect(gematriaOf(14)).toBe('יד');
    expect(gematriaOf(15)).toBe('טו'); // לא יה
    expect(gematriaOf(16)).toBe('טז'); // לא יו
    expect(gematriaOf(17)).toBe('יז');
    expect(gematriaOf(20)).toBe('כ');
    expect(gematriaOf(42)).toBe('מב');
    expect(gematriaOf(100)).toBe('ק');
    expect(gematriaOf(101)).toBe('קא');
    expect(gematriaOf(200)).toBe('ר');
    expect(gematriaOf(275)).toBe('רעה');
    expect(gematriaOf(400)).toBe('ת');
    expect(gematriaOf(500)).toBe('תק');
    expect(gematriaOf(900)).toBe('תתק');
    expect(gematriaOf(999)).toBe('תתקצט');
    // מחוץ לתחום — ריק (דטרמיניסטי)
    expect(gematriaOf(0)).toBe('');
    expect(gematriaOf(-3)).toBe('');
    expect(gematriaOf(1000)).toBe('');
    expect(gematriaOf(3.5)).toBe('');
  });

  test('גרשיים: אות בודדת ⇒ גרש; רבות ⇒ גרשיים לפני האחרונה', () => {
    expect(gematriaWithGereshOf(1)).toBe("א'");
    expect(gematriaWithGereshOf(15)).toBe('ט"ו'); // שתי אותיות — גרשיים לפני האחרונה
    expect(gematriaWithGereshOf(16)).toBe('ט"ז');
    expect(gematriaWithGereshOf(42)).toBe('מ"ב');
    expect(gematriaWithGereshOf(0)).toBe('');
  });

  test('דטרמיניסטי — לא Intl (אותה תוצאה בכל ריצה ובכל host)', () => {
    for (let n = 1; n <= 999; n++) expect(gematriaOf(n)).toBe(gematriaOf(n));
  });
});

describe('שלב 67 — פוליו ומספור (§11.1)', () => {
  test('המדיניות מההגדרות: גימטריה ברירת מחדל (Orange); מספר התחלתי; numbers', () => {
    expect(folioPolicyOf(mkSettings())).toEqual({ format: 'gematria', initialValue: 1 });
    expect(folioPolicyOf(mkSettings({ 'page-num-format': 'numbers', 'page-num-initial-value': '5' })))
      .toEqual({ format: 'numbers', initialValue: 5 });
    // ערכים פסולים ⇒ ברירות נעולות
    expect(folioPolicyOf(mkSettings({ 'page-num-initial-value': 'banana' })).initialValue).toBe(1);
  });

  test('מספור התחלתי (מבחן חובה): initial=5 ⇒ עמוד 1 = ה; מודל פיזי/לוגי', () => {
    const p = folioPolicyOf(mkSettings({ 'page-num-initial-value': '5' }));
    expect(folioLabelOf(1, 'body', p)).toEqual({ logical: 5, printed: 'ה' });
    expect(folioLabelOf(2, 'body', p)).toEqual({ logical: 6, printed: 'ו' });
    expect(folioLabelOf(11, 'body', p)).toEqual({ logical: 15, printed: 'טו' });
    const nums = folioPolicyOf(mkSettings({ 'page-num-format': 'numbers', 'page-num-initial-value': '5' }));
    expect(folioLabelOf(1, 'body', nums)).toEqual({ logical: 5, printed: '5' });
  });

  test('שערים לא ממוספרים: printed=null לשלושת סוגי השער; הלוגי ממשיך', () => {
    const p = folioPolicyOf(mkSettings());
    for (const kind of ['main-shaar', 'back-shaar', 'sub-shaar']) {
      expect(folioLabelOf(3, kind, p).printed).toBeNull();
    }
    expect(folioLabelOf(3, 'sub-shaar', p).logical).toBe(3); // הלוגי נספר גם בשער
    expect(folioLabelOf(3, 'body', p).printed).toBe('ג');
  });
});

describe('שלב 67 — כותרות רצות (§11.1; נבנות מהעוגנים)', () => {
  const ctx: RunningHeadContext = {
    bookTitle: 'שולחן ערוך',
    currentH1Title: 'חלק א - אורח חיים',
    currentH2Title: 'הלכות נטילת ידיים',
  };

  test('ברירות Orange: distinctEvenOdd; book_title_split_r/l בצדדים; h2_without_siman במרכז', () => {
    const p = runningHeadPolicyOf(mkSettings());
    expect(p.distinctEvenOdd).toBe(true);
    expect(p.h1TitleMode).toBe('full');
    expect(p.recto.right).toBe('book_title_split_r');
    expect(p.recto.center).toBe('h2_without_siman');
    expect(p.recto.left).toBe('book_title_split_l');
    const head = runningHeadOf(1, ctx, p);
    expect(head.right).toBe('שולחן'); // החצי הראשון (8 תווים ⇒ 4 ראשונים)
    expect(head.left).toBe('ערוך');
    expect(head.center).toBe('הלכות נטילת ידיים');
  });

  test('hdr-h1-title-mode (מבחן חובה): full מול primary (פיצול כותרת שלב 60)', () => {
    const full = runningHeadPolicyOf(mkSettings({ 'hdr-l-type': 'h1_full' }));
    expect(runningHeadOf(1, ctx, full).left).toBe('חלק א - אורח חיים');
    const primary = runningHeadPolicyOf(mkSettings({ 'hdr-l-type': 'h1_primary' }));
    expect(runningHeadOf(1, ctx, primary).left).toBe('חלק א'); // עד המקף
  });

  test('parity: recto מול verso כש-distinctEvenOdd; same_as_even — הקורא משתמש בתוצאת ה-recto', () => {
    const distinct = runningHeadPolicyOf(mkSettings({
      'hdr-r-type': 'h1_full',
      'hdr-r-even-type': 'book_title',
    }));
    expect(distinct.distinctEvenOdd).toBe(true);
    expect(runningHeadOf(1, ctx, distinct).right).toBe('חלק א - אורח חיים'); // recto
    expect(runningHeadOf(2, ctx, distinct).right).toBe('שולחן ערוך'); // verso — סוג שונה
    // same_as_even: distinctEvenOdd=false ⇒ verso זהה ל-recto (התבניות מתעדות sameAs)
    const same = runningHeadPolicyOf(mkSettings({ 'hdr-distinct-even-odd': false, 'hdr-r-type': 'h1_full' }));
    expect(runningHeadOf(1, ctx, same).right).toBe(runningHeadOf(2, ctx, same).right);
  });

  test('custom/none; טהור ודטרמיניסטי', () => {
    const p = runningHeadPolicyOf(mkSettings({ 'hdr-c-type': 'custom', 'hdr-c-custom': 'ספרי הרב', 'hdr-r-type': 'none' }));
    expect(runningHeadOf(5, ctx, p).center).toBe('ספרי הרב');
    expect(runningHeadOf(5, ctx, p).right).toBe('');
    expect(runningHeadOf(5, ctx, p)).toEqual(runningHeadOf(5, ctx, p));
  });
});
