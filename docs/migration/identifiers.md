# מרשם מזהי הטקסט ותוחמי הקלט — הישן → חדש (שלב 17)

**מקור הסמכות:** `docs/migration/identifiers.json` (מוקפא, machine-readable) — מסמך זה מופק ממנו בלבד.
**הפקה:** `node scripts/migration/gen-identifier-registry.mjs` · אין לערוך ידנית.
**הוקפא:** 2026-11-01 · **רשומות:** 38 · אפיון §3.3 (שימור צנרת הפרסר) · §6.2 (אין sentinel, provenance) · §7 (צנרת) · §18-M2 · תכנית 100 השלבים, שלב 17

**מטרה:** תאימות קלט מושלמת ומוכחת מול מקור מלא — אותו קובץ טקסט ישן ייפרסר לאותם בלוקים, כותרות, הערות, סגנונות ו־metadata, בלי placeholder חצי־סמנטי ובלי אטום אבוד.

## סדר הסריקה והקדימויות

סדר הצינור הישן (React lock `src/parser/index.ts`) נשמר במדויק:

1. metadata (לפני הכותרת הראשונה בלבד)
2. editorial pre-pass (תוכן כל שורה)
3. sidenote H7 (שורה שלמה)
4. endnote prefix (שורה שלמה)
5. footnote brackets (inline על הטקסט המחובר שנותר)
6. custom linePrefix (שורה)
7. heading (שורה)
8. paragraph assembly (AST)

- **לפי שורה:** metadata-key(10) → sidenote-h7(20) → endnote-prefix(30) → custom-style-linePrefix(40) → heading-line(50) → paragraph(90)
- **בתוך שורה:** editorial-notes(5, קדם-מעבר) → footnote-brackets(60) → custom-style-inlineMarker(61)
- **כלל הכרעה:** סדר הצינור הישן נשמר במדויק: מי שמוקדם בצינור גובר; בתוך שלב הסגנונות — ההגדרה המופעלת הראשונה בסדר המערך זוכה

## היקף הסריקה

סריקה שיטתית של כל קובצי הפרסר, הטוקנייזר והמבחנים בשבעת המקורות הנעולים; ההשוואה למקור קובעת שהמרשם מלא (סורק הכיסוי במאמת).

| מקור נעול | תפקיד בסריקה | קבצים |
|---|---|---|
| React | הפרסר המופורט (TypeScript) — סמכות התחביר | `src/parser/*.ts, src/types/*.ts, tests/unit/parser/parser.test.ts (מוחזק ב־packages/test-fixtures/legacy/react-lock)` |
| Orange | הבייסליין — טוקנייזר שורות בדפדפן + מדיניות תצוגה | `typesetter.js, app.js, index.html` |
| Yellow | וריאנט מנוע — אותו טוקנייזר | `typesetter.js` |
| Gold | וריאנט מנוע — אותו טוקנייזר | `typesetter.js` |
| Green | וריאנט מנוע — אותו טוקנייזר | `typesetter.js` |
| IMUD_TORANI | מפרט הקלט §7–§8 | `shared/specs/Software_specification.md` |
| Typesetter_doc | חוזה מוצר — ללא תחביר קלט נוסף | `—` |

## רשומות המרשם

### כללי בלוק (מבנה הקלט)

#### `metadata-block`

- **מזהה בישן:** פתח הספר — שורות metadata לפני הכותרת הראשונה; שורה ריקה אחרי הפתיח סוגרת את הבלוק
- **סטטוס:** active-input · **זרם:** metadata · **קדימות:** 10
- **מיפוי:** TorahDocument.metadata: MetadataEntry[] — ערך עם SourceSpan בזרם metadata; המפתח והתוחם — syntax spans
- **fixture:** `packages/test-fixtures/corpus/identifiers/ident-metadata-block.txt`
- **מקורות:**
  - React @ 0c7b9927 · `src/parser/metadata-parser.ts` שורות 22-58 · sha256 `01b4724aab095808…`
  - React @ 0c7b9927 · `src/parser/index.ts` שורות 19-21 · sha256 `ea37fdefae7a3a57…`
  - IMUD_TORANI @ 706ba955 · `shared/specs/Software_specification.md` שורות 401-421 · sha256 `3c4b6e75cbe680df…`
  - Orange @ 93ad1e57 · `typesetter.js` שורות 749-809 · sha256 `e5fe969a9d487ebd…`
- **מקרי קצה:**
  - **שורה שאינה metadata ואינה כותרת לפני הכותרת הראשונה** — ישן: React: השורה נזרקת בשקט מהגוף (parseMetadata מסיר את כל השורות עד הכותרת) · חדש: השורה נשמרת כבלוק גוף — אין אטום אבוד (§6.2); הבדל מתועד · החלטה: new: preserve
  - **שורות ריקות בין ה-metadata לכותרת הראשונה** — ישן: נמחקות (endIdx walk-back) — אין בהן תוכן · חדש: נחשבות מפרידי־פסקה (syntax) — זהות סמנטית · החלטה: equivalent
  - **שורת metadata אחרי הכותרת הראשונה** — ישן: React: לא מזוהה (נשארת תוכן); Orange: parseMetadataFromText מפרסר את כל הטקסט ומסיר שורות metadata בכל מקום · חדש: לפני הכותרת הראשונה בלבד — כאפיון §7.6 וכהוראת התכנית; הבדל Orange מתועד · החלטה: React + spec §7.6
  - **מפתח metadata כפול (אותו מפתח פעמיים לפני הכותרת)** — ישן: React: הערך האחרון דורס את הקודם (מיפוי לפי שדה) · חדש: נדחה: errors.parser.DUPLICATE_METADATA_KEY — המסמך מאומת ללא מפתחות כפולים (שלב 16) · החלטה: new: reject

#### `paragraph-separator`

- **מזהה בישן:** שורה ריקה (אחרי ניקוי הערות עריכה) מפרידה פסקאות
- **סטטוס:** active-input · **זרם:** body · **קדימות:** 90
- **הערת תחביר:** מופיע בתיעוד editorial-note-parser הישן: 'שורות ריקות מפרידות פסקאות ב-AST builder'
- **מיפוי:** חלוקת ContentBlock לפסקאות — השורות הריקות — syntax spans (מפרידים); אין אטום אבוד
- **fixture:** `packages/test-fixtures/corpus/identifiers/ident-paragraph-separator.txt`
- **מקורות:**
  - React @ 0c7b9927 · `src/parser/ast-builder.ts` שורות 45-51 · sha256 `63e554961295eb72…`
  - React @ 0c7b9927 · `src/parser/editorial-note-parser.ts` שורות 8-10 · sha256 `c20d249576faa30f…`
  - Orange @ 93ad1e57 · `typesetter.js` שורות 4056-4059 · sha256 `e5fe969a9d487ebd…`
- **מקרי קצה:**
  - **שורה שהתרוקנה מהערת עורך** — ישן: מפריד פסקאות (השוואה אחרי ההסרה) · חדש: זהה — השורה מסומנת ריקה לאחר ניקוי · החלטה: equivalent
  - **שורות ריקות עוקבות** — ישן: מתפקדות כמפריד אחד (flushParagraph מרוקן מערך ריק) · חדש: זהה · החלטה: equivalent

#### `line-join`

- **מזהה בישן:** שורות רצופות לא-ריקות מתאחדות לפסקה אחת בחיבור רווח בודד
- **סטטוס:** active-input · **זרם:** body · **קדימות:** 91
- **הערת תחביר:** ast-builder ישן: ‎currentParagraph.join(' ')‎ — הרווח מוחדר על ידי הפרסר, אינו במקור
- **מיפוי:** ContentBlock {role:'body'} עם אטומי החדרה — הרווח המוחדר הוא אטום בעל פרוסה ריקה עם origin='parser:paragraph-join' (שלב 15); לא נעלם בכיסוי
- **fixture:** `packages/test-fixtures/corpus/identifiers/ident-line-join.txt`
- **מקורות:**
  - React @ 0c7b9927 · `src/parser/ast-builder.ts` שורות 25-43, 98-100 · sha256 `63e554961295eb72…`
- **מקרי קצה:**
  - **שלוש שורות רצופות** — ישן: פסקה אחת: שורה1 שורה2 שורה3 (רווח בודד בין כל שתיים) · חדש: זהה — אטום רווח מוחדר עם origin מפורש לכל חיבור; ה\n — syntax span · החלטה: equivalent
  - **סוף מסמך בלי שורה ריקה** — ישן: flushParagraph בסוף — הפסקה האחרונה נסגרת · חדש: זהה · החלטה: equivalent

### מזהי שורה

#### `metadata-key:שם הספר`

- **מזהה בישן:** שם הספר - <ערך>
- **סטטוס:** active-input · **זרם:** metadata · **קדימות:** 11
- **תחביר:** `^שם הספר\s*[-–—:]\s*(.+)$` (flags: i)
- **הערת תחביר:** תוחם: - – — : (איחוד React ‎[-:]‎ ו־Orange ‎[-–—:]‎); סיומת /<תווית> או \<תווית> לנושא/נושא מפורט/פרטי מהדורא (איחוד React ‎(?:\/.+)?‎ עם תוויות Orange)
- **מיפוי:** TorahDocument.metadata: MetadataEntry {key:'שם הספר', value, source} — LEGACY_METADATA_KEYS (שלב 16); מפתח נוסף מהמקור יתווסף כאן אוטומטית על ידי סורק הכיסוי
- **fixture:** `packages/test-fixtures/corpus/identifiers/ident-metadata-bookName.txt`
- **מקורות:**
  - React @ 0c7b9927 · `src/parser/metadata-parser.ts` שורות 3-14 · sha256 `01b4724aab095808…`
  - Orange @ 93ad1e57 · `typesetter.js` שורות 749-809 · sha256 `e5fe969a9d487ebd…`
  - React @ 0c7b9927 · `tests/unit/parser/parser.test.ts` שורות 151-182 · sha256 `c95bd0d8025919e4…`
  - IMUD_TORANI @ 706ba955 · `shared/specs/Software_specification.md` שורות 403-419 · sha256 `3c4b6e75cbe680df…`
