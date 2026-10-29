# השוואת תוכנות עימוד — בחירות

**תאריך ייצוא:** 29.10.2026, 14:33:07

## סיכום

- סך פריטים: 99
- מסומנים: 71
- בחירה באנחנו: 15
- בחירה ב-IMUD: 56

---

## 1. מזהי טקסט — כותרות

| תכונה | סוג | בחירה | אנחנו | IMUD | הערה |
|---|---|---|---|---|---|
| H0 (כותרת ראשית) | DIFF | ✅ IMUD | Frank Ruhl Libre 17pt | AlphaBlack 26pt | גופן וגודל שונים |
| H1 (כותרת חלק) |  | ✅ IMUD | Lia Sgula 50pt, sub_shaar | Lia Sgula 50pt, sub_shaar | זהה |
| H2 (כותרת פרק) | DIFF | ⬜ | AAd_AlphaBlack 17pt | AlphaBlack 17pt | שם גופן מלא vs מקוצר |
| H3 (כותרת סעיף) | DIFF | ✅ IMUD | AlphaLight 13.5pt | Alpha 13.5pt | משקל שונה (Light vs Regular) |
| H4 (תת-סעיף) | DIFF | ✅ IMUD | FrankRuehl 12.5pt | Alpha 12.5pt | גופן שונה |
| H5 (תת-תת-סעיף) | DIFF | ✅ IMUD | David 11.5pt | AlphaLight 11.5pt | גופן שונה |
| H6 (כותרת זוטרית) |  | ✅ IMUD | Noto Serif 10.5pt | Noto Serif 10.5pt | זהה |
| H7 (הערת צד) |  | ✅ IMUD | Hadassah 6pt, side_note | Hadassah 6pt, side_note | זהה |

## 2. מזהי טקסט — גוף וטיפוגרפיה

| תכונה | סוג | בחירה | אנחנו | IMUD | הערה |
|---|---|---|---|---|---|
| גופן גוף |  | ✅ IMUD | Frank Ruhl Libre 12pt, line-height 1.34 | Guttman Rashi / Frank Ruhl 12pt, line-height 1.34 | כמעט זהה |
| drop word mode | DIFF | ⬜ | sunken | window | מצב שונה — IMUD משתמש ב-window |
| drop word count |  | ⬜ | 1 | 1 | זהה |
| drop word min-lines | DIFF | ⬜ | 3 | 2 | אצלנו 3, אצלם 2 |
| דיבור המתחיל (auto-dh) | DIFF | ✅ IMUD | enabled: true (מופעל) | false (כבוי) | הפוך — אצלנו מופעל, אצלם כבוי |
| paren font | CRITICAL | ✅ IMUD | (אין) | f-paren (גופן מותאם) | חסר — אין גופן מותאם לסוגריים |

## 3. מזהי טקסט — הערות

| תכונה | סוג | בחירה | אנחנו | IMUD | הערה |
|---|---|---|---|---|---|
| delimiters |  | ⬜ | [ ] | [ ] | זהה |
| numbering |  | ⬜ | hebrew-letters | gematria | זהה (שניהם גימטריה) |
| marker type |  | ⬜ | superscript | super | זהה |
| marker size |  | ⬜ | 8 | 8 | זהה |
| note body size | CRITICAL | ✅ IMUD | (לא מוגדר) | 9pt | חסר — אין גודל גופן לגוף ההערה |
| fn-columns |  | ⬜ | 1 | 1 | זהה |
| fn-layout-mode | CRITICAL | ✅ IMUD | (אין) | block | חסר — אין מצב פריסת הערות |
| fn-reset-mode | DIFF | ✅ אנחנו | counterReset: siman | page | שונה — אצלנו siman, אצלם page |
| note-rule-style | DIFF | ✅ IMUD | short-right-30 | star | שונה — סגנון קו הערה |
| note-num-separator | CRITICAL | ✅ IMUD | (אין) | '.' | חסר — מפריד בין מספר לטקסט |
| endnote prefix |  | ⬜ | הערת סיום - | הערת סיום - | זהה |

