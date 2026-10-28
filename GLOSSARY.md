# מילון מושגים — Tora Book Typesetter React

> מסמך חי — מתעדכן בכל פעם שנכתב/נשתנה קוד הקשור למושג.
> כל מושג בעל שם ייחודי, והשימוש בו קבוע לאורך כל הפיתוח.

---

## מושגי יסוד

### שער ראשי (Main Shaar)
**עמוד 1 בספר.** דף השער הקדמי. מכיל: שם הספר, נושא, תיאור, מחבר, מקום ושנה. מעוצב על ידי SVG מ-`shaar_main.json`. אין בו כותרת עליונה ומספר עמוד.

**קוד:** `pageType: 'main-shaar'`, `PageType = 'main-shaar'`
**JSON:** `shaar_main.json` (32 עיצובים, כל אחד: `{id, name, svg}`)

### שער אחורי (Back Shaar)
**עמוד 2 בספר** — הגב המודפס של דף השער הראשי. לא העמוד האחרון! מכיל: זכויות יוצרים, פרטי הוצאה לאור, פרטי קשר, הערת ויתור. מעוצב על ידי SVG מ-`shaar_back.json`.

**קוד:** `pageType: 'back-shaar'`, `PageType = 'back-shaar'`
**JSON:** `shaar_back.json` (27 עיצובים)
**סדר עמודים:** עמוד 1 = שער ראשי → עמוד 2 = שער אחורי → עמוד 3+ = תוכן

### שער משנה (Sub Shaar)
**בתחילת כל חלק (H1) בספר.** מופיע אוטומטית כאשר ה-parser מזהה `כותרת 1 -`. מכיל: כותרת ראשית + כותרת משנה (מפוצלות על המקף הראשון). מעוצב על ידי SVG מ-`shaar_sub.json`.

**קוד:** `pageType: 'sub-shaar'`, `PageType = 'sub-shaar'`
**JSON:** `shaar_sub.json` (27 עיצובים)
**טריגר:** `כותרת 1 - <ראשי> - <משנה>` → H1, pageType='sub-shaar'

### עמוד פתיחת פרק (Chapter Opener)
**עמוד הנפתח על ידי כותרת H2 או H0.** הכותרת ממוקמת בשליש העליון של העמוד. הטורים מתחילים מתחת לכותרת אך מסתיימים באותו קו תחתון כמו עמוד רגיל.

**קוד:** `pageType: 'chapter-opener'`, `tora-page-h2`, `tora-page-h0`

### עמוד רגיל (Regular Page)
**עמוד טקסט רגיל עם שני טורים.** מכיל כותרת עליונה, טורים, הערות שוליים (אם יש), ומספר עמוד.

**קוד:** `pageType: 'regular'`

---

## רמות כותרות (Heading Levels)

### H0 — הקדמה / מבוא
פותחת עמוד חדש. מסוג `chapter-opener`. גופן: Frank Ruhl Libre 17pt Bold.

**קוד:** `headingLevel: 0`, `settings.typography.headings[0]`

### H1 — שער משנה / חלק
פותחת עמוד `sub-shaar`. הטקסט מפוצל על המקף הראשון לכותרת ראשית + משנה. גופן: Lia Sgula 50pt Bold.

**קוד:** `headingLevel: 1`, `settings.typography.headings[1]`

### H2 — פרק / סימן
פותחת תמיד עמוד חדש (`chapter-opener`). ממוקמת בשליש העליון. כולל סימן אוטומטי (גימם). גופן: AAd_AlphaBlack 17pt Bold.

**קוד:** `headingLevel: 2`, `settings.typography.headings[2]`
**סימן אוטומטי:** `autoSimanBadge: true`

### H3 — סעיף ביניים רוחבי
חוצה את שני הטורים (span). גופן: AAd_AlphaLight 13.5pt.

**קוד:** `headingLevel: 3`, `tora-heading-inline-wide`

### H4–H6 — תתי-סעיפים
מופיעות בתוך הטור (inline). גדלים: 12.5pt, 11.5pt, 10.5pt.

**קוד:** `headingLevel: 4|5| 6`, `tora-heading-inline`

### H7 — הערת צד (Marginalia)
תמיד בשוליים החיצוניים. אינה מופיעה בגוף הטקסט. מוצמדת לפסקה הבאה. גופן: Hadassah Friedlaender 6pt.

**קוד:** `headingLevel: 7`, `pageType` נשאר 'regular' אך ההערה מוצמדת.

---

## פסקאות

### p-cut (פסקה חתוכה)
פסקה שנחתכת באמצע וממשיכה בטור/עמוד הבא. כל השורות מיושרות (justify).

**קוד:** `class="tora-body-text p-cut"`, `text-align-last: justify`

### p-end (פסקה אחרונה)
הפסקה האחרונה בטור/סעיף. השורה האחרונה ממורכזת (`text-align-last: center`).

**קוד:** `class="tora-body-text p-end"`, `text-align-last: center`
**זיהוי:** `blockIndex === totalBlocks - 1` ב-renderColumn