- **מקרי קצה:**
  - **ערך ריק ("שם הספר -")** — ישן: React: אין התאמה (‎(.+)‎) — השורה נשארת תוכן; Orange: מזוהה עם ערך ריק ומוסרת · חדש: כ־React — אין התאמה; אין אטום אבוד · החלטה: React
  - **סיומת גרידית — התוחם שנבחר הוא האחרון האפשרי (backtracking של ‎.+‎)** — ישן: React: ‎נושא/א - ב - ג‎ ← ערך=ג · חדש: זהה (אותה תבנית גרידית) · החלטה: equivalent
  - **תוחם – או — (קו מתח/קו ארוך)** — ישן: React: לא מזוהה; Orange: מזוהה · חדש: מזוהה — איחוד Orange; הבדל מתועד · החלטה: union

#### `metadata-key:נושא`

- **מזהה בישן:** נושא - <ערך>
- **סטטוס:** active-input · **זרם:** metadata · **קדימות:** 11
- **תחביר:** `^נושא(?:[\/\\].+)?\s*[-–—:]\s*(.+)$` (flags: i)
- **הערת תחביר:** תוחם: - – — : (איחוד React ‎[-:]‎ ו־Orange ‎[-–—:]‎); סיומת /<תווית> או \<תווית> לנושא/נושא מפורט/פרטי מהדורא (איחוד React ‎(?:\/.+)?‎ עם תוויות Orange)
- **מיפוי:** TorahDocument.metadata: MetadataEntry {key:'נושא', value, source} — LEGACY_METADATA_KEYS (שלב 16); מפתח נוסף מהמקור יתווסף כאן אוטומטית על ידי סורק הכיסוי
- **fixture:** `packages/test-fixtures/corpus/identifiers/ident-metadata-subject.txt`
- **מקורות:**
  - React @ 0c7b9927 · `src/parser/metadata-parser.ts` שורות 3-14 · sha256 `01b4724aab095808…`
  - Orange @ 93ad1e57 · `typesetter.js` שורות 749-809 · sha256 `e5fe969a9d487ebd…`
  - React @ 0c7b9927 · `tests/unit/parser/parser.test.ts` שורות 151-182 · sha256 `c95bd0d8025919e4…`
  - IMUD_TORANI @ 706ba955 · `shared/specs/Software_specification.md` שורות 403-419 · sha256 `3c4b6e75cbe680df…`
- **מקרי קצה:**
  - **ערך ריק ("שם הספר -")** — ישן: React: אין התאמה (‎(.+)‎) — השורה נשארת תוכן; Orange: מזוהה עם ערך ריק ומוסרת · חדש: כ־React — אין התאמה; אין אטום אבוד · החלטה: React
  - **סיומת גרידית — התוחם שנבחר הוא האחרון האפשרי (backtracking של ‎.+‎)** — ישן: React: ‎נושא/א - ב - ג‎ ← ערך=ג · חדש: זהה (אותה תבנית גרידית) · החלטה: equivalent
  - **תוחם – או — (קו מתח/קו ארוך)** — ישן: React: לא מזוהה; Orange: מזוהה · חדש: מזוהה — איחוד Orange; הבדל מתועד · החלטה: union

#### `metadata-key:נושא מפורט`

- **מזהה בישן:** נושא מפורט - <ערך>
- **סטטוס:** active-input · **זרם:** metadata · **קדימות:** 11
- **תחביר:** `^נושא מפורט(?:[\/\\].+)?\s*[-–—:]\s*(.+)$` (flags: i)
- **הערת תחביר:** תוחם: - – — : (איחוד React ‎[-:]‎ ו־Orange ‎[-–—:]‎); סיומת /<תווית> או \<תווית> לנושא/נושא מפורט/פרטי מהדורא (איחוד React ‎(?:\/.+)?‎ עם תוויות Orange)
- **מיפוי:** TorahDocument.metadata: MetadataEntry {key:'נושא מפורט', value, source} — LEGACY_METADATA_KEYS (שלב 16); מפתח נוסף מהמקור יתווסף כאן אוטומטית על ידי סורק הכיסוי
- **fixture:** `packages/test-fixtures/corpus/identifiers/ident-metadata-detailedSubject.txt`
- **מקורות:**
  - React @ 0c7b9927 · `src/parser/metadata-parser.ts` שורות 3-14 · sha256 `01b4724aab095808…`
  - Orange @ 93ad1e57 · `typesetter.js` שורות 749-809 · sha256 `e5fe969a9d487ebd…`
  - React @ 0c7b9927 · `tests/unit/parser/parser.test.ts` שורות 151-182 · sha256 `c95bd0d8025919e4…`
  - IMUD_TORANI @ 706ba955 · `shared/specs/Software_specification.md` שורות 403-419 · sha256 `3c4b6e75cbe680df…`
- **מקרי קצה:**
  - **ערך ריק ("שם הספר -")** — ישן: React: אין התאמה (‎(.+)‎) — השורה נשארת תוכן; Orange: מזוהה עם ערך ריק ומוסרת · חדש: כ־React — אין התאמה; אין אטום אבוד · החלטה: React
  - **סיומת גרידית — התוחם שנבחר הוא האחרון האפשרי (backtracking של ‎.+‎)** — ישן: React: ‎נושא/א - ב - ג‎ ← ערך=ג · חדש: זהה (אותה תבנית גרידית) · החלטה: equivalent
  - **תוחם – או — (קו מתח/קו ארוך)** — ישן: React: לא מזוהה; Orange: מזוהה · חדש: מזוהה — איחוד Orange; הבדל מתועד · החלטה: union

#### `metadata-key:פרטי מהדורא`

- **מזהה בישן:** פרטי מהדורא - <ערך>
- **סטטוס:** active-input · **זרם:** metadata · **קדימות:** 11
- **תחביר:** `^פרטי מהדורא(?:[\/\\].+)?\s*[-–—:]\s*(.+)$` (flags: i)
- **הערת תחביר:** תוחם: - – — : (איחוד React ‎[-:]‎ ו־Orange ‎[-–—:]‎); סיומת /<תווית> או \<תווית> לנושא/נושא מפורט/פרטי מהדורא (איחוד React ‎(?:\/.+)?‎ עם תוויות Orange)
- **מיפוי:** TorahDocument.metadata: MetadataEntry {key:'פרטי מהדורא', value, source} — LEGACY_METADATA_KEYS (שלב 16); מפתח נוסף מהמקור יתווסף כאן אוטומטית על ידי סורק הכיסוי
- **fixture:** `packages/test-fixtures/corpus/identifiers/ident-metadata-editionDetails.txt`
- **מקורות:**
  - React @ 0c7b9927 · `src/parser/metadata-parser.ts` שורות 3-14 · sha256 `01b4724aab095808…`
  - Orange @ 93ad1e57 · `typesetter.js` שורות 749-809 · sha256 `e5fe969a9d487ebd…`
  - React @ 0c7b9927 · `tests/unit/parser/parser.test.ts` שורות 151-182 · sha256 `c95bd0d8025919e4…`
  - IMUD_TORANI @ 706ba955 · `shared/specs/Software_specification.md` שורות 403-419 · sha256 `3c4b6e75cbe680df…`
- **מקרי קצה:**
  - **ערך ריק ("שם הספר -")** — ישן: React: אין התאמה (‎(.+)‎) — השורה נשארת תוכן; Orange: מזוהה עם ערך ריק ומוסרת · חדש: כ־React — אין התאמה; אין אטום אבוד · החלטה: React
  - **סיומת גרידית — התוחם שנבחר הוא האחרון האפשרי (backtracking של ‎.+‎)** — ישן: React: ‎נושא/א - ב - ג‎ ← ערך=ג · חדש: זהה (אותה תבנית גרידית) · החלטה: equivalent
  - **תוחם – או — (קו מתח/קו ארוך)** — ישן: React: לא מזוהה; Orange: מזוהה · חדש: מזוהה — איחוד Orange; הבדל מתועד · החלטה: union

#### `metadata-key:שם המחבר`

- **מזהה בישן:** שם המחבר - <ערך>
- **סטטוס:** active-input · **זרם:** metadata · **קדימות:** 11
- **תחביר:** `^שם המחבר\s*[-–—:]\s*(.+)$` (flags: i)
- **הערת תחביר:** תוחם: - – — : (איחוד React ‎[-:]‎ ו־Orange ‎[-–—:]‎); סיומת /<תווית> או \<תווית> לנושא/נושא מפורט/פרטי מהדורא (איחוד React ‎(?:\/.+)?‎ עם תוויות Orange)
- **מיפוי:** TorahDocument.metadata: MetadataEntry {key:'שם המחבר', value, source} — LEGACY_METADATA_KEYS (שלב 16); מפתח נוסף מהמקור יתווסף כאן אוטומטית על ידי סורק הכיסוי
- **fixture:** `packages/test-fixtures/corpus/identifiers/ident-metadata-authorName.txt`
- **מקורות:**
  - React @ 0c7b9927 · `src/parser/metadata-parser.ts` שורות 3-14 · sha256 `01b4724aab095808…`
  - Orange @ 93ad1e57 · `typesetter.js` שורות 749-809 · sha256 `e5fe969a9d487ebd…`
  - React @ 0c7b9927 · `tests/unit/parser/parser.test.ts` שורות 151-182 · sha256 `c95bd0d8025919e4…`
  - IMUD_TORANI @ 706ba955 · `shared/specs/Software_specification.md` שורות 403-419 · sha256 `3c4b6e75cbe680df…`
- **מקרי קצה:**
  - **ערך ריק ("שם הספר -")** — ישן: React: אין התאמה (‎(.+)‎) — השורה נשארת תוכן; Orange: מזוהה עם ערך ריק ומוסרת · חדש: כ־React — אין התאמה; אין אטום אבוד · החלטה: React
  - **סיומת גרידית — התוחם שנבחר הוא האחרון האפשרי (backtracking של ‎.+‎)** — ישן: React: ‎נושא/א - ב - ג‎ ← ערך=ג · חדש: זהה (אותה תבנית גרידית) · החלטה: equivalent
  - **תוחם – או — (קו מתח/קו ארוך)** — ישן: React: לא מזוהה; Orange: מזוהה · חדש: מזוהה — איחוד Orange; הבדל מתועד · החלטה: union

#### `metadata-key:מקום ושנת הוצאה`