## 4. חלוקת עמוד (grid)

| תכונה | סוג | בחירה | אנחנו | IMUD | הערה |
|---|---|---|---|---|---|
| columnWidth |  | ⬜ | 40 | 40 | זהה |
| marginWidth | DIFF | ✅ IMUD | 10 | 7.5 | אצלנו רחב יותר |
| gutterWidth |  | ⬜ | 2 | 2 | זהה |
| interColumnGap | DIFF | ✅ IMUD | 0 | 2 | אצלנו 0, אצלם 2 |
| topMargin | DIFF | ✅ IMUD | 10 | 20 | אצלנו קטן יותר |
| bottomMargin | DIFF | ✅ IMUD | 10 | 20 | אצלנו קטן יותר |
| h2TopMargin | DIFF | ✅ IMUD | 30 | 20 | אצלנו גדול יותר |
| h2-top-distance | CRITICAL | ✅ IMUD | (אין) | 22% | חסר — מרחק H2 מראש העמוד |
| col-divider-style |  | ⬜ | none | none | זהה |

## 5. מספור עמודים

| תכונה | סוג | בחירה | אנחנו | IMUD | הערה |
|---|---|---|---|---|---|
| position |  | ⬜ | bottom-center | bottom_center | זהה |
| format |  | ⬜ | hebrew-letter | gematria | זהה |
| frame |  | ⬜ | none | none | זהה |
| start-idx |  | ⬜ | 1 | 1 | זהה |
| page-num-initial-value | CRITICAL | ✅ IMUD | (אין — תמיד מתחיל מ-1) | 1 (ניתן לשנות) | חסר — אי אפשר להתחיל מעמוד שאינו 1 |
| shaar-count-numbering | CRITICAL | ✅ IMUD | (אין) | false/true לכל shaar | חסר — מספור עמודי שער |

## 6. שערים (Shaar)

| תכונה | סוג | בחירה | אנחנו | IMUD | הערה |
|---|---|---|---|---|---|
| show-main-shaar | DIFF | ✅ IMUD | אוטומטי אם יש metadata | true (מפורש) | אצלם מפורש, אצלנו אוטומטי |
| show-back-shaar | DIFF | ✅ IMUD | אם יש copyright | true | אצלם מפורש |
| show-sub-shaar |  | ⬜ | theme.showSubShaar: true | true | זהה |
| shaar builder | CRITICAL | ✅ IMUD | (אין — SVG מלא בלבד) | SVG מותאם + top/bottom/right/left | חסר — אין מיקום מדויק של שדות |
| shaar-count-numbering | CRITICAL | ✅ IMUD | (אין) | false/true לכל shaar | חסר — מספור ייעודי |
| shaar-main-divider | CRITICAL | ✅ IMUD | (אין) | none (אפשרי) | חסר — מפריד שער ראשי |
| shaar-sub-divider | CRITICAL | ✅ IMUD | (אין) | none (אפשרי) | חסר — מפריד שער משנה |

## 7. עיטורים (Ornaments)

| תכונה | סוג | בחירה | אנחנו | IMUD | הערה |
|---|---|---|---|---|---|
| h2-ornament-set | CRITICAL | ✅ IMUD | matchH2WidthToText: false (flag אחד) | none + style/dim מלאים (סטים, סגנונות) | חסר — מערכת מלאה במקום flag |
| h2-top-style | CRITICAL | ✅ IMUD | (אין) | none + dim 65%/1.25em | חסר — עיטור עליון של H2 |
| h2-bottom-style | CRITICAL | ✅ IMUD | (אין) | none + dim 65%/1.25em | חסר — עיטור תחתון של H2 |
| h2-title-orn-mode | CRITICAL | ✅ IMUD | (אין) | none + R/L styles | חסר — עיטור צידי לכותרת H2 |
| h2-title-side | CRITICAL | ✅ IMUD | (אין) | none + dim 20px/1.1em | חסר — עיטור צדדי לכותרת |
| h3-ornament-set | CRITICAL | ✅ IMUD | (אין לגמרי) | none + R/L + dim 50px/1em | חסר — מערכת עיטורי H3 |
| note-header-orn-r/l | CRITICAL | ✅ IMUD | (אין) | none + dim 40px/0.9em | חסר — עיטורי כותרת הערה |
| h2-orn-fit-text |  | ⬜ | matchH2WidthToText: false | h2-orn-fit-text: false | זהה |