### first-word-window (מילה ראשונה מוגדלת)
המילה הראשונה של כל פסקה מוגדלת. מצבים: `sunken` (שקוע), `inline` (בשורה), `bold` (מודגש), `none` (ללא).

**קוד:** `<span class="first-word-window">` או `<span class="first-word-bold">`
**הגדרות:** `settings.typography.dropWordMode`, `dropWordCount`, `dropWordMinLines`

### dibbur-hamatchil (דיבור המתחיל / ד"ה)
זיהוי אוטומטי של מילות הפתיחה עד הנקודה/מקף הראשונה (עד 80 תווים). נפוץ בביאורים על הש"ס והרמב"ם.

**קוד:** `<span class="dibbur-hamatchil">`
**רגקס:** `^([^.{terminators}]{1,80}[{terminators}])\s*(.+)$`
**הגדרות:** `settings.typography.dibburHamatchil.enabled`, `.terminators`

---

## הערות

### הערת שוליים (Footnote)
מופיעה בתחתית העמוד מתחת לטורים. תוחמי ברירת מחדל: `[` ו-`]`. תומכת במקוננים.

**קוד:** `ParsedFootnote`, `FootnoteBlock`, `tora-footnotes-area`
**תוחמים:** `settings.notes.footnoteDelimiters` (ברירת מחדל: `['[', ']']`)

### הערת סיום (Endnote)
מופיעה בסוף החלק. קידומת ברירת מחדל: `הערת סיום -`.

**קוד:** `ParsedEndnote`, `settings.notes.endnotePrefix`

### הערת צד (Side Note / Marginalia)
מופיעה בשוליים החיצוניים. מוצמדת לפסקה הבאה. מזוהה על ידי `כותרת 7 -`.

**קוד:** `ParsedSidenote`, `headingLevel: 7`

### הערת עריכה (Editorial Note)
מסומנת על ידי `##text##`. מוסרת לחלוטין מהמסמך.

**קוד:** `parseEditorialNotes()`, רגקס: `/##[^#]+##/g`

---

## עימוד

### טור ימני (Right Column)
הטור הראשון בכיווניות RTL (נקרא ראשון). `index: 0`.

**קוד:** `tora-column-right`, `ColumnContent.index = 0`

### טור שמאלי (Left Column)
הטור השני בכיווניות RTL. `index: 1`.

**קוד:** `tora-column-left`, `ColumnContent.index = 1`

### איזון טורים (Column Balancing)
שני הטורים חייבים להסתיים באותו קו תחתון. פער > 5px = בעיה.

### קו מפריד (Column Divider)
קו אנכי בין הטורים. מסתיים בדיוק בקצה הטקסט. סוגים: `none`, `line`, `dashed`, `double`.

**קוד:** `settings.grid.columnDivider`, `tora-column-divider`

---

## כותרות עליונות (Running Headers)

### כותרת עליונה (Running Header)
שורה מעל הטורים, מחולקת ל-3 אזורים (ימין/מרכז/שמאל). לא מופיעה בשערים.

**קוד:** `tora-running-header`, `tora-rh-right/center/left`

### מתחלפות (Alternating / Recto-Verso)
בעמודים אי-זוגיים (ימניים) וזוגיים (שמאליים), התוכן מתחלף בין ימין לשמאל.

**קוד:** `settings.runningHeader.alternating`, `isOddPage = page.pageNumber % 2 === 1`

### חצי-חצי (Half-Half)
שם הספר (מספר מילים זוגי) מפוצל בין שני האזורים החיצוניים. בעמוד ימני: חצי ראשון בימין, שני בשמאל. בשמאלי: התחלפות.

**קוד:** `settings.runningHeader.halfHalfBookName`

---

## מספור

### מספר עמוד (Page Number / Folio)
מופיע בתחתית העמוד. פורמטים: `hebrew-letter` (גיממ), `hebrew-letter-daf` ("דף א"), `arabic` (ספרות). מסגרות: `none`, `circle`, `square`, `round-parens`, `square-brackets`, `diamond`.

**קוד:** `settings.grid.pageNumberFormat`, `settings.grid.pageNumberFrame`
**פונקציה:** `toGematria(num)`, `renderPageNumber()`

### גימטריה (Gematria)
המרת מספר לאותיות עבריות: 1→א, 10→י, 15→ט"ו, 100→ק, 400→ת, 1000→א'.

**קוד:** `toGematria(num)` ב-`src/lib/gematria.ts`

### מספור הערות (Footnote Numbering)
סגנונות: `hebrew-letters` (א,ב,ג), `arabic-numbers` (1,2,3), `hebrew-letters-geresh` (א',ב'). איפוס: `page`/`siman`/`part`/`continuous`.

**קוד:** `settings.notes.numberingStyle`, `settings.notes.counterReset`

---

## שערים — SVG

### shaar-loader
מודול שטוען את קובצי JSON של עיצובי השערים. כולל cache (memoization).

**קוד:** `src/lib/shaar-loader.ts`
**פונקציות:** `loadShaarDesigns()`, `getShaarDesign(designs, index)`, `getShaarDesignById(designs, id)`