- **מזהה בישן:** מקום ושנת הוצאה - <ערך>
- **סטטוס:** active-input · **זרם:** metadata · **קדימות:** 11
- **תחביר:** `^מקום ושנת הוצאה\s*[-–—:]\s*(.+)$` (flags: i)
- **הערת תחביר:** תוחם: - – — : (איחוד React ‎[-:]‎ ו־Orange ‎[-–—:]‎); סיומת /<תווית> או \<תווית> לנושא/נושא מפורט/פרטי מהדורא (איחוד React ‎(?:\/.+)?‎ עם תוויות Orange)
- **מיפוי:** TorahDocument.metadata: MetadataEntry {key:'מקום ושנת הוצאה', value, source} — LEGACY_METADATA_KEYS (שלב 16); מפתח נוסף מהמקור יתווסף כאן אוטומטית על ידי סורק הכיסוי
- **fixture:** `packages/test-fixtures/corpus/identifiers/ident-metadata-placeAndYear.txt`
- **מקורות:**
  - React @ 0c7b9927 · `src/parser/metadata-parser.ts` שורות 3-14 · sha256 `01b4724aab095808…`
  - Orange @ 93ad1e57 · `typesetter.js` שורות 749-809 · sha256 `e5fe969a9d487ebd…`
  - React @ 0c7b9927 · `tests/unit/parser/parser.test.ts` שורות 151-182 · sha256 `c95bd0d8025919e4…`
  - IMUD_TORANI @ 706ba955 · `shared/specs/Software_specification.md` שורות 403-419 · sha256 `3c4b6e75cbe680df…`
- **מקרי קצה:**
  - **ערך ריק ("שם הספר -")** — ישן: React: אין התאמה (‎(.+)‎) — השורה נשארת תוכן; Orange: מזוהה עם ערך ריק ומוסרת · חדש: כ־React — אין התאמה; אין אטום אבוד · החלטה: React
  - **סיומת גרידית — התוחם שנבחר הוא האחרון האפשרי (backtracking של ‎.+‎)** — ישן: React: ‎נושא/א - ב - ג‎ ← ערך=ג · חדש: זהה (אותה תבנית גרידית) · החלטה: equivalent
  - **תוחם – או — (קו מתח/קו ארוך)** — ישן: React: לא מזוהה; Orange: מזוהה · חדש: מזוהה — איחוד Orange; הבדל מתועד · החלטה: union

#### `metadata-key:שמירת זכויות`

- **מזהה בישן:** שמירת זכויות - <ערך>
- **סטטוס:** active-input · **זרם:** metadata · **קדימות:** 11
- **תחביר:** `^שמירת זכויות\s*[-–—:]\s*(.+)$` (flags: i)
- **הערת תחביר:** תוחם: - – — : (איחוד React ‎[-:]‎ ו־Orange ‎[-–—:]‎); סיומת /<תווית> או \<תווית> לנושא/נושא מפורט/פרטי מהדורא (איחוד React ‎(?:\/.+)?‎ עם תוויות Orange)
- **מיפוי:** TorahDocument.metadata: MetadataEntry {key:'שמירת זכויות', value, source} — LEGACY_METADATA_KEYS (שלב 16); מפתח נוסף מהמקור יתווסף כאן אוטומטית על ידי סורק הכיסוי
- **fixture:** `packages/test-fixtures/corpus/identifiers/ident-metadata-copyright.txt`
- **מקורות:**
  - React @ 0c7b9927 · `src/parser/metadata-parser.ts` שורות 3-14 · sha256 `01b4724aab095808…`
  - Orange @ 93ad1e57 · `typesetter.js` שורות 749-809 · sha256 `e5fe969a9d487ebd…`
  - React @ 0c7b9927 · `tests/unit/parser/parser.test.ts` שורות 151-182 · sha256 `c95bd0d8025919e4…`
  - IMUD_TORANI @ 706ba955 · `shared/specs/Software_specification.md` שורות 403-419 · sha256 `3c4b6e75cbe680df…`
- **מקרי קצה:**
  - **ערך ריק ("שם הספר -")** — ישן: React: אין התאמה (‎(.+)‎) — השורה נשארת תוכן; Orange: מזוהה עם ערך ריק ומוסרת · חדש: כ־React — אין התאמה; אין אטום אבוד · החלטה: React
  - **סיומת גרידית — התוחם שנבחר הוא האחרון האפשרי (backtracking של ‎.+‎)** — ישן: React: ‎נושא/א - ב - ג‎ ← ערך=ג · חדש: זהה (אותה תבנית גרידית) · החלטה: equivalent
  - **תוחם – או — (קו מתח/קו ארוך)** — ישן: React: לא מזוהה; Orange: מזוהה · חדש: מזוהה — איחוד Orange; הבדל מתועד · החלטה: union

#### `metadata-key:פרטי הוצאה לאור`

- **מזהה בישן:** פרטי הוצאה לאור - <ערך>
- **סטטוס:** active-input · **זרם:** metadata · **קדימות:** 11
- **תחביר:** `^פרטי הוצאה לאור\s*[-–—:]\s*(.+)$` (flags: i)
- **הערת תחביר:** תוחם: - – — : (איחוד React ‎[-:]‎ ו־Orange ‎[-–—:]‎); סיומת /<תווית> או \<תווית> לנושא/נושא מפורט/פרטי מהדורא (איחוד React ‎(?:\/.+)?‎ עם תוויות Orange)
- **מיפוי:** TorahDocument.metadata: MetadataEntry {key:'פרטי הוצאה לאור', value, source} — LEGACY_METADATA_KEYS (שלב 16); מפתח נוסף מהמקור יתווסף כאן אוטומטית על ידי סורק הכיסוי
- **fixture:** `packages/test-fixtures/corpus/identifiers/ident-metadata-publisherDetails.txt`
- **מקורות:**
  - React @ 0c7b9927 · `src/parser/metadata-parser.ts` שורות 3-14 · sha256 `01b4724aab095808…`
  - Orange @ 93ad1e57 · `typesetter.js` שורות 749-809 · sha256 `e5fe969a9d487ebd…`
  - React @ 0c7b9927 · `tests/unit/parser/parser.test.ts` שורות 151-182 · sha256 `c95bd0d8025919e4…`
  - IMUD_TORANI @ 706ba955 · `shared/specs/Software_specification.md` שורות 403-419 · sha256 `3c4b6e75cbe680df…`
- **מקרי קצה:**
  - **ערך ריק ("שם הספר -")** — ישן: React: אין התאמה (‎(.+)‎) — השורה נשארת תוכן; Orange: מזוהה עם ערך ריק ומוסרת · חדש: כ־React — אין התאמה; אין אטום אבוד · החלטה: React
  - **סיומת גרידית — התוחם שנבחר הוא האחרון האפשרי (backtracking של ‎.+‎)** — ישן: React: ‎נושא/א - ב - ג‎ ← ערך=ג · חדש: זהה (אותה תבנית גרידית) · החלטה: equivalent
  - **תוחם – או — (קו מתח/קו ארוך)** — ישן: React: לא מזוהה; Orange: מזוהה · חדש: מזוהה — איחוד Orange; הבדל מתועד · החלטה: union

#### `metadata-key:פרטי קשר`

- **מזהה בישן:** פרטי קשר - <ערך>
- **סטטוס:** active-input · **זרם:** metadata · **קדימות:** 11
- **תחביר:** `^פרטי קשר\s*[-–—:]\s*(.+)$` (flags: i)
- **הערת תחביר:** תוחם: - – — : (איחוד React ‎[-:]‎ ו־Orange ‎[-–—:]‎); סיומת /<תווית> או \<תווית> לנושא/נושא מפורט/פרטי מהדורא (איחוד React ‎(?:\/.+)?‎ עם תוויות Orange)
- **מיפוי:** TorahDocument.metadata: MetadataEntry {key:'פרטי קשר', value, source} — LEGACY_METADATA_KEYS (שלב 16); מפתח נוסף מהמקור יתווסף כאן אוטומטית על ידי סורק הכיסוי
- **fixture:** `packages/test-fixtures/corpus/identifiers/ident-metadata-contactDetails.txt`
- **מקורות:**
  - React @ 0c7b9927 · `src/parser/metadata-parser.ts` שורות 3-14 · sha256 `01b4724aab095808…`
  - Orange @ 93ad1e57 · `typesetter.js` שורות 749-809 · sha256 `e5fe969a9d487ebd…`
  - React @ 0c7b9927 · `tests/unit/parser/parser.test.ts` שורות 151-182 · sha256 `c95bd0d8025919e4…`
  - IMUD_TORANI @ 706ba955 · `shared/specs/Software_specification.md` שורות 403-419 · sha256 `3c4b6e75cbe680df…`
- **מקרי קצה:**
  - **ערך ריק ("שם הספר -")** — ישן: React: אין התאמה (‎(.+)‎) — השורה נשארת תוכן; Orange: מזוהה עם ערך ריק ומוסרת · חדש: כ־React — אין התאמה; אין אטום אבוד · החלטה: React
  - **סיומת גרידית — התוחם שנבחר הוא האחרון האפשרי (backtracking של ‎.+‎)** — ישן: React: ‎נושא/א - ב - ג‎ ← ערך=ג · חדש: זהה (אותה תבנית גרידית) · החלטה: equivalent
  - **תוחם – או — (קו מתח/קו ארוך)** — ישן: React: לא מזוהה; Orange: מזוהה · חדש: מזוהה — איחוד Orange; הבדל מתועד · החלטה: union

#### `metadata-key:פרטים נוספים`

- **מזהה בישן:** פרטים נוספים - <ערך>
- **סטטוס:** active-input · **זרם:** metadata · **קדימות:** 11
- **תחביר:** `^פרטים נוספים\s*[-–—:]\s*(.+)$` (flags: i)
- **הערת תחביר:** תוחם: - – — : (איחוד React ‎[-:]‎ ו־Orange ‎[-–—:]‎); סיומת /<תווית> או \<תווית> לנושא/נושא מפורט/פרטי מהדורא (איחוד React ‎(?:\/.+)?‎ עם תוויות Orange)
- **מיפוי:** TorahDocument.metadata: MetadataEntry {key:'פרטים נוספים', value, source} — LEGACY_METADATA_KEYS (שלב 16); מפתח נוסף מהמקור יתווסף כאן אוטומטית על ידי סורק הכיסוי
- **fixture:** `packages/test-fixtures/corpus/identifiers/ident-metadata-additionalDetails.txt`
- **מקורות:**
  - React @ 0c7b9927 · `src/parser/metadata-parser.ts` שורות 3-14 · sha256 `01b4724aab095808…`
  - Orange @ 93ad1e57 · `typesetter.js` שורות 749-809 · sha256 `e5fe969a9d487ebd…`
  - React @ 0c7b9927 · `tests/unit/parser/parser.test.ts` שורות 151-182 · sha256 `c95bd0d8025919e4…`
  - IMUD_TORANI @ 706ba955 · `shared/specs/Software_specification.md` שורות 403-419 · sha256 `3c4b6e75cbe680df…`