## 8. רקעים (Backgrounds)

| תכונה | סוג | בחירה | אנחנו | IMUD | הערה |
|---|---|---|---|---|---|
| cbg-regular-mode | CRITICAL | ✅ IMUD | (אין לגמרי) | none + color #f4f1e8 + opacity 15 | חסר — רקע עמוד רגיל |
| cbg-h0Open-mode | CRITICAL | ✅ IMUD | (אין) | none + color + opacity | חסר — רקע עמוד פתיחת H0 |
| cbg-h2Open-mode | CRITICAL | ✅ IMUD | (אין) | none + color + opacity | חסר — רקע עמוד פתיחת H2 |
| data-cbg-*-img (תמונות רקע) | CRITICAL | ✅ IMUD | (אין תמיכה) | "" (תמיכה בתמונות) | חסר — תמיכה בתמונות רקע |

## 9. מפרידים (Dividers)

| תכונה | סוג | בחירה | אנחנו | IMUD | הערה |
|---|---|---|---|---|---|
| section-divider-style | CRITICAL | ✅ IMUD | (אין) | spear + dim 50%/28px | חסר — מפריד חלקים מתקדם |
| data-sec-div-img | CRITICAL | ✅ IMUD | (אין) | "" (תמיכה בתמונה) | חסר — תמונה למפריד |
| col-divider-style |  | ⬜ | none | none | זהה |
| heading-divider-h3 | CRITICAL | ✅ IMUD | (אין) | none (אפשרי) | חסר — מפריד כותרת H3 |
| heading-divider-h4–h6 | CRITICAL | ✅ IMUD | (אין) | none (אפשרי) | חסר — מפרידי כותרות H4-H6 |

## 10. כותרות עליונות (Running Headers)

| תכונה | סוג | בחירה | אנחנו | IMUD | הערה |
|---|---|---|---|---|---|
| distinct even/odd |  | ⬜ | alternating: true | hdr-distinct-even-odd: true | זהה |
| hdr-alternating | DIFF | ✅ IMUD | true (מתחלפות) | false (לא מתחלפות) | הפוך! אצלנו מתחלפות |
| hdr-title-split |  | ⬜ | halfHalfBookName: false | false | זהה |
| verso-r-type | DIFF | ✅ IMUD | book-name (פשוט) | book_title_split_r (חצוי) | שונה — חצוי vs פשוט |
| verso-r-align | DIFF | ✅ IMUD | right | center | שונה — יישור שונה |
| verso-c-type | DIFF | ✅ אנחנו | chapter-name | h1 (כותרת חלק) | שונה — chapter-name vs h1 |
| hdr-widths | DIFF | ✅ IMUD | 40/20/40 | 33/33/33 | שונה — חלוקת רוחב |
| hdr-divider-style | CRITICAL | ✅ IMUD | (אין) | gray | חסר — סגנון קו מפריד |
| hdr-* גופנים | CRITICAL | ✅ IMUD | (אין גופנים מפורשים) | Livorna (מפורש) | חסר — אין גופנים ייעודיים |

## 11. תוכן עניינים (TOC)