### ShaarDesign
מבנה נתונים: `{ id: string, name: string, svg: string }`. ה-SVG הוא רקע מלא לעמוד A4 (viewBox 2000×2880).

### ShaarDesignData
מבנה שמועבר ל-renderer: `{ main?: ShaarDesign, back?: ShaarDesign, sub?: ShaarDesign }`.

**קוד:** `src/worker/engine/renderer.ts`, `ShaarDesignData`

---

## מטריקות

### TextMeasurer
ממשק למדידת טקסט. מודד רוחב טקסט, גובה שורה, גובה בלוק. ב-MVP: `SimulatedMeasurer` (הערכות). בעתיד: `OffscreenCanvas` ב-Worker.

**קוד:** `src/worker/measurement/text-metrics.ts`, `TextMeasurer` interface, `SimulatedMeasurer` class

### FNV-1a Hash
hash דטרמיניסטי 32-bit. משמש לאימות דטרמיניזם: אותו קלט → אותו hash.

**קוד:** `fnv1a32(s: string): string` ב-`src/worker/inputs/fnv-hash.ts`

---

## בדיקות איכות (Audit)

### auditGeometry
פונקציה טהורה שבודקת את העמודים המרונדרים. 5 בדיקות:

1. **imbalanced-columns** — פער גובה בין טורים > 30px
2. **overflow** — טור גולש מעבר לגובה זמין
3. **widow** — שורה בודדת בתחילת טור
4. **sparse-line** — שורה אחרונה דלילה בפסקה חתוכה
5. **hanging-heading** — כותרת בתחתית טור עם פחות מ-2 שורות אחריה

**קוד:** `src/audit/geometry-audit.ts`
**חומרה:** `HIGH` / `MEDIUM` / `LOW`

### AuditFinding
מבנה ממצא: `{ page, kind, severity, description, elementId?, suggestedFix? }`.

**קוד:** `AuditFinding` ב-`src/types/layout.ts`

---

## Parser

### header-parser
מזהה כותרות ב-3 מבנים. רגקס: `^כותרת\s+(\d+)(?:\s+מספר\s+(\d+)(?:\s*\((\d+)\))?)?(?:\s*-\s*|\s*–\s*|\s*—\s*)(.+)$`

**קוד:** `src/parser/header-parser.ts`, `parseHeading(line: string): ParsedHeading | null`
**כלל:** שורה בלי מקף אינה נחשבת לכותרת (בשקט, ללא שגיאה).

### nested-bracket-matcher
מוצא את הסוגר הסוגר התואם לסוגר פותח, עם תמיכה במקוננים.

**קוד:** `findMatchingCloseBracket(text, openPos, openChar, closeChar): number`

### metadata-parser
מזהה 10 שדות metadata בתחילת המסמך. שורה ריקה אחרי ה-metadata מסיימת את הבלוק.

**קוד:** `parseMetadata(lines): { metadata, lines }`

---

## State

### Settings
מבנה הגדרות יחיד. כל משתנה ניתן לשינוי הוא חלק מ-Settings. לא מוטמע בקוד.

**קוד:** `Settings` interface ב-`src/types/main-settings.ts`
**ברירת מחדל:** `defaultSettings` ב-`src/lib/default-settings.ts`
**אחסון:** localStorage (Zustand persist middleware)

### ParsedDocument
תוצאת ה-parser — ה-AST הראשי. מכיל: metadata, root (צמתים), footnotes, endnotes, sidenotes, noteRules, customStyles, sourceHash.

**קוד:** `ParsedDocument` ב-`src/types/text.ts`

---

## ייבוא / ייצוא

### importWordFile
ייבוא קובץ .docx עם המרת סגנון Word → קידומת טקסט. `Heading 1` → `כותרת 1 - `.

**קוד:** `src/lib/text-importers.ts`, `importWordFile(file: File): Promise<string>`

### exportHtml
ייצוא HTML עצמאי (Standalone) — זהה לתצוגה החיה. CSS מוטמע, משתני :root, נתיבים מוחלטים.

**קוד:** `src/lib/html-exporter.ts`, `exportHtml(pages, settings, doc): string`

---

## דטרמיניזם

### קדושת שלמות הטקסט (Text Integrity is Sacred)
לעולם אין לקצר, לאחד, או לשנות איברים במערך המילים הגולמי. הנוסח נשמר אות באות.

### Snapshot & Rollback
מנגנון ליצירת "תצלום" מצב לפני שלב משמעותי, וחזרה אחורה אם השלב נכשל. (עתידי — טרם ממומש בקוד הנוכחי)

### Dry Run
ריצת דמה שלא משנה את המצב האמיתי. פונקציות מדידה מקבלות `isDryRun: true`. (עתידי)

### Trace Logger
יומן החלטות אופציונלי. כבוי כברירת מחדל. אינו משפיע על הפריסה.

**קוד:** `TraceLogger` ב-`src/worker/engine/trace-logger.ts` (טרם נוצר — מוגדר באפיון)