- **מקרי קצה:**
  - **ערך ריק ("שם הספר -")** — ישן: React: אין התאמה (‎(.+)‎) — השורה נשארת תוכן; Orange: מזוהה עם ערך ריק ומוסרת · חדש: כ־React — אין התאמה; אין אטום אבוד · החלטה: React
  - **סיומת גרידית — התוחם שנבחר הוא האחרון האפשרי (backtracking של ‎.+‎)** — ישן: React: ‎נושא/א - ב - ג‎ ← ערך=ג · חדש: זהה (אותה תבנית גרידית) · החלטה: equivalent
  - **תוחם – או — (קו מתח/קו ארוך)** — ישן: React: לא מזוהה; Orange: מזוהה · חדש: מזוהה — איחוד Orange; הבדל מתועד · החלטה: union

#### `heading-line`

- **מזהה בישן:** כותרת <N> [מספר <X> [(<Y>)]] - <טקסט> (N=0–7)
- **סטטוס:** active-input · **זרם:** body · **קדימות:** 50
- **תחביר:** `^כותרת\s+(\d+)(?:\s+מספר\s+(\d+)(?:\s*\((\d+)\))?)?\s*[-–—]\s*(.+)$`
- **הערת תחביר:** נורמליזציה של ‎(?:\s*-\s*|\s*–\s*|\s*—\s*|\s*-\s*)‎ הישן ל־‎\s*[-–—]\s*‎ — שקולה לחלוטין. התבנית הגמישה נדרשת בפועל: 82 שורות 'כותרת 7 (מקור: …) - …' בקורפוס הקנוני שהבייסליין מזהה כהערות צד
- **מיפוי:** ContentBlock {role:'heading', headingLevel:0–7} — מזהה בלוק נגזר; הקידומת 'כותרת N [מספר X (Y)] - ' — syntax spans; הטקסט — אטומים
- **fixture:** `packages/test-fixtures/corpus/identifiers/ident-heading-line.txt`
- **מקורות:**
  - React @ 0c7b9927 · `src/parser/header-parser.ts` שורות 14-49 · sha256 `11319257376366ea…`
  - React @ 0c7b9927 · `src/parser/ast-builder.ts` שורות 45-74 · sha256 `63e554961295eb72…`
  - React @ 0c7b9927 · `tests/unit/parser/parser.test.ts` שורות 10-58 · sha256 `c95bd0d8025919e4…`
  - Orange @ 93ad1e57 · `typesetter.js` שורות 4053-4110 · sha256 `e5fe969a9d487ebd…`
  - Yellow @ 878535e1 · `typesetter.js` שורות 3051-3055 · sha256 `b2c772bbff07d88a…`
  - Green @ e5cde5f1 · `typesetter.js` שורות 4030-4034 · sha256 `f1fd6ff697acf106…`
  - Gold @ a444d34c · `typesetter.js` שורות 4143-4147 · sha256 `cb68b79163f0cae4…`
  - IMUD_TORANI @ 706ba955 · `shared/specs/Software_specification.md` שורות 333-352 · sha256 `3c4b6e75cbe680df…`
- **מקרי קצה:**
  - **רמה 8 ומעלה** — ישן: React: null — פסקה רגילה; Orange: מזוהה ככותרת (אין בדיקת גבול) · חדש: כ־React — פסקה + אזהרה ממוקמת (לא נבלע בשקט) · החלטה: React
  - **בלי מקף ("כותרת 3 טקסט")** — ישן: לא כותרת — פסקה בשקט (מבחן ישן מפורש) · חדש: פסקה + אזהרה ממוקמת · החלטה: React + warning
  - **טקסט ריק אחרי המקף ("כותרת 2 -")** — ישן: React: לא כותרת (‎(.+)‎); Orange: כותרת עם טקסט ריק (‎(.*)‎) · חדש: כ־React — פסקה + אזהרה · החלטה: React
  - **טקסט עודף בין הרמה למקף — למשל "כותרת 7 (מקור: הוצאה, 7, 367) - חובת שמירה"** — ישן: React: פסקה; Orange (הבייסליין): כותרת — הטוקנייזר עם ‎.*?‎; 82 שורות כאלה בקורפוס הקנוני · חדש: כותרת לפי התבנית הגמישה (Orange) — הבייסליין קובע; החלק העודף נצרך כ-syntax; הפרש מול React-הישן מוסבר במאמת הדיפרנציאלי · החלטה: Orange (baseline)
  - **מקף בתוך הטקסט העודף ("כותרת 7 (א-ב) - ג")** — ישן: Orange: המקף הראשון חותך — הטקסט נחתך מוקדם · חדש: זהה ל־Orange — התבנית הגמישה עצלה · החלטה: Orange parity
  - **ללא רווח אחרי 'כותרת' ("כותרת2 - x")** — ישן: React: פסקה (‎\s+‎); Orange: כותרת (‎\s*‎) · חדש: כ־React · החלטה: React
  - **רווחים מקדימים/עוקבים בשורה** — ישן: שני המנועים מקצצים (trim) לפני ההתאמה · חדש: זהה; הרווחים החתוכים — syntax spans (line-trim) · החלטה: equivalent
  - **מספר שלילי/לא תקין** — ישן: parseInt — ערכים לא תקינים לא עוברים את ‎\d+‎ · חדש: זהה (‎\d+‎ בלבד) · החלטה: equivalent

#### `sidenote-h7`

- **מזהה בישן:** כותרת 7 - <טקסט הערת צד> (הערת צד מוצמדת לפסקה הבאה)
- **סטטוס:** active-input · **זרם:** sidenote · **קדימות:** 20
- **תחביר:** `^כותרת\s+7(?:\s+מספר\s+\d+(?:\s*\(\d+\))?)?\s*[-–—]\s*(.+)$`
- **הערת תחביר:** כל שורת H7 — הערת צד; בדומה ל־H5/H6 במצב side_note (הגדרה, לא קלט)
- **מיפוי:** notes.sidenotes: NoteEntry + בלוק סמן heading בגוף — בלוק heading-7 בגוף ש-inline שלו הוא note-reference להערה; טקסט ההערה — אטומים בזרם sidenote; העיגון לפסקה הבאה — מדיניות שלב 54 (שלב 54)
- **fixture:** `packages/test-fixtures/corpus/identifiers/ident-sidenote-h7.txt`
- **מקורות:**
  - React @ 0c7b9927 · `src/parser/sidenote-parser.ts` שורות 8-30 · sha256 `987f3287c7e5eae4…`
  - React @ 0c7b9927 · `src/parser/index.ts` שורות 26-28 · sha256 `ea37fdefae7a3a57…`
  - React @ 0c7b9927 · `tests/unit/parser/parser.test.ts` שורות 124-137 · sha256 `c95bd0d8025919e4…`
  - Orange @ 93ad1e57 · `typesetter.js` שורות 4060-4067 · sha256 `e5fe969a9d487ebd…`
  - IMUD_TORANI @ 706ba955 · `shared/specs/Software_specification.md` שורות 386-390 · sha256 `3c4b6e75cbe680df…`
- **מקרי קצה:**
  - **H7 עם מספר ("כותרת 7 מספר 395 - ...")** — ישן: React: המספר נזרק (ParsedSidenote בלי מספר); מופיע בקורפוס (ch63) · חדש: כ־React — המספר לא נשמר בפרט ההערה; אזהרה ממוקמת מתעדת את הזנחתו · החלטה: React parity
  - **H7 עם ##הערת עורך## בטקסט** — ישן: הערת העורך מוסרת לפני חילוץ הערת הצד (סדר הצינור) · חדש: זהה — התוכן של אחרי ההסרה; ההסרה נרשמת כ־suppress · החלטה: equivalent
  - **H7 שכולו הערת עורך ("כותרת 7 - ##x##")** — ישן: אחרי ההסרה אין טקסט → לא כותרת → השורה כולה נשארת פסקה · חדש: זהה — פסקה עם הטקסט הגולמי שנותר + אזהרה · החלטה: equivalent
  - **סוגריים [..] בטקסט H7** — ישן: לא מחולצים כהערות שוליים — שורת H7 הוסרה לפני שלב הסוגריים · חדש: זהה — סוגריים מילוליים בגוף הערת הצד · החלטה: equivalent

#### `endnote-prefix`

- **מזהה בישן:** הערת סיום - <טקסט> (קידומת המוגדרת ב-settings.notes.endnotePrefix)
- **סטטוס:** active-input · **זרם:** endnote · **קדימות:** 30
- **תחביר:** קידומת `הערת סיום -`
- **הערת תחביר:** React: ‎slice(prefix.length).trim()‎ בלבד; Orange מוריד גם ‎^\s*[:\-–—]\s*‎ אחרי הקידומת — הבדל מתועד, ההחלטה: תחביר React
- **ניתן להגדרה:** settings.notes.endnotePrefix
- **מיפוי:** notes.endnotes: NoteEntry + InlineItem {kind:'note-reference'} בגוף — הקידומת — syntax span; טקסט ההערה — אטומים בזרם endnote; השלמת endnotes בסוף חלק — שלב 55 (שלב 55)
- **fixture:** `packages/test-fixtures/corpus/identifiers/ident-endnote-prefix.txt`
- **מקורות:**
  - React @ 0c7b9927 · `src/parser/endnote-parser.ts` שורות 7-31 · sha256 `5ebcdad0a54ef7dc…`
  - React @ 0c7b9927 · `src/parser/index.ts` שורות 30-43 · sha256 `ea37fdefae7a3a57…`
  - React @ 0c7b9927 · `tests/unit/parser/parser.test.ts` שורות 110-122 · sha256 `c95bd0d8025919e4…`
  - Orange @ 93ad1e57 · `typesetter.js` שורות 4046-4051 · sha256 `e5fe969a9d487ebd…`
  - Yellow @ 878535e1 · `typesetter.js` שורות 3026-3046 · sha256 `b2c772bbff07d88a…`
  - Green @ e5cde5f1 · `typesetter.js` שורות 4005-4025 · sha256 `f1fd6ff697acf106…`
  - Gold @ a444d34c · `typesetter.js` שורות 4118-4138 · sha256 `cb68b79163f0cae4…`
  - IMUD_TORANI @ 706ba955 · `shared/specs/Software_specification.md` שורות 374-379 · sha256 `3c4b6e75cbe680df…`