| תכונה | סוג | בחירה | אנחנו | IMUD | הערה |
|---|---|---|---|---|---|
| general-toc |  | ⬜ | generalLevels: [1,2,3,4,5,6] | enable-general-toc: true | זהה |
| detailed-toc |  | ⬜ | detailedLevels: [2,3,4,5,6] | enable-detailed-toc: true | זהה |
| TOC fonts by level | CRITICAL | ✅ IMUD | fontsByLevel: {} (ריק) | 7 רמות עם גופנים וגדלים מפורשים | חסר — אין הגדרת גופן לכל רמה |
| detailed TOC fonts | CRITICAL | ✅ IMUD | (אין) | 7 רמות (f-dtoc-1..7) | חסר — גופנים ל-TOC מפורט |
| toc-count-numbering |  | ⬜ | countNumbering: true | true | זהה |

## 12. איכות אוטומטית (Quality)

| תכונה | סוג | בחירה | אנחנו | IMUD | הערה |
|---|---|---|---|---|---|
| aq-enabled | DIFF | ⬜ | quality.prevent* (מערכת אחרת) | aq-enabled: true | שונה — מערכות שונות |
| aq-word-spacing | CRITICAL | ✅ IMUD | (אין) | true, min 0.95, max 1.05 | חסר — בדיקת ריווח מילים |
| aq-para-spacing | CRITICAL | ✅ IMUD | (אין) | true, max 9 | חסר — בדיקת ריווח פסקאות |
| aq-line-height | CRITICAL | ✅ IMUD | (אין) | true, max 3 | חסר — בדיקת גובה שורה |
| aq-shared-load | CRITICAL | ✅ IMUD | (אין) | true | חסר — טעינה שיתופית |
| avoid-orphans |  | ⬜ | preventOrphan: true | true | זהה |
| avoid-widows |  | ⬜ | preventWidow: true | true | זהה |
| avoid-runt-word | CRITICAL | ✅ IMUD | (אין) | true | חסר — מניעת runt (שורה אחרונה דלילה) |

## 13. תכונות שיש רק אצלנו (STRONG)

| תכונה | סוג | בחירה | אנחנו | IMUD | הערה |
|---|---|---|---|---|---|
| strictness mode | STRONG | ✅ אנחנו | normal / strict | (אין) | שליטה בסף widow/orphan |
| balanceChapterEnd | STRONG | ✅ אנחנו | true | (אין) | איזון מותאם לסוף פרק |
| preventOverflow | STRONG | ✅ אנחנו | true (מפורש) | (אין מפורש) | מניעת overflow מפורשת |
| preventHangingHeadings | STRONG | ✅ אנחנו | true (מפורש) | (אין מפורש) | מניעת כותרת תלויה מפורשת |
| trace-logger | STRONG | ✅ אנחנו | TraceLogger class | (אין) | יומן החלטות עימוד לדיבאג |
| trace-store | STRONG | ✅ אנחנו | Zustand store | (אין) | Store ל-trace events |
| input-declaration | STRONG | ✅ אנחנו | combined hash (text+settings+fonts+cssVars) | (אין) | מנגנון הגנה נגד אי-דטרמיניזם |
| paren-protector | STRONG | ✅ אנחנו | protectParens() | (אין) | מונע חיתוך באמצע [סוגריים] |
| text-completeness audit | STRONG | ✅ אנחנו | checkTextCompleteness() | (אין) | וידוא שמילים מהמקור לא אבדו (CRITICAL) |
| heading-escort audit | STRONG | ✅ אנחנו | checkHeadingEscort() | (אין) | בדיקת כותרת עם <2 שורות אחריה |
| page-underfill audit | STRONG | ✅ אנחנו | checkPageUnderfill() | (אין) | בדיקת עמוד לא מלא |
| block-gap audit | STRONG | ✅ אנחנו | checkBlockGap() | (אין) | בדיקת ריווח גדול בין בלוקים |
| multiple-blocks audit | STRONG | ✅ אנחנו | checkMultipleBlocks() | (אין) | בדיקת שני טורים עמוסים |