- **מקרי קצה:**
  - **שורת הערה שכולה הערה (ממוצעת לשורה עצמה)** — ישן: React: השורה הופכת לשורת placeholder במקומה; ב־AST היא מצטרפת לפסקה עם השורות הסמוכות · חדש: בלוק גוף ש-inline שלו note-reference באותה מיקום זרימה · החלטה: equivalent
  - **תווים נוספים אחרי הקידומת (":" או מקף נוסף)** — ישן: React: נשמרים בטקסט ההערה; Orange: מוסרים · חדש: כ־React; הבדל Orange מתועד · החלטה: React
  - **סוגריים [..] בטקסט הערת הסיום** — ישן: ליטרליים — הערת הסיום חולצה לפני שלב הסוגריים · חדש: זהה — אטומים מילוליים בגוף ההערה · החלטה: equivalent
  - **קידומת ריקה (הגדרת משתמש)** — ישן: startsWith('') מתאים לכל שורה — כל שורה הערת סיום; אין מגן בישן · חדש: נדחה: errors.parser.INVALID_ENDNOTE_PREFIX — קידומת ריקה אסורה · החלטה: new: reject

#### `custom-style-linePrefix`

- **מזהה בישן:** קידומת שורה מוגדרת־משתמש (סגנון טקסט מיובא, matcher.type === 'linePrefix')
- **סטטוס:** active-input · **זרם:** body · **קדימות:** 40
- **הערת תחביר:** Orange מוריד גם ‎^\s*[:\-–—]\s*‎ ומנתב לפי target/layoutMode (endnote/side_note/run_in/heading סינתטי) — הבדלים מתועדים; ההחלטה: תחביר React, הניתוב — מדיניות פריסה
- **ניתן להגדרה:** settings.customStyles[].matcher.prefix
- **מיפוי:** ContentBlock {role:'custom', styleId} + customStyleIds — הקידומת — syntax span; התוכן — אטומים; הערות שוליים בתוך השורה חולצו קודם (סדר הצינור) וההפניות בתוך הבלוק (שלב 30)
- **fixture:** `packages/test-fixtures/corpus/identifiers/ident-custom-lineprefix.txt`
- **מקורות:**
  - React @ 0c7b9927 · `src/parser/custom-style-parser.ts` שורות 19-50 · sha256 `3ef8ab0861356c28…`
  - React @ 0c7b9927 · `src/parser/ast-builder.ts` שורות 77-96 · sha256 `63e554961295eb72…`
  - React @ 0c7b9927 · `src/types/settings.ts` שורות 105-108 · sha256 `163a94f44d9e02c7…`
  - Orange @ 93ad1e57 · `typesetter.js` שורות 4078-4117 · sha256 `e5fe969a9d487ebd…`
  - Orange @ 93ad1e57 · `app.js` שורות 664-681 · sha256 `1e10f71cb7c517c3…`
  - IMUD_TORANI @ 706ba955 · `shared/specs/Software_specification.md` שורות 428-438 · sha256 `3c4b6e75cbe680df…`
- **מקרי קצה:**
  - **שתי הגדרות שהקידומת שלהן מתאימה לאותה שורה** — ישן: הראשונה בסדר המערך (המופעלות) זוכה; break · חדש: זהה — סדר ההגדרות קובע; נרשם כלל precedence · החלטה: equivalent
  - **שורה שמתאימה גם לקידומת וגם לכותרת** — ישן: הסגנון רץ אחרי שלב הסוגריים ולפני ה־AST — sentinel מוצמד לשורה והיא כבר לא כותרת ב־AST · חדש: זהה — הקידומת גוברת על זיהוי הכותרת (הסדר הישן נשמר) · החלטה: equivalent
  - **target/layoutMode של Orange (endnote/side_note/run_in)** — ישן: Orange מנתב את השורה לזרם/תפקיד בהתאם להגדרה · חדש: בלוק custom בגוף; הניתוב — מדיניות פריסה (שלבים 54–58) וההגדרות — settings-schema (שלב 30) · החלטה: documented
  - **קידומת ריקה** — ישן: startsWith('') מתאים לכל שורה — אין מגן · חדש: נדחית הגדרה עם קידומת ריקה: errors.parser.INVALID_CUSTOM_STYLE · החלטה: new: reject

#### `custom-style-regex`

- **מזהה בישן:** matcher.type === 'regex' — תנאי זיהוי כללי (מוגדר בטיפוסים הישנים)
- **סטטוס:** specified-not-implemented · **זרם:** body · **קדימות:** 41
- **הערת תחביר:** לא מומש באף מקור נעול (הערה מפורשת בקוד הישן: 'inlineMarker ו-regex יטופלו אחרת')
- **מיפוי:** — — מחוץ להיקף הפרסר; החלטה מתועדת — settings-schema (שלב 30) יחליט אם נדרש (שלב 30)
- **fixture:** `packages/test-fixtures/corpus/identifiers/ident-custom-regex.txt`
- **מקורות:**
  - React @ 0c7b9927 · `src/parser/custom-style-parser.ts` שורות 42-43 · sha256 `3ef8ab0861356c28…`
  - React @ 0c7b9927 · `src/types/settings.ts` שורות 105-108 · sha256 `163a94f44d9e02c7…`
  - IMUD_TORANI @ 706ba955 · `shared/specs/Software_specification.md` שורות 428-438 · sha256 `3c4b6e75cbe680df…`
- **מקרי קצה:**
  - **הגדרת regex בקלט** — ישן: לא מיושם — השורה נשארת תוכן רגיל · חדש: זהה — לא מיושם גם בחדש; נרשם כאן כדי שהסריקה תוכיח שאין מזהה חסר; יידון בשלב 30 · החלטה: parity

### תוחמים בתוך שורה

#### `footnote-brackets`

- **מזהה בישן:** [ <טקסט הערה> ] (תוחמים המוגדרים ב-settings.notes.footnoteDelimiters; קינון נספר)
- **סטטוס:** active-input · **זרם:** footnote · **קדימות:** 60
- **תחביר:** תוחמים `[` … `]`
- **הערת תחביר:** חילוץ על הטקסט המחובר (join('\n')) — הערה יכולה לחצות שורות; תוחם פתוח בלי סוגר — לא הערה (מילולי)
- **ניתן להגדרה:** settings.notes.footnoteDelimiters
- **מיפוי:** notes.footnotes: NoteEntry + InlineItem {kind:'note-reference'} — התוחמים — syntax spans; תוכן ההערה — אטומים בזרם footnote; ההפניה נושאת SourceSpan של כל הטווח התחום; מספור טרם עימוד — שלב 20 (שלב 20)
- **fixture:** `packages/test-fixtures/corpus/identifiers/ident-footnote-brackets.txt`
- **מקורות:**
  - React @ 0c7b9927 · `src/parser/footnote-parser.ts` שורות 13-57 · sha256 `41998ed76902a234…`
  - React @ 0c7b9927 · `src/parser/nested-bracket-matcher.ts` שורות 7-22 · sha256 `a64d3b1cb12c7bc5…`
  - React @ 0c7b9927 · `src/parser/index.ts` שורות 45-51 · sha256 `ea37fdefae7a3a57…`
  - React @ 0c7b9927 · `tests/unit/parser/parser.test.ts` שורות 60-108 · sha256 `c95bd0d8025919e4…`
  - IMUD_TORANI @ 706ba955 · `shared/specs/Software_specification.md` שורות 361-372 · sha256 `3c4b6e75cbe680df…`
- **מקרי קצה:**
  - **סוגר פתוח בלי סוגר ("טקסט [ללא סגירה")** — ישן: לא הערה — הטקסט נשאר כמו שהוא (מבחן ישן מפורש) · חדש: זהה + אזהרה ממוקמת · החלטה: equivalent + warning
  - **קינון ("[ראה [פנימי] חיצוני]")** — ישן: הערה אחת — הסוגר התואם החיצוני; הסוגריים הפנימיים בטקסט ההערה · חדש: זהה — אטומים בגוף ההערה כולל הסוגריים הפנימיים · החלטה: equivalent
  - **הערה חוצת שורות** — ישן: אפשרית — החילוץ על הטקסט המחובר; בטקסט ההערה נשמר \n · חדש: גוף ההערה כולל explicit-break במקום ה\n (אטום לא יכול להכיל תו בקרה); מיקום זהה · החלטה: equivalent (mapping)
  - **הערה בתוך שורת כותרת / שורת סגנון מותאם** — ישן: מחולצת — שלב הסוגריים לפני ה־AST; ה-placeholder בטקסט הכותרת · חדש: זהה — note-reference בתוך ה-inline של בלוק הכותרת/הסגנון · החלטה: equivalent
  - **תוחמים מותאמים (למשל ( ) )** — ישן: נתמך דרך ההגדרות · חדש: זהה — ParserOptions.footnoteDelimiters · החלטה: equivalent

#### `editorial-notes`

- **מזהה בישן:** ##<טקסט הערת עריכה>## — מוסר מהגוף לחלוטין
- **סטטוס:** active-input · **זרם:** editorial · **קדימות:** 5
- **תחביר:** `##[^#]+##` (flags: g)
- **הערת תחביר:** React: פר-שורה, בלי # בתוכן; Orange/Yellow/Green/Gold: ‎##[\s\S]*?####‎ רב-שורתי בזמן רינדור — הבדל מתועד; ההסרה בחדש נרשמת כ־TransformRecord מסוג suppress
- **מיפוי:** notes.editorial: NoteEntry + TransformRecord {kind:'suppress'} — הסרה מהגוף אסור ש'תיעלם' (§6.2): התוכן נשמר כבלוק note-body בזרם editorial, ה־## — syntax, וההסרה נרשמת בספר הטרנספורמציות; הערות editorial יתומות מטבען עד שלב 21
- **fixture:** `packages/test-fixtures/corpus/identifiers/ident-editorial-notes.txt`
- **מקורות:**
  - React @ 0c7b9927 · `src/parser/editorial-note-parser.ts` שורות 11-13 · sha256 `c20d249576faa30f…`
  - React @ 0c7b9927 · `src/parser/index.ts` שורות 23-24 · sha256 `ea37fdefae7a3a57…`
  - React @ 0c7b9927 · `tests/unit/parser/parser.test.ts` שורות 139-149 · sha256 `c95bd0d8025919e4…`
  - Orange @ 93ad1e57 · `typesetter.js` שורות 19-24 · sha256 `e5fe969a9d487ebd…`
  - Yellow @ 878535e1 · `typesetter.js` שורות 17-22 · sha256 `b2c772bbff07d88a…`
  - Green @ e5cde5f1 · `typesetter.js` שורות 17-22 · sha256 `f1fd6ff697acf106…`
  - Gold @ a444d34c · `typesetter.js` שורות 17-22 · sha256 `cb68b79163f0cae4…`
  - IMUD_TORANI @ 706ba955 · `shared/specs/Software_specification.md` שורות 392-401 · sha256 `3c4b6e75cbe680df…`
- **מקרי קצה:**
  - **## בודד (מספר אי-זוגי של ##)** — ישן: לא מוסר — נשאר טקסט מילולי · חדש: זהה + אזהרה ממוקמת (לא נבלע בשקט) · החלטה: equivalent + warning
  - **# בתוך התוכן (##a#b##)** — ישן: React: אין התאמה (‎[^#]+‎) — מילולי · חדש: זהה · החלטה: equivalent
  - **שורה שכולה הערת עורך** — ישן: אחרי ההסרה השורה מתרוקנת → מפריד פסקאות (הערה בתיעוד הישן: אין לסנן שורות ריקות) · חדש: זהה — השורה מתרוקנת; התוכן נשמר בזרם editorial · החלטה: equivalent
  - **שתי הערות בשורה אחת** — ישן: שתיהן מוסרות (global replace) · חדש: שתי רשומות editorial + שני suppress · החלטה: equivalent
  - **הערת עורך רב-שורתית** — ישן: React: לא מוסרת (פר-שורה); מנועי הדפדפן: מוסרת (רב-שורתי) · חדש: כ־React הפרסר; הבדל המנועים מתועד · החלטה: React

#### `custom-style-inlineMarker`

- **מזהה בישן:** תוחמי inline מוגדרים־משתמש (matcher.type === 'inlineMarker', למשל « »)
- **סטטוס:** active-input · **זרם:** body · **קדימות:** 61
- **הערת תחביר:** מוגדר באפיון §8.1 ובטיפוסים הישנים (StyleMatcher) עם עזר findInlineMarkers — אך לא חובר לצינור הישן; ממומש כאן לפי הוראת התכנית ('פורט linePrefix ו־inlineMarker לפי התחביר הישן')
- **ניתן להגדרה:** settings.customStyles[].matcher.{open,close}
- **מיפוי:** InlineItem {kind:'inline-box', boxId:styleId} — התוחמים — syntax spans; התוכן — אטומים; ה-inline-box מסמן את הטווח המעוצב כולו (start..end) (שלב 30)
- **fixture:** `packages/test-fixtures/corpus/identifiers/ident-custom-inlinemarker.txt`
- **מקורות:**
  - React @ 0c7b9927 · `src/parser/custom-style-parser.ts` שורות 55-79 · sha256 `3ef8ab0861356c28…`
  - React @ 0c7b9927 · `src/types/settings.ts` שורות 105-108 · sha256 `163a94f44d9e02c7…`
  - IMUD_TORANI @ 706ba955 · `shared/specs/Software_specification.md` שורות 428-438 · sha256 `3c4b6e75cbe680df…`
  - Orange @ 93ad1e57 · `app.js` שורות 664-681 · sha256 `1e10f71cb7c517c3…`
- **מקרי קצה:**
  - **פתיחה בלי סגירה** — ישן: findInlineMarkers עוצר (אין תוצאה) — הטקסט מילולי · חדש: זהה + אזהרה ממוקמת · החלטה: equivalent + warning
  - **קינון («א «ב» ג»)** — ישן: אין תמיכת קינון — הסגירה הראשונה סוגרת · חדש: זהה · החלטה: equivalent
  - **פתיחה/סגירה ריקים** — ישן: אין מגן · חדש: נדחה: errors.parser.INVALID_CUSTOM_STYLE · החלטה: new: reject

#### `paren-nesting`

- **מזהה בישן:** סוגריים מקוננות ( ) — טקסט בסוגריים מוקטן לפי רמת קינון
- **סטטוס:** active-input · **זרם:** body · **קדימות:** 62
- **תחביר:** תוחמים `(` … `)`
- **הערת תחביר:** בפרסר: תוכן מילולי — אין חלוקה (הסגנון בזמן רינדור); עץ הסוגריים המלא — שלב 19; סוגריים חוצי עמוד/טור — שלב 65
- **מיפוי:** אטומים מילוליים (פרסר) → עץ סוגריים (שלב 19) — TextType 'paren-text' הישן ממופה לאטומים + מבנה סוגריים עתידי (שלב 19)
- **fixture:** `packages/test-fixtures/corpus/identifiers/ident-paren-nesting.txt`
- **מקורות:**
  - Orange @ 93ad1e57 · `typesetter.js` שורות 2559-2666 · sha256 `e5fe969a9d487ebd…`
  - React @ 0c7b9927 · `src/types/text.ts` שורות 37 · sha256 `c543351ee323c7f5…`
  - Orange @ 93ad1e57 · `typesetter.js` שורות 4241-4246 · sha256 `e5fe969a9d487ebd…`
- **מקרי קצה:**
  - **סוגריים לא מאוזנות חוצות פסקאות** — ישן: findParenMatches מסמן balanced:false — סגנון עד סוף/מתחילת הטקסט; markInsideParenParagraphs מסמן פסקאות בתוך קינון · חדש: הפרסר שומר סוגריים מילוליים; עץ הסוגריים והחצייה — שלב 19/65 · החלטה: stage 19

### התנהגויות פרסר (חשבונאות תווים)

#### `line-trim`

- **מזהה בישן:** קיצוץ רווחים/\r מתחילת וסוף כל שורה
- **סטטוס:** active-input · **זרם:** body · **קדימות:** 95
- **הערת תחביר:** בקורפוס הנעול יש שורות עם רווחים עוקבים (very_long: 482) — לא תיאורטי
- **מיפוי:** SyntaxSpan (accounting) — הרווחים החתוכים נרשמים כ-syntax spans מסוג line-trim — כל תו מקור מוכר בכיסוי
- **fixture:** `packages/test-fixtures/corpus/identifiers/ident-line-trim.txt`
- **מקורות:**
  - React @ 0c7b9927 · `src/parser/ast-builder.ts` שורות 46 · sha256 `63e554961295eb72…`
  - React @ 0c7b9927 · `src/parser/metadata-parser.ts` שורות 29 · sha256 `01b4724aab095808…`
  - React @ 0c7b9927 · `src/parser/endnote-parser.ts` שורות 15 · sha256 `5ebcdad0a54ef7dc…`
  - Orange @ 93ad1e57 · `typesetter.js` שורות 4057 · sha256 `e5fe969a9d487ebd…`
- **מקרי קצה:**
  - **רווחים בקצה שורת תוכן** — ישן: נחתכים — לא מופיעים בטקסט הפסקה · חדש: הטקסט הסמנטי זהה; הרווחים החתוכים — syntax spans מתועדים (אין אטום אבוד) · החלטה: equivalent + accounting
  - **\r\n (סיומות Windows)** — ישן: ה\r נחתך בקיצוץ · חדש: זהה — ה\r בתוך syntax span של הקיצוץ · החלטה: equivalent

### מבנה ומשמעות (מספור, שערים)

#### `siman-numbering`

- **מזהה בישן:** מספר X (Y) בכותרת + מספור אוטומטי של סימנים (H2)
- **סטטוס:** active-input · **זרם:** body · **קדימות:** 51
- **הערת תחביר:** Orange: simanCounter לפי H2 בלבד, ‎סימן <גימטריה>‎ + resetSimanOnH1 — תצוגה בלבד, מדיניות שלב 58+; הפרסר החדש שומר מספר מפורש על הסימן
- **מיפוי:** Siman {simanNumber, subNumber} — המספרים המפורשים — חלק מה-syntax של הכותרת; האוטומטיים — נגזרים דטרמיניסטית; תווית התצוגה (גימטריה) — שלב 67 (שלב 67)
- **fixture:** `packages/test-fixtures/corpus/identifiers/ident-siman-numbering.txt`
- **מקורות:**
  - React @ 0c7b9927 · `src/parser/header-parser.ts` שורות 36-41 · sha256 `11319257376366ea…`
  - React @ 0c7b9927 · `src/types/text.ts` שורות 78-88 · sha256 `c543351ee323c7f5…`
  - Orange @ 93ad1e57 · `typesetter.js` שורות 4424-4429 · sha256 `e5fe969a9d487ebd…`
  - Orange @ 93ad1e57 · `index.html` שורות 709 · sha256 `0f5b426205ccfe78…`
  - React @ 0c7b9927 · `tests/unit/parser/parser.test.ts` שורות 17-27 · sha256 `c95bd0d8025919e4…`
- **מקרי קצה:**
  - **כותרת ברמה שאינה H2 עם מספר ("כותרת 3 מספר 18 - ..."; "כותרת 0 מספר 1 - ...")** — ישן: React: simanNumber על הצומת; Orange: לא פותח סימן · חדש: כל כותרת (H0–H6) עם מספר מפורש פותחת Siman עם אותו מספר — שימור הנתון; H7 כמו בישן (המספר נזנח) · החלטה: preserve via Siman
  - **H1 עם מספר ("כותרת 1 מספר 4 - ...")** — ישן: React: simanNumber=4 על צומת הכותרת · חדש: H1 פותח חלק; אם יש מספר — נפתח גם סימן עם אותו מספר שבלוק הכותרת הראשון שלו הוא ה־H1 · החלטה: preserve via Siman
  - **תוכן לפני פותח־סימן ראשון בחלק** — ישן: הצומת יושב בשורש ללא מספר · חדש: סימן סינתטי (מספר 1 ברצף) עוטף את התוכן — מבנה המסמך דורש סימן; הצמדה חד־חד־ערכית · החלטה: new: structural

#### `h2-siman-prefix-strip`

- **מזהה בישן:** הסרת 'סימן <א-ת>:' מפתיחת טקסט H2 בזמן תצוגה (Orange)
- **סטטוס:** layout-computed · **זרם:** body · **קדימות:** 52
- **תחביר:** `^סימן\s+[א-ת]+[:\-–—\s]*` (flags: i)
- **הערת תחביר:** רץ על טקסט הכותרת בזמן הרינדור כשautoSimanH2 פועל — לא שינוי תוכן; הפרסר שומר את הטקסט המלא כמו שהוא
- **מיפוי:** ContentBlock {role:'heading'} — הטקסט נשמר במלואו — טרנספורמציית תצוגה בלבד (שלב 61)
- **fixture:** `packages/test-fixtures/corpus/identifiers/ident-h2-prefix-strip.txt`
- **מקורות:**
  - Orange @ 93ad1e57 · `typesetter.js` שורות 4424-4429 · sha256 `e5fe969a9d487ebd…`
- **מקרי קצה:**
  - **H2 שמתחיל ב'סימן א:'** — ישן: התווית מוסרת בתצוגה ומוחלפת בתווית האוטומטית · חדש: הטקסט המלא נשמר באטומים; ההסרה — טרנספורמציית תצוגה (שלב 61/67) · החלטה: preserve; display policy

#### `shaar-designs`

- **מזהה בישן:** עיצובי שער: ראשי (main) / אחורי (back) / משנה (sub) — נכסים shaar_main/shaar_back/shaar_sub
- **סטטוס:** settings-driven · **זרם:** body · **קדימות:** 70
- **הערת תחביר:** אין תחביר קלט — הבחירה בהגדרות ובנכסים (1,053 עיצובים במלאי ההעברה); H1 במצב sub_shaar פותח שער משנה בפריסה
- **מיפוי:** Siman.shaarDesign (optional) — הבחירה בזמן פריסה לפי מדיניות; הנכסים — manifest נכסים (שלב 68) (שלב 68)
- **fixture:** `packages/test-fixtures/corpus/identifiers/ident-shaar-designs.txt`
- **מקורות:**
  - Orange @ 93ad1e57 · `typesetter.js` שורות 4173-4189, 4216-4232 · sha256 `e5fe969a9d487ebd…`
  - React @ 0c7b9927 · `src/types/text.ts` שורות 55-64 · sha256 `c543351ee323c7f5…`
  - IMUD_TORANI @ 706ba955 · `shared/specs/Software_specification.md` שורות 280-287 · sha256 `3c4b6e75cbe680df…`
- **מקרי קצה:**
  - **בחירת עיצוב לסימן** — ישן: הגדרות UI + קבצי העיצובים; PageType בטיפוסים הישנים · חדש: Siman.shaarDesign ('main'|'back'|'sub') זמין במודל; הפרסר אינו קובע — המדיניות (שלב 58/60/68) תמלא · החלטה: settings-driven

### מחושבי פריסה

#### `first-word-window`

- **מזהה בישן:** מילה ראשונה בחלון (first-word-window) — מילת הפתיחה של הפסקה הפותחת בגודל מוגדל
- **סטטוס:** layout-computed · **זרם:** body · **קדימות:** 80
- **הערת תחביר:** מחושב בזמן עימוד: גודל/אורך/סף שורות מינימום — הכול הגדרות (§6.6 בישן); אין תחביר קלט
- **מיפוי:** InlineItem {kind:'marker', markerId:'first-word-window'} (בזמן פריסה) — הפרסר מסמן את מילת הפתיחה של כל פסקה פותחת־סימן כעוגן נתונים בלבד (ללא שינוי תוכן) (שלב 64)
- **fixture:** `packages/test-fixtures/corpus/identifiers/ident-first-word.txt`
- **מקורות:**
  - Orange @ 93ad1e57 · `typesetter.js` שורות 288-338, 458-465 · sha256 `e5fe969a9d487ebd…`
  - IMUD_TORANI @ 706ba955 · `shared/specs/Software_specification.md` שורות 353-360 · sha256 `3c4b6e75cbe680df…`
  - React @ 0c7b9927 · `src/types/text.ts` שורות 24-25 · sha256 `c543351ee323c7f5…`
- **מקרי קצה:**
  - **פסקה בתוך סוגריים פתוחות** — ישן: insideParen → דילוג על עיצוב מילה ראשונה · חדש: הפרסר מספק את האטומים והמיקומים; ההחלטה — מדיניות שלב 64 · החלטה: layout policy

#### `drop-word`

- **מזהה בישן:** drop-word — מילת הפתיחה מוגדלת בחלון בראש הסימן
- **סטטוס:** layout-computed · **זרם:** body · **קדימות:** 81
- **הערת תחביר:** createDropWord בישן — מחושב בזמם רינדור; TextType 'drop-word' הישן מעולם לא הופק על ידי הפרסר הישן
- **מיפוי:** InlineItem {kind:'marker', markerId:'drop-word'} (בזמם פריסה) — כמו first-word — מדיניות שלב 64; TextType הישן מופה כאן באופן מלא (שלב 64)
- **fixture:** `packages/test-fixtures/corpus/identifiers/ident-drop-word.txt`
- **מקורות:**
  - Orange @ 93ad1e57 · `typesetter.js` שורות 338-392 · sha256 `e5fe969a9d487ebd…`
  - React @ 0c7b9927 · `src/types/text.ts` שורות 24-25 · sha256 `c543351ee323c7f5…`
  - React @ 0c7b9927 · `src/parser/ast-builder.ts` שורות 12-125 · sha256 `63e554961295eb72…`
- **מקרי קצה:**
  - **מפגש עם הערות/סוגריים במילה הראשונה** — ישן: createDropWord מטפל בסימון הערה זעיר בתוך המילה · חדש: האטומים וההפניות זמינים; העיצוב — שלב 64 · החלטה: layout policy

#### `dibbur-hamatchil`

- **מזהה בישן:** דיבור המתחיל (ד"ה) — זיהוי אוטומטי של הפתיח עד המפריד הראשון
- **סטטוס:** layout-computed · **זרם:** body · **קדימות:** 82
- **הערת תחביר:** applyDibburHamatchil בישן רץ על HTML בזמן רינדור; החדש יחשב על אטומים (שלב 64) — בלי HTML כמקור אמת
- **מיפוי:** InlineItem {kind:'marker', markerId:'dibbur-hamatchil'} (בזמן פריסה) — המפרידים והחלון מתועדים כאן; המימוש על אטומים — שלב 64 (שלב 64)
- **fixture:** `packages/test-fixtures/corpus/identifiers/ident-dibbur-hamatchil.txt`
- **מקורות:**
  - Orange @ 93ad1e57 · `typesetter.js` שורות 209-260 · sha256 `e5fe969a9d487ebd…`
  - IMUD_TORANI @ 706ba955 · `shared/specs/Software_specification.md` שורות 361-365 · sha256 `3c4b6e75cbe680df…`
  - React @ 0c7b9927 · `src/types/text.ts` שורות 25-26 · sha256 `c543351ee323c7f5…`
- **מקרי קצה:**
  - **מפריד בתוך 80 התווים הראשונים** — ישן: הפתיח עד המפריד (כולל) מסומן ד"ה · חדש: הפרסר מספק אטומים + breakBefore; החישוב — שלב 64 על אטומים · החלטה: layout policy
  - **RUN_IN_START (כותרת רצה בפתיחת הפסקה)** — ישן: ד"ה לא מוחל · חדש: הפרסר מזהה בלוק כותרת נפרד; ההחלטה — שלב 64 · החלטה: layout policy

### ריהוט עמוד

#### `running-headers`

- **מזהה בישן:** כותרות רצות — 3 אזורים (ימין/מרכז/שמאל), Recto/Verso, פיצול שם הספר לפי מקף
- **סטטוס:** settings-driven · **זרם:** body · **קדימות:** 71
- **הערת תחביר:** ריהוט עמוד — לא תוכן קלט; נגזר מהמסמך (כותרות נוכחיות) + הגדרות
- **מיפוי:** PageTemplate (layout-api) + anchors — TextType 'running-header' הישן — החלטת זניחה מתועדת בשלב 16: ריהוט, לא תוכן (שלב 67)
- **fixture:** `packages/test-fixtures/corpus/identifiers/ident-running-headers.txt`
- **מקורות:**
  - Orange @ 93ad1e57 · `typesetter.js` שורות 583-716 · sha256 `e5fe969a9d487ebd…`
  - React @ 0c7b9927 · `src/types/text.ts` שורות 35 · sha256 `c543351ee323c7f5…`
  - IMUD_TORANI @ 706ba955 · `shared/specs/Software_specification.md` שורות 366-371 · sha256 `3c4b6e75cbe680df…`
- **מקרי קצה:**
  - **תוכן הכותרת העליונה** — ישן: נגזר בזמן רינדור מהכותרות בעמוד · חדש: אותו חישוב בשלב 67 על בסיס ה־AST וה־Layout IR · החלטה: stage 67

#### `page-folio`

- **מזהה בישן:** מספור עמודים — גימטריה/'דף'+גימטריה/ספרות, מסגרת, מיקום, ערך התחלתי
- **סטטוס:** settings-driven · **זרם:** body · **קדימות:** 72
- **הערת תחביר:** toGematria/toGematriaWithGeresh בישן — פונקציות טהורות שיעברו ל־policy-torah
- **מיפוי:** InlineItem/אטום החדרה בזמן פריסה — TextType 'page-number' הישן — אטום החדרה (שלב 16) (שלב 67)
- **fixture:** `packages/test-fixtures/corpus/identifiers/ident-page-folio.txt`
- **מקורות:**
  - Orange @ 93ad1e57 · `typesetter.js` שורות 56-92 · sha256 `e5fe969a9d487ebd…`
  - React @ 0c7b9927 · `src/types/text.ts` שורות 34 · sha256 `c543351ee323c7f5…`
- **מקרי קצה:**
  - **סימן עמוד מדומה** — ישן: מוזרק בזמן רינדור · חדש: אטום החדרה עם origin מפורש (§6.2) — שלב 67 · החלטה: stage 67

#### `special-page-parts`

- **מזהה בישן:** חלקי עמוד מיוחדים — הקדשה, הסכמות, עמודים מותאמים (סוגי עמוד מיובאים), תמונות מוטמעות
- **סטטוס:** settings-driven · **זרם:** body · **קדימות:** 76
- **הערת תחביר:** importedPageTypes/importedImagePages בישן; PageType הישן (regular…custom)
- **מיפוי:** PageTemplate (layout-api) — החלטת זניחה מתועדת שלב 16: PageType — מושג פריסה (שלב 50)
- **fixture:** `packages/test-fixtures/corpus/identifiers/ident-special-pages.txt`
- **מקורות:**
  - Orange @ 93ad1e57 · `app.js` שורות 632-700 · sha256 `1e10f71cb7c517c3…`
  - React @ 0c7b9927 · `src/types/text.ts` שורות 55-64 · sha256 `c543351ee323c7f5…`
  - IMUD_TORANI @ 706ba955 · `shared/specs/Software_specification.md` שורות 423-449 · sha256 `3c4b6e75cbe680df…`
- **מקרי קצה:**
  - **עמוד מותאם אישית (JSON מיובא)** — ישן: מוצמד לפי insertionAnchor/repeatMode · חדש: תבניות עמוד ב־layout-api (שלב 50) + manifest (שלב 68) · החלטה: stage 50

#### `note-divider`

- **מזהה בישן:** קו מפריד מעל הערות השוליים — רגיל/עיגולים/ניצוץ/כוכבית/יהלום/קצר מימין/חצי קו/קו כפול/ללא
- **סטטוס:** settings-driven · **זרם:** body · **קדימות:** 77
- **הערת תחביר:** note_rules.json + dividerStyle ב־NoteRules הישן — הגדרה, לא קלט
- **מיפוי:** settings-schema — NoteRules הישן — החלטת זניחה מתועדת שלב 16 (הגדרות, לא תוכן) (שלב 30)
- **fixture:** `packages/test-fixtures/corpus/identifiers/ident-note-divider.txt`
- **מקורות:**
  - React @ 0c7b9927 · `src/types/settings.ts` שורות 65-91 · sha256 `163a94f44d9e02c7…`
  - Orange @ 93ad1e57 · `app.js` שורות 1360 · sha256 `1e10f71cb7c517c3…`
- **מקרי קצה:**
  - **בחירת המפריד** — ישן: הגדרות בלבד · חדש: settings-schema (שלב 30) + רינדור (שלבים 53, 68) · החלטה: settings

### נכסים

#### `section-divider`

- **מזהה בישן:** מפריד סוף־פרק — פירמידת וילנא / רומח / שושנתא / סלסול / תמונה / ללא
- **סטטוס:** settings-driven · **זרם:** body · **קדימות:** 73
- **הערת תחביר:** 323 עיצובים ב־section_dividers.json; fitSectionDividerToPage בישן
- **מיפוי:** ContentBlock {role:'custom', styleId:'section-divider'} + manifest נכסים — כמיפוי שלב 16; הנכסים — שלב 68 (שלב 68)
- **fixture:** `packages/test-fixtures/corpus/identifiers/ident-section-divider.txt`
- **מקורות:**
  - Orange @ 93ad1e57 · `typesetter.js` שורות 1540-1554, 5150-5156 · sha256 `e5fe969a9d487ebd…`
  - React @ 0c7b9927 · `src/types/text.ts` שורות 36 · sha256 `c543351ee323c7f5…`
  - IMUD_TORANI @ 706ba955 · `shared/specs/Software_specification.md` שורות 355-358 · sha256 `3c4b6e75cbe680df…`
- **מקרי קצה:**
  - **מפריד שלא נכנס בתחתית העמוד** — ישן: fitSectionDividerToPage — דחיפה לעמוד הבא · חדש: אילוץ בתוך חיפוש העמוד (שלבים 51–52, 68) · החלטה: layout

#### `heading-ornaments`

- **מזהה בישן:** עיטורי כותרות — H2 עליון+תחתון (התאמת רוחב), H3 ימין+שמאל, שערים
- **סטטוס:** settings-driven · **זרם:** body · **קדימות:** 74
- **הערת תחביר:** header_ornaments.json / ornaments_left_right.json / ornaments_up_down.json; fitH2OrnamentsToText
- **מיפוי:** manifest נכסים + layout — אין תחביר קלט (שלב 68)
- **fixture:** `packages/test-fixtures/corpus/identifiers/ident-heading-ornaments.txt`
- **מקורות:**
  - Orange @ 93ad1e57 · `typesetter.js` שורות 3591-3612 · sha256 `e5fe969a9d487ebd…`
  - IMUD_TORANI @ 706ba955 · `shared/specs/Software_specification.md` שורות 355-358 · sha256 `3c4b6e75cbe680df…`
- **מקרי קצה:**
  - **התאמת רוחב עיטור H2 לטקסט** — ישן: מדידה בזמן רינדור · חדש: שלב 69 אחרי מדידה · החלטה: layout

### תוכן נגזר

#### `toc`

- **מזהה בישן:** תוכן עניינים — כללי + מפורט בשערי משנה; לכל רמה: הצגה/קיבוץ/גופן/גודל
- **סטטוס:** settings-driven · **זרם:** body · **קדימות:** 75
- **הערת תחביר:** buildStructuredTOC/renderPaginatedTOC בישן — נגזר מהכותרות; נקודת שבת fixed-point בחדש
- **מיפוי:** AnchorTable (שלב 70) — אין תחביר קלט (שלב 70)
- **fixture:** `packages/test-fixtures/corpus/identifiers/ident-toc.txt`
- **מקורות:**
  - Orange @ 93ad1e57 · `typesetter.js` שורות 3401-3554 · sha256 `e5fe969a9d487ebd…`
  - IMUD_TORANI @ 706ba955 · `shared/specs/Software_specification.md` שורות 373-377 · sha256 `3c4b6e75cbe680df…`
- **מקרי קצה:**
  - **מספרי עמודים בתוכן העניינים** — ישן: נבנה אחרי עימוד ממפת הכותרות · חדש: AnchorTable + fixed-point (שלבים 70–71) · החלטה: stage 70

### negative-rule

#### `sentinels-forbidden`

- **מזהה בישן:** איסור sentinel (\u0001…\u0002) בקלט ובפלט — FN/EN/CUSTOM של הישן
- **סטטוס:** negative · **זרם:** body · **קדימות:** 99
- **הערת תחביר:** הישן החדיר ‎\u0001FN:id\u0002‎, ‎\u0001EN:id\u0002‎, ‎\u0001CUSTOM:id\u0002‎ לטקסט; אפיון §6.2 אוסר; בחדש: הפניית הערה = InlineItem מפורש, סגנון = בלוק מפורש
- **מיפוי:** — — בדיקה שלילית מחייבת: לא sentinel בקלט, לא sentinel בפלט, לא HTML כמקור אמת
- **fixture:** `packages/test-fixtures/corpus/identifiers/ident-sentinel-negative.txt`
- **מקורות:**
  - React @ 0c7b9927 · `src/parser/footnote-parser.ts` שורות 52 · sha256 `41998ed76902a234…`
  - React @ 0c7b9927 · `src/parser/endnote-parser.ts` שורות 24 · sha256 `5ebcdad0a54ef7dc…`
  - React @ 0c7b9927 · `src/parser/custom-style-parser.ts` שורות 40 · sha256 `3ef8ab0861356c28…`
- **מקרי קצה:**
  - **קלט המכיל \u0001/\u0002** — ישן: לא נבדק — sentinel יכול לזהם את הקלט · חדש: נדחה מראש: errors.parser.SENTINEL_IN_INPUT — הפרסר מסרב לקלט מזוהם · החלטה: new: reject
  - **פלט המכיל sentinel** — ישן: מחרוזות הביניים הכילו sentinels · חדש: נאסר ונבדק: סריקת הפלט המלא (בדיקה שלילית במאמת) · החלטה: new: verified

#### `html-in-input`

- **מזהה בישן:** HTML בקלט — אין פרשנות; תגיות הן טקסט מילולי
- **סטטוס:** negative · **זרם:** body · **קדימות:** 98
- **הערת תחביר:** הישן הזריק HTML בשלבי רינדור (buildRunInHeadingHTML, applyDibburHamatchil סרק תגיות) — הקלט עצמו לא פורש כ־HTML באף פרסר נעול; החדש: תוכן HTML-נראה = אטומים מילוליים + אזהרה
- **מיפוי:** אטומים מילוליים — מנע� 'ניחוש' מקור מתוך HTML (§6.2: 'אין לנחש מקור מ-HTML')
- **fixture:** `packages/test-fixtures/corpus/identifiers/ident-html-negative.txt`
- **מקורות:**
  - Orange @ 93ad1e57 · `typesetter.js` שורות 209-260, 3355-3369 · sha256 `e5fe969a9d487ebd…`
  - React @ 0c7b9927 · `src/parser/ast-builder.ts` שורות 12-125 · sha256 `63e554961295eb72…`
- **מקרי קצה:**
  - **שורה עם תגית (<b>טקסט</b>)** — ישן: הפרסרים הישנים לא פרשו HTML בקלט (ה־HTML נוצר בהמשך הצינור) · חדש: אטומים מילוליים + אזהרה ממוקמת; שום החלטה לא נשענת על HTML כמקור אמת · החלטה: literal + warning

---

**חוזה החשבונאות (שער השלב):** כל תו במקור מסווג בדיוק לאחת מהקטגוריות: אטום תוכן (איזה זרם שהוא), ערך metadata, syntax span (מזהה/תוחם/מפריד/קיצוץ), או explicit-break. אין רווחים, אין חפיפות בין קטגוריות, ואין תו שנעלם בשקט; כל הסרה נרשמת בספר הטרנספורמציות.

