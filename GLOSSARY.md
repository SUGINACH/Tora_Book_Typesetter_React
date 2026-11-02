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

### עיטורי כותרות (Heading Ornaments)
עיטורים מעל, מתחת ולצד **כותרות 2 ו-3 בלבד** (לא H7). נטענים מ-JSON חיצוני.
- H2: עיטור עליון + עיטור תחתון (מעל ומתחת הכותרת)
- H3: עיטורי צד (ימין ושמאל)
- **לא קשור ל-H7 / הערות צד**

**קוד:** `tora-heading-ornament-top`, `tora-heading-ornament-bottom` (H2)
**JSON:** `header_ornaments.json` (28KB)

### עיטור סוף פרק (Chapter End Ornament)
סימן ויזואלי ב**סוף קטע של כותרת 2** (לא סוף כל פסקה). סוגים: פירמידת מעויינים (❖ ❖ ❖), רומח, שושנתא, סלסול.

**קוד:** `tora-chapter-end`, `renderChapterEndDivider()`

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

## הקפאת בסיס (M0) — מושגי הגירה

### בייסליין נעול (Locked Baseline)
פלט רפרנס מהתוכנה הישנה ב־SHA נעול (Orange @ `93ad1e57`) ובסביבה נעולה (Node v22.23.4, Playwright 1.55.0, Chromium v1187), שממנו נמדדים תאימות והבדלים. אין לערבב בין סביבות.

**נתיב:** `docs/migration/baseline/` · **רשומה ראשית:** `baseline-run.json`

### המסמך הקנוני (Canonical Long Document)
`very_long_test_text.txt` (3.4MB, sha256 `5e73b913…ce0e4`) — קלט הייחוס לכל בדיקת מסמך מלא. 639 עמודים בברירת מחדל, 659 בעיטורים פעילים.

### מלאי ההעברה (Transfer Inventory)
הרישום המלא של כל מה שיש להעביר מהתוכנה הישנה: מזהים, הגדרות, גופנים, חלקי עמוד, שערים ועיטורים, חוקי הערות וקורפוס בדיקה — כל פריט עם SHA-256, סטטוס (מועבר/דחוי) ויעד.

**נתיב:** `docs/migration/transfer-inventory.{json,md}` · **נכסים נעולים:** `assets/{fonts,ornaments,shaar}/`

### fixture
קלט בדיקה נעול עם `sourceSha256`, provenance (מקור, SHA, סיבה), invariants צפויים ולעיתים קישור לבייסליין. **אין fixture בלי מקור ו־hash.** Golden לא מתעדכן אוטומטית.

**נתיב:** `packages/test-fixtures/` · **רישום:** `registry.json`

### מטריצת parity (Parity Matrix)
סיווג טענות התוכנה הישנה: **מאומתת** (מאומתה מחדש מול artifacts), **היסטורית** (SHA-locked — נכונה לנקודתה בלבד, לא יעד), **עקרון מתועד**. רק טענות מאומתות הן יעדי differential.

**נתיב:** `docs/migration/parity-matrix.{json,md}`

### יעד differential (Differential Target)
טענה מאומתת שהוקפאה כיעד השוואה למנוע החדש (שלב 48 ואילך) — למשל: 639/659 עמודים, שימור תוכן 0/0, תאימות ספר החלטות.

### שדות זמן-ריצה (Volatile Fields)
שלושת שדות הדוח של המנוע הישן שתלויים בזמן הריצה ומנורמלים לפני כל השוואת artifacts: `run.generatedAt`, `run.renderMs`, `geometry.stats.extractMs`. אף שדה מבני לא התגלה כתלוי-ריצה.

### מראה מקומית (Legacy Mirror)
עותק מקומי של ריפו מקור ב־SHA הנעול (תחת `TORA_LEGACY_MIRRORS`), לאימות hash של פריטים דחויים מול המקור בפועל.

## יחידות וחשבון (ADR-001; שלב 9)

### LU (Layout Unit)
יחידת הגאומטריה של ליבת המנוע: **1 LU = 1/65536 נקודה טיפוגרפית**. כל הגאומטריה — integers בטוחים בלבד; אין CSS pixels ואין pxPerMm. המרת מ"מ/A4 פעם אחת ברציונל מדויק (1mm = 360/127 pt).

**קוד:** `LayoutUnit`, `mmToLu`, `ptToLu`, `fontUnitsToLu` ב־`packages/measurement-api/src/units.ts`

### roundDiv — עיגול מרוכז
העיגול היחיד בליבה: מנה-רצפה ואז חצי-כלפי-∞ (זהה ל־Math.round גם לשליליים), בחישוב שארית שלם. כל Math.round אחר בקוד החבילות אסור (נאכף בסריקה).

### Cost — עלויות בסקייל קבוע
עלויות וקנסות של שבירת שורות: integers בסקייל 1/1024. אין השוואות float עם epsilon.

**קוד:** `Cost`, `makeCost` (COST_SCALE = 1024)

### safeAdd / safeMul
כל חיבור/כפל גאומטרי בליבה עובר שומרי סף הזורקים `UnitsError` בעת חריגה מ־Number.isSafeInteger. איסור bitwise על קואורדינטות (מוגבל ל־32 סיביות ב־JS).

## גיבוב קנוני (ADR-002; שלב 10)

### layoutHash
SHA-256 של ה־Layout IR הקנוני **בלבד** — בלי timestamps, משך ריצה, host או progress. אותם קלט, הגדרות, גופנים, provider וגרסת מנוע מניבים אותו ערך על כל host. כל שינוי מנוע מדווח עם diff שלו (אפיון §23.3).

**קוד:** `layoutHash` ב־`packages/layout-api/src/canonical-hash.ts`

### inputHash / configHash
inputHash = גיבוב כל מה שמשפיע על הפלט (מקור, configHash של ההגדרות האפקטיביות, מניפסטי גופנים ונכסים, גרסות פרסר ומנוע). configHash = ההגדרות האפקטיביות בלבד.

### canonicalJson
סריאליזציה קנונית: מפתחות ממוינים רקורסיבית, escaping קבוע, אפס שלילי מנורמל, וערכים לא-סדירים (undefined/NaN/function) נדחים בשגיאה. אידמפוטנטית — סריאליזציה←פרסור משמר hash.

### SHA-256 נייד
מימוש JS טהור ב־`packages/layout-api/src/hash.ts` — ליבת המנוע אסורה בייבוא node:crypto (חייבת לרוץ ב־Worker). מאומת מול וקטורי FIPS-180-4 ומול node:crypto כאורקל בבדיקות. FNV-1a נשמר להשוואה היסטורית בלבד.

## קטלוג שגיאות ו־i18n (שלב 12)

### EngineError
בסיס כל שגיאות הליבה. נושא מפתח קטלוגי (למשל `errors.font.MISSING_GLYPH`) + פרמטרים לתצוגה מתורגמת. ההודעה הגולמית (message) מיועדת ללוג פיתוח בלבד — למשתמש מציגים מפתח+params דרך i18n. מפתח לא רשום נדחה בזמן יצירת השגיאה.

**קוד:** `EngineError`, `ERROR_CATALOG` ב־`packages/measurement-api/src/errors.ts`

### ValidationIssue
ממצא אימות משותף לכל החבילות (הגדרות/קלט/מסמך): מפתח, חומרה, פרמטרים, מיקום והערת פיתוח. אינו חריגה — כמה בעיות בו־זמנית.

### טבלת מפתחות תרגום
`docs/i18n/error-keys.md` — המקור לקובצי ה־locale (שלב 93). מפתחות אינם משתנים לאחר פרסום; שינוי משמעות מחייב קוד חדש.

## כלי golden (שלב 13)

### buildGolden / compareGolden
כלי כתיבה והשוואת golden ב־`packages/test-fixtures`: ה־IR מגובב ב־layoutHash המוזרק, וההשוואה מפיקה דו"ח diff קריא (hash + מקטע ההבדל הראשון). **עדכון golden אסור אוטומטית ב־CI** — רק ידנית עם diff והסבר ב־WORKLOG. `tests/golden/` — מיקום קובצי ה־golden.

### סכמת fixture מלאה
`validateFixture`/`validateRegistry` (§17.3): id, schemaVersion, sourceSha256, settingsSha256, **fontManifestSha256** (נצלב מול המניפסט בפועל), enginePolicy, expected.invariants, **goldenLayoutSha256** (null עד היווצרות המנוע) ו־provenance.

## מודל תוכן ו־provenance (M2; שלב 14)

- **SourceSpan** — פרוסת מקור שכל פריט תוכן נושא: `documentId`, `stream`, טווח UTF-16 חצי־פתוח `[startUtf16, endUtf16)` ו־`importerPath` אופציונלי. הבסיס לכל ביקורת תוכן: אפשר לדעת מאין הגיע כל תו.
- **טווח חצי־פתוח** — ‎[start, end)‎: ‎end‎ אינו כלול. תו בודד במיקום ‎i‎ הוא ‎[i, i+1)‎; פרוסה ריקה ‎[i, i)‎ חוקית (עוגן נקודתי) ואינה חופפת כלום.
- **זרם תוכן (ContentStream)** — `body | footnote | endnote | sidenote | metadata`; יחסי פרוסות (הכלה/חפיפה) תקפים רק באותו מסמך ובאותו זרם.
- **מזהים ממותגים (NodeId/AtomId/AnchorId)** — טיפוסי מחרוזת עם מיתוג קומפילציה; לא ניתן להחליף סוג אחד בשני. הגזירה הדטרמיניסטית של AtomId — בשלב 15.
- **sliceSpan** — תת־פרוסה בהיסטים יחסיים מתוך פרוסת אב; כלי הפרסר לפצל טקסט בלי לאבד מקור. ה־importerPath עובר בירושה.
- **קטלוג שגיאות מקומי (content-model)** — ל־content-model אין תלויות (גרף §5), ולכן קטלוג השגיאות שלה מקומי (`CONTENT_MODEL_ERROR_CATALOG`, מפתחות `errors.span.*`) באותם כללי שלב 12: אכיפת רישום בזמן יצירה, מפתח = מפתח i18n.

### TextAtom ומזהים דטרמיניסטיים (שלב 15)

- **TextAtom** — יחידת התוכן הקטנה שממנה נבנה כל ה־IR: `text` (grapheme cluster או token אטומי), `source` (SourceSpan), `script` (hebrew/latin/number/punctuation/other), `bidiLevel`, `breakBefore` (forbidden/allowed/required) — וגורמי הזהות `ordinal` ו־`origin`. הבנייה רק דרך `makeTextAtom` המאומתת; אטום מקור חייב לכסות את פרוסתו במדויק.
- **AtomId נגזר** — ‎atom:v1|מסמך|זרם|start+end|origin|ordinal‎ — הזהות נגזרת מהמקור בלבד (פרוסה + סידור + מקור החדרה); אותו קלט ← אותו מזהה, בלי אקראיות, זמן או מונים. `origin` הוא "המקור המפורש" של אטומים מוחדרים (למשל מספר עמוד מדומה) — הוא מקודד במזהה ונשמר כשדה לביקורת.
- **classifyScript** — סיווג כתב דטרמיניסטי ברמת התוכן: נקודת הקוד המכריעה הראשונה (בלי תווים משלימים); הגוש העברי כולל ניקוד, טעמים, גרשיים ומקף עברי; רווח ופיסוק בסל `punctuation`; בקרות פורמט (RLM וכדומה) — `other`. ה־shaping עצמו במדידה (§6.4, שלבים 24+).
- **splitAtom / mergeAtoms** — פיצול ואיחוד אטומים בגבולות חוקיים בלבד (לא באמצע surrogate pair, לא בין בסיס לניקוד, לא אחרי ZWJ; איחוד רק בסמיכות מלאה, באותו מקור ורמת BiDi). הבן הימני של פיצול מסומן `forbidden` — פיצול provenance (כמו איחוי runs של DOCX) אינו הזדמנות שבירה. `merge(split(x)) === x` במדויק, כולל המזהה.
- **ספר טרנספורמציות (AtomLedger)** — רצף בלתי־הפיך של רשומות `TransformRecord` ‎{kind, from, to, reason, detail}‎ באוצר המילים של Text Audit v1 (split/merge/insert/suppress/reorder/bidi). שלב 15 מפיק split/merge; `ledgerIntegrityIssues` מוכיח שאטום לא נולד פעמיים ושאין מקור שלא נולד — הבסיס לשלב 21.
- **computeAtomCoverage** — חישוב טהור של כיסוי האטומים של זרם על פני ‎[0, N)‎: רווחים, חפיפות, כפילויות, חריגות גבול, החדרות ואטומים זרים — הכול **בלי רינדור ובלי מדידה** (שער השלב). כל אטום שאינו תקין (כולל מזהה שלא נגזר משדותיו) נדחה כבר בבדיקה המבנית `isTextAtom`.

### InlineItem, ContentBlock ומסגרת המסמך (שלב 16)

- **InlineItem** — רכיב תוכן רץ בתוך בלוק, שישה סוגים: `text` (רצף אטומים באותו זרם), `note-reference` (הפנייה להערה — התחליף המפורש ל־sentinel ‎\u0001FN:id\u0002‎ הישן), `anchor`, `explicit-break`, `inline-box` ו־`marker` (סמנים תורניים: drop-word, dibbur hamatchil וכדומה — בלי sentinel בטקסט). כל רכיב שאינו טקסט נושא `SourceSpan` משלו.
- **ContentBlock** — בלוק תוכן רקורסיבי לפי §6.2: `role` (body/heading/custom/note-body), `headingLevel` (חובה לכותרת, אסור לשאר; H0 פתיחה…H7 הערת צד — כמו בישן), `styleId` (סגנון מותאם אישית מהישן נשמר כמו שהוא), `inline`, `children` (חוקי לכל תפקיד — בירושה מ־ast-builder הישן שבו כותרת פותחת בלוק עם ילדים) + גורמי זהות `ordinal`/`origin`. המזהה נגזר: ‎node:v1|…‎; העוגן: ‎anchor:v1|…‎.
- **TorahDocument** — מסגרת המסמך: `metadata` (ערכים עם מקור בזרם metadata; עשרת המפתחות ההכרחיים ב־`LEGACY_METADATA_KEYS`), `parts` ← `simanim` ← בלוקים (מבטא את simanNumber/subNumber מהישן; `shaarDesign: main/back/sub`), `notes` — ארבעה זרמי הערות (שוליים/סיום/צד/עורך) עם `NoteEntry {noteId, kind, anchor?, block}`, `customStyleIds`, `sourceHash` (מוזרק מ־ADR-002) ו־`sourceLength`.
- **הפניות הערות** — כל `note-reference` חייב להיפתר להערה קיימת (`errors.document.UNRESOLVED_NOTE_REFERENCE`); הערה שאין מפנה אליה מדווחת על ידי `findOrphanNotes` — לא נבלעת בשקט. הסרת הערת עורך תירשם כ־`suppress` בספר הטרנספורמציות (שלב 15).
- **round-trip** — `serializeDocument`/`parseDocument`: אותו מסמך ← אותה מחרוזת ביט-ביט; פרסור מאומת במלואו (כולל אמיתות גזירה של כל בלוק). זו ההוכחה שהמודל מסוגל להחליף את מבני הביניים הישנים בלי DOM.
- **החלטות זניחה מתועדות** — `noteRules`/`customStyles` הם הגדרות (ביתם settings-schema, שלב 30; המסמך נושא רק את מזהי הסגנונות בשימוש); `LayoutMode`/`TextPosition`/`PageType`/`ColumnLayout` הם מושגי פריסה (Page Templates ב־layout-api, שלבים 50+; הקישור דרך styleId + headingLevel). המיפוי המלא: `docs/migration/content-model-mapping.md`.

## פרסר הישן מופורט (M2; שלב 17)

- **מרשם המזהים** (`docs/migration/identifiers.json`) — מקור היחיד לתחביר הקלט: 38 רשומות (מזהי שורה, תוחמים, כללי מבנה, מונעי הגדרות) עם מקורות נעולים + SHA, מקרי קצה והחלטות. ממנו נגזרים `registry-data.ts` (הפרסר צורך את התחביר ממנו) ו־`identifiers.md` (סנכרון נאכף ביט-ביט).
- **parseSourceText** — הפרסר החדש: צינור הישן (metadata ← editorial ← sidenote ← endnote ← footnote ← custom ← heading ← AST) בלי הרס — מרחב קואורדינטות UTF-16 אחד, בלי sentinel; הפניות הערה הן `InlineItem` מפורש.
- **חשבונאות מלאה (CoverageProof)** — כל תו מקור מסווג: אטום תוכן / ערך metadata / syntax span / explicit-break; אין רווחים ואין חפיפות — `coverage.ok` הוא שער השלב ("אין אטום אבוד").
- **SyntaxSpan** — טווח שנצרם כתחביר (מזהה כותרת, תוחמי הערה, קידומת, מפריד, קיצוץ שוליים), עם `recordId` מהמרשם.
- **התבנית הגמישה של Orange** — כותרות עם טקסט עודף בין הרמה למקף (למשל `כותרת 7 (מקור: הוצאה, 7, 367) - …`, 82 שורות בקורפוס הקנוני): React-lock דוחה, הבייסליין מקבל. החלטה: הבייסליין קובע (union: מובנית קודם, גמישה אחר כך).
- **בליעת שורות** — הערת שוליים חוצת שורות מקזזת את ה-\n שבתוכן בפרסר הישן (השורות מתמזגות לשורה סופית אחת); החדש משחזר זאת: שורות נבלעות אינן מפרידות פסקאות ואין רווח חיבור בין צדי ההערה.
- **דיפרנציאל (legacy-parser.differential.test.ts)** — 48 בדיקות: ניתוב כל שורה גולמית מול הרצת שלבי הפרסר הישן המוחזק (React @ 0c7b9927, מאומת מול manifest), הערות ו־metadata בדיוק, ומבנה AST שקול בקובץ ללא הפרשים.
- **מאמת verify-parser** — שער שלב 17: סנכרון המרשם, שלמות מקורות, כיסוי fixtures, שליליים (sentinel/HTML), סריקת מקור, דיפרנציאל ורגרסיה.


## נאמנות נוסח ו־Unicode (M2; שלב 18, ADR-007)

- **ADR-007 (נאמנות נוסח)** — ההחלטה: נרמול Unicode אסור בכל מסלול הייצור; המקור נשמר תו-מול-תו מהקלט ועד המדידה. הראיה: 231 רצפי ניקוד שאינם NFC בכל אחד משלושת הקבצים הארוכים של הקורפוס (בסיס+דגש+תנועה — NFC מסדר מחדש את הנקודות), 230 RLM לכל קובץ — נרמול "נוחות" היה משנה נוסח בשקט.
- **normalizeView** — ההיתר היחיד לנרמול: פרויקציה מפורשת עם מיפוי offsets מלא (source↔view) ודוח שינויים ממוקם. חוזה שימוש: להשוואות/חיפוש בלבד; אינה נשמרת ואינה חוזרת לצינור כמקור.
- **findNormalizationSpans** — גילוי בלבד: איפה נרמול היה משנה. אינווריאנט מוחלט: רשימה ריקה ⟺ `text.normalize(form) === text`. מיקום עדין לרמת יחידת נרמול בכתבי הקורפוס; מיקום ברמת מילה לכתבים אחרים (Hangul Jamo).
- **inspectUnicode** — מאגר דיווח: ניקוד/טעמים/מקף/גרשיים/בקרות BiDi/em-space/nbsp/BOM/חצאי surrogate/תווי בקרה/HTML entities/תגיות + דגלי נרמול. שום קטגוריה אינה "מתוקנת".
- **UNICODE_FIDELITY_RULES** — טבלת המדיניות המכונה־קריאה של ADR-007 סעיף 4: 11 קטגוריות (nikud, taamim, kri-ktiv, maqaf, gershayim, bidi-controls, html-entities, html-tags, edge-whitespace, bom, normalization) — כולן preserve/literal/report, אף אחת אינה תיקון.
- **atomFidelityIssues** — הוכחת נאמנות ברמת האטום: כל אטום מקור (בלי origin) חייב להיות שווה מילולית לפרוסת המקור הגולמי. מוכח על כל 63 קובצי הקורפוס ביחד עם אידמפוטנטיות סריאליזציה.
- **רווחית שולית** — רווחית Unicode בקצוות שורה היא תחביר (trim של הישן, `/\s/` מדויק, לרבות em-space); רווחית פנימית היא תוכן. חלק מדקדוק הקווים של שלב 17 — לא נרמול נוסח.
- **מאמת verify-unicode** — שעד שלב 18: ADR, API, אינווריאנט הגילוי, הוכחת נאמנות על כל הקורפוס (כולל שימור מלא של רצפי non-NFC ו־RLM בתוך אטומים), סריקת מקור (אין `.normalize(` בליבה מחוץ ל־unicode.ts) ורגרסיה.

## עץ סוגריים מבני (M2; שלב 19)

- **עץ סוגריים (scanBrackets)** — הפרסר בונה עץ סוגריים מעל אטומי התוכן בלבד (אחרי חילוץ התחביר בשלב 17): גוף המסמך זרימה אחת רציפה, וכל גוף הערה זרימה עצמאית. זוגות: () ו־[] בלבד («» הם פיסוק תוכן). תחביר הערות השוליים [..] אינו נספר — הוא כבר הוצא.
- **התאמה פר־סוג** — מחסנית עצמאית לכל סוג, בדיוק כמו findMatchingCloseBracket הישן; קלט מעורב ([ ( … ] ) אינו "מתוקן" — ה־( מדווח כלא-סגור. העץ מקנן גם בין סוגים.
- **BracketPairNode** — זוג עם מזהה דטרמיניסטי (bracket:v1|…), פרוסות פתיחה/סגירה מדויקות, עומק כולל, ילדים מקוננים ו־blockIds — רשימת הבלוקים שהזוג מקיף (חוצה שורות/עמודים).
- **BracketBlockState (continuation)** — מצב הסוגריים בכל גבול בלוק: openAtStart/openAtEnd/openedWithin/closedWithin. זהו "מצב ה־stack ב־PaginationState" מאפיון §10.4 — המנוע (שלבים 49+/65) צורך אותו ישירות, בלי regex ובלי ניחוש היררכיה; אין צורך ב־protectParens שמשנה עמודים אחרי האיזון.
- **דיווח בלבד** — פתיחה בלי סגירה (unclosed-open) וסגירה בלי פתיחה (stray-close) מדווחות כאזהרות קלט ממוקמות (WARN_UNCLOSED_BRACKET / WARN_STRAY_CLOSE_BRACKET); אף תו אינו מושלם, מוסר או מוחלף.
- **differential** — הזיווג הוכח זהה ל־oracle הישן (findMatchingCloseBracket מה־react-lock @ 0c7b9927) על כל 63 קבצי הקורפוס, וכן parity של protectParens הישן: hasOpenBracket(בלוק) ⟺ יציאה עם מרובע פתוח — התנאי שהישן הגן עליו בהעברת בלוקים בין טורים.
- **קורפוס במספרים** — 10,721 זוגות (11 חוצי בלוקים), 106 בעיות מדווחות, 24,997 מצבי בלוק; בקנוני: 2,508 זוגות עגולים בלבד, כולם בתוך בלוקים בודדים, 3 בעיות.
- **מאמת verify-brackets** — שעד שלב 19: API, differential מול הישן, אינווריאנטים (דטרמיניזם, המשכיות מצבי גבול openAtEnd[i]===openAtStart[i+1], פרוסות, חשבונאות, רציפות blockIds), אבחנות ורגרסיה.

## זרמי הערות ומספורן (M2; שלב 20)

- **מספור לפני העימוד (numberNotes)** — המספור נקבע במודל התוכן, לפני העימוד ובוודאי לפני הרינדור; הרינדור מקבל תוויות מוצלות (resolved labels) בלבד. היפוך הישן, שמספר בתוך renderFootnotes לפי אינדקס העמוד — מספור סמוי ברינדור (§10.3).
- **היקפי מספור** — ‎page | siman | part | continuous‎ כמדיניות מפורשת (NoteNumberingPolicy). ‎page‎ תלוי בהחלטות עימוד — נפתר רק עם הקשר עמודים מפורש (NumberingPageContext, מסופק על ידי המנוע בשלב 49+); בלי הקשר — שגיאה מקוטלגת, לא ניחוש. ברירת המחדל משוחזרת מהישן: page+גימטריא+שוליים/סיום.
- **סדר המסמך** — המספור לפי מיקום ההפניה הראשונה בזרימת המסמך (לא סדר המערך); לכל סוג הערה יש הפניה מפורשת בגוף (שוליים — בפסקה; סיום — בשורה; H7 — בלוק סמן). מיקום העוגן נשמר בכל הצבה — העוגן ההדדי של §10.3.
- **איפוסים מפורשים** — scopeCounts: ההיקפים בסדר הופעתם ומספר הערות בכל אחד; הכלל הקובע לחלק/סימן הוא "הכותרת הקודמת הקרובה" (פרוסות החלקים/סימנים הן טווחי שורות הכותרת).
- **toGematriaLabel** — פורט נאמן של src/lib/gematria.ts הישן; parity מלא 1..3000 מוכח במאמת (כולל 1000=תת״ר — הקוד הישן, לא ההערה שלו). וקטורי בדיקות הישן הועברו לחבילה. מדיניות גימטריא מלאה של פוליו — שלב 67.
- **אף הערה אינה נבלעת בשקט** — יתומות (בלי הפניה) מדווחות ואינן ממוספרות; הערות עורך אינן מודפסות ממילא (ההסרה נרשמת בספר הטרנספורמציות, שלב 17) ואינן נספרות כיתומות; הפניות מרובות מדווחות וממוספרות לפי הראשונה.
- **האנטי־תבנית שנאסרה** — קישור הערות צד לפי אינדקס עמוד (doc.sidenotes[pageNumber-1] הישן): כל H7 מקושר לעוגן מיקומי; המאמת סורק שאף חבילה אינה מקשרת לפי אינדקס.
- **מאמת verify-notes** — שעד שלב 20: API, parity גימטריא מול הישן (1..3000, הקוד הקפוא), הוכחות על 63 קבצי הקורפוס (אפס יתומות, חשבונאות, סדר, דטרמיניזן, page עם הקשר), שעד הרינדור ורגרסיה.

## Text Audit v1 וספר טרנספורמציות (M2; שלב 21 — שער M2)

- **Text Audit v1 (runTextAudit)** — הוכחה עצמאית שהקלט לא אבד ולא שוכפל בפרסור: הביקורת מחשבת מחדש את הכיסוי מהמסמך (לא סומכת על הוכחת הפרסר — חילוקי דעות מדווחים כ־COVERAGE_DISAGREEMENT); כל עמדת מקור חייבת כיסוי אחד בדיוק (אטום/תחביר/מטא/שבירה); כפילות מזהה אטום = שכפול נוסח; מבוסס פרוסות ומזהים — לא join(''). מעבר יחיד ללא אובייקטי ביניים (הקורפוס: 3.4M אטומים).
- **ממצאים (§14.1/§14.3)** — 11 קודים סגורים: MISSING/DUPLICATE_ATOM, OVERLAP_ATOM_SYNTAX, DUPLICATE_ATOM_ID, UNRESOLVED_NOTE_REFERENCE (HIGH), ORPHAN_NOTE (MEDIUM — הערות עורך פטורות, ההסרה מוצהרת בספר), LEDGER_ISSUE, RAW_CONTROL_PLACEHOLDER (HIGH), HTML_IN_ATOMS (LOW), COVERAGE_DISAGREEMENT, ATOM_TEXT_MISMATCH. ok ⟺ אפס HIGH.
- **טרנספורמציות מוצהרות** — הסרות (suppress) והחדרות (insert) נספרות ונבדקות מול ספר הטרנספורמציות (ledgerIntegrityIssues משלב 15): כל רשומה מקשרת מקור ליעד; presentedAtomIds — אטומי המקור שהוגשו לפני פיצול/איחוי.
- **fuzz (§17.1)** — מחולל כל תחביר הקלט ממרשם שלב 17 (כותרות תקינות/כמעט, H7, סיום, עורך, סוגריים, ניקוד לא-קנוני, RLM, em-space, metadata): parse ← coverage.ok ← audit.ok על 400 ריצות; דחיית קלט פגום = שגיאה מקוטלגת וממוקמת; דטרמיניזן 3 ריצות.
- **מטמורפי (§17.2#6)** — פיצול אטום אקראי (סימולציית פיצול XML runs של DOCX) במקום שאינו משנה טקסט: הכיסוי נשמר, טקסט הבלוק זהה, הספר מתעד, ואיחוי חוזר מחזיר את אותו המזהה.
- **תגלית ה-fuzz** — המחולל חשף באג אמיתי בפרסר (שלב 17): תוחמי הערת שוליים שבולעים הערת עורך שהוצאה — ה-explicit-break כיסה את כל הפער כולל התוכן שהוסר; תוקן: השבירה מכסה רק רצפי מפרידי השורות. הדיפרנציאל נשאר ירוק (הקורפוס אינו מכיל את המקרה).
- **שער M2 (§18-M2) עבר** — round-trip מוכיח 100% כיסוי אטומים על 26 מסמכי המרשם וכל 63 קבצי הקורפוס; הערות וסוגריים שומרים מקור; שגיאות קלט מקומיות; rollback מתועד (react-lock מאומת SHA, differential בלבד).

## חוזי מדידה ו־shaping (M3; שלב 22)

- **MeasurementProvider** — חוזה המדידה של המנוע (אפיון §6.4): ‎providerId מילולי 'harfbuzz-wasm'‎ לייצור בלבד; ‎shape(ShapeRequest) → ShapedRun‎ ו־lineOpportunities(atoms) סינכרוניים ודטרמיניסטיים אחרי טעינה אסינכרונית (ProviderLoader.load). אין Canvas ואין DOM בחתימות — החוזה רץ זהה ב־Node, Worker ו־Tauri.
- **ShapingAtom** — חוזה מבני לאטום הנמדד (id/text/script/bidiLevel/breakBefore); ל־measurement-api אין תלויות (גרף §5) ו־TextAtom של content-model מקיים אותו מבנית — המזהים הממותגים זהים (brand 'AtomId'), ולכן השמה דו־כיוונים בלי תלות בין החבילות.
- **FontFaceKey + fontFingerprint** — מפתח פנים (fontId, contentSha256, family, weight, style); הטביעה = SHA-256 של הייצוג הקנוני — כל שינוי bytes או משקל מחליף טביעה. טעינת bytes מה־manifest בלבד (שלב 23).
- **ShapeRequest** — הכל מפורש: אטומים, פנים, fontSizeLu (ADR-001), כיוון rtl|ltr, שפה (BCP-47), OpenType features, letterSpacingLu. ולידציה מלאה לפני כל מדידה (shapeRequestIssues/assertShapeRequest) — lone surrogates ותווי בקרה נדחים בהודעה מקוטלגת.
- **ShapedRun וחשבונאות** — גליפים (glyphId, clusterAtomIndex, advanceLu, offsets), רוחב, מטריקות אנכיות ו־missingGlyphAtomIds. חוזה: ‎widthLu === Σ(advanceLu)‎ — ריווח האותיות נכנס ל־advance של כל גליף (דפוס CSS), כך שרוחב קו ניתן לחישוב מחדש מהגליפים (§6.5). shapedRunAccountingIssues הוא שער החשבונאות של כל provider.
- **requestHash** — SHA-256 קנוני של (זהות provider, בקשה); סדר מפתחות features אינו משנה; כל רכיב השפעה משנה. environmentHash — זהה בכל host לאותה בנייה (מוכח בשלב 29).
- **מפתח מטמון קנוני (canonicalShapeCacheKey)** — כל מה שמשפיב על התוצאה ובו בלבד: בקשה + טביעת פנים + זהות provider מלאה. אסור זמן/מונה/מיקום ב־batch — אחרת cold/warm (שלב 26) וזהות בין hosts (שלב 29) היו נשברים. המטמון עצמו — שלב 26 (חוזה ShapingCache מוצהר כבר עכשיו).
- **batching** — shapeBatch חייב להיות שקוף: תוצאה[i] זהה ביט-ביט ל־shape(requests[i]) בפני עצמו, בכל הרכב/סדר/גודל. אופטימיזציה בלבד — אין סמנטיקת זמן ואין סדר רשת (§6.4).
- **TestMeasurementProvider ('test-simulated')** — ספק מדומה עם וקטורים קבועים (טבלאות אלפיות em לפי קטגוריית נקודת קוד; טווח U+E000–U+E0FF מדמה גליף חסר) — מוזרק במפורש בבדיקות יחידה בלבד, דרך subpath ‎'./test'‎; providerId מילולי נפרד מונע החלפת ספק ייצור בטיפוס. אכיפה: index אינו מייצא, depcruise (no-test-provider-in-production) והמאמת סורקים שאף קוד ריצה אינו מייבא.
- **SHA-256 נייב מקומי** — ל־measurement-api אין תלויות והיא אינה רשאית לייבא את layout-api (גרף §5), ולכן hash.ts קנוני מקומי (אותו FIPS-180-4 של שלב 10, מאומת מול וקטורי FIPS ומול node:crypto כאורקל) — בדיוק כמו הקטלוג המקומי של content-model. canonicalJson מקומי באותם כללי ADR-002.

## מניפסט גופנים מלא (M3; שלב 23)

- **manifest v2 (assets/fonts/manifest.json)** — כל 1,796 הגופנים מהמלאי רשומים בכיסוי 100% דו־כיווני מול הדיסק (כל קובץ ← רשומה; כל רשומה ← קובץ; hash מחושב מחדש לכל אחד). לכל גופן: ‎fontId, contentSha256, family, weight, style, unitsPerEm, binaryFormat, nameTable, source, distributionBlocked‎ — אין סינון לפי "שימוש מוכח"; אין השמטה שקטה; אין שינוי bytes.
- **fontId** — ‎font:v1|<contentSha256>‎ — זהות מה־bytes בלבד: שני קבצים זהי-bytes הם אותו גופן; כל שינוי byte מחליף זהות. מזהה בלתי-מוכר בטעינה = ‎UNKNOWN_FONT_ID‎ (שגיאה גלויה).
- **binaryFormat לפי החתימה** — הפורמט נקבע מה־magic bytes ולא מהסיומת: הרישום גילה 4 קבצי ‎.woff שתוכנם WOFF2 בפועל (אין אף WOFF1 אמיתי במלאי). binaryFormatOf הוא השופט.
- **מטא־דאטה בינארית** — unitsPerEm (head), usWeightClass ו־fsSelection (OS/2), nameTable — מהגופן עצמו דרך יישום הייחוס wawoff2 2.0.1 (נעול). תגליות: 116 גופנים עם טבלאות שמות מנוונות (nameID 1 ריק); משקלים לא-סטנדרטיים (usWeightClass 4–99 בחלק מהגופנים) — האמת הבינארית נשמרת; שם המשפחה העברי ממקורות הישן נשאר השם הקנוני לבחירה.
- **sfntSha256** — SHA-256 של ה־sfnt הקנוני אחרי פריקת WOFF2: נעילת דטרמיניזם הפריקה לקראת זהות המדידה בין hosts (שלב 29). המאמת מוכיח: פריקה חוזרת ⇐ אותו גיבוב.
- **distributionBlocked (D-001/D-002)** — bundled (1,757) ו־Guttman-Rashi (1) מסומנים LICENSE_UNVERIFIED: כשירים לשימוש לצורך תאימות, מוחרגים מחבילת ההפצה (שער שלב 99). הדגל אינו מסיר מהמרשם, אינו מחליף גופן ואינו משנה bytes. selfhost (38) — OFL-1.1 מתועד, ניתן להפצה עם הרישיון.
- **loadFontSet — אכיפת טעינה** — כל הגופנים הדרושים לקונפיגורציה נטענים ומאומתים (hash + חתימה) לפני המדידה הראשונה; byte אחד שהשתנה = ‎FONT_HASH_MISMATCH‎; חתימה שאינה תואמת = ‎FONT_FORMAT_MISMATCH‎. ה־bytes מוזרקים (Node/Worker/Tauri) — אין קריאת קבצים בליבה, אין גופן מערכת, אין רשת במסלול.
- **מחולל דטרמיניסטי (gen-fonts-manifest.mjs)** — אותם קלטים ⇐ אותו מניפסט ביט-ביט (אין תאריך/מונה; ה־idempotent — ריצה על v2 קיים מייצרת אותו פלט). דוח הכיסוי: ‎docs/migration/fonts-coverage.md‎.

## ספק HarfBuzz/WASM נעול (M3; שלב 24, ADR-003)

- **ספק ייצור אחד** — ‎@tora/measurement-harfbuzz‎ מממש את ‎MeasurementProvider‎ (providerId מילולי 'harfbuzz-wasm') על HarfBuzz 15.0.0 דרך harfbuzzjs 1.6.4 הנעולה. שער השלב: אין shaping של דפדפן בחוזה הייצור — ה־UI לעולם אינו מודד בעצמו.
- **מודל הזרקה** — ל־src של החבילה אין ייבוא של harfbuzzjs/wawoff2 ואין Node/DOM: ה־host (CLI/Worker/Tauri) מייבא את הספריות הנעולות ומזריק אותן + את bytes ה־WASM. כך הספק רץ זהה בכל סביבה.
- **אימות נעילות בזמן יצירה** — ‎sha256(wasmBytes)‎ מאומת מול ADR-003 (וכן גרסת HarfBuzz ומפרק ה־WOFF2); ‎wasmSha256‎ שהספק מדווח תמיד אמת ומאומת, לא מוצהר סתם. WASM זר = ‎MEASUREMENT_UNAVAILABLE‎.
- **אימות sfnt כפול** — לכל גופן WOFF2: פריקה דרך wawoff2 ואז ‎sha256(sfnt) === sfntSha256‎ מהמניפסט (שלב 23) — גרסת מפרק שונה או גופן שהוחלף נתפסים לפני כל מדידה (‎FONT_SFNT_MISMATCH‎).
- **קנה מידה** — shaping בסקייל ‎upem‎ (יחידות גופן שלמות, ללא איבוד בזמן העיצוב); ההמרה ל־LU אחר כך: ‎roundDiv(units × fontSizeLu, upem)‎. חוזה שלב 22 נשמר: ‎widthLu === Σ advanceLu‎; ריווח האותיות בתוך ה־advance של כל גליף.
- **מיפוי קלסטרים** — הטקסט המעוצד הוא join של טקסטי האטומים; ערכי הקלסטר של HarfBuzz (אינדקסים ב־UTF-16) ממופים ל־‎clusterAtomIndex‎ בחיפוש בינארי. RTL: הגליפים בסדר חזותי (קלסטרים יורדים); ניקוד מתלה על אשכול הבסיס עם advance 0.
- **גליף חסר** — glyphId 0 (‎.notdef‎) ← האטום נרשם ב־‎missingGlyphAtomIds‎ בסדר לוגי (מקור), בייחוד; אין החלפה שקטה. מדיניות העלייה בשגיאה — שלב 25.
- **מטריקות אנכיות** — מטבלת hhea של ה־sfnt; מוסכמת סימן: ‎yOffsetLu‎ חיובי כלפי מטה (הופכי ל־HarfBuzz) — נעול ב־ADR-003.
- **environmentHash** — נגזר מהנעילות בלבד (גרסאות + שני גיבובים + תצורת Unicode) ⇒ זהה בכל host לאותה בנייה; הוכחה מלאה בין Node ל־Web Worker — שלב 29.
- **lineOpportunities (זמני)** — הספק מציג כרגע את הכלל הטריוויאלי לפי שדה האטום; המימוש האמיתי (UAX #14 נעול + hooks) — שלב 27; אין צרכן ייצור עד M4+.

## איסור fallback שקט במדידה (M3; שלב 25)

- **הכלל הנעול** — גופן חסר, byte שהשתנה, גליף חסר או provider בלתי-זמין הם **שגיאות גלויות ומקוטלגות**, לא תוצאה אחרת בשקט. ‎MEASUREMENT_ERROR_POLICY‎ (enforcement.ts) מנעיל את שמונת המצבים: MISSING_FONT/UNKNOWN_FONT_ID/FONT_HASH_MISMATCH/FONT_FORMAT_MISMATCH/FONT_SFNT_MISMATCH/MEASUREMENT_UNAVAILABLE — חריגה מיידית; MISSING_GLYPH — דיווח + שער.
- **tofu (תיבת גופן חסר)** — כשלגוף אין גליף לתו, ה־shaping מחזיר ‎.notdef‎ (glyphId 0) — התו מוצג כתיבה ריקה/מלבן. הריצה אינה נכשלת מעצמה: האטומים רשומים ב־‎missingGlyphAtomIds‎ וממופים לממצאי ‎errors.font.MISSING_GLYPH‎. גליף 0 הוא הדרך היחידה של tofu — לעולם לא גליף מגופן אחר או מגופן מערכת.
- **missingGlyphFindings** — ממצא אחיד (§14.1) לכל אטום: מפתח קטלוגי, ‎path = מזהה האטום‎, פרמטרים ‎{fontId, fontFingerprint, atomId, atomIndex}‎ וחומרת HIGH לפי §14.3 ("fallback לא מוסבר"); אטום זר (לא מהבקשה) מסומן כ־provider bug — לא מושמט.
- **assertNoMissingGlyphs / shapeStrict** — השער הקשיח לריצות קפדניות: ריצה עם גליף חסר נכשלת עם ‎MISSING_GLYPH {fontId, count}‎. שתי הדרכית (ממצאים או כשל) גלויות — אין "המשך כרגיל".
- **ארבעת התרחישים המחייבים** (מהתכנית) מוכחים על הספק האמיתי: הסרת גופן, שינוי byte, גליף חסר, WASM בלתי-זמין — כולם מסתיימים בחריגה מקוטלגת עם טביעת גופן/מזהה; אף תוצאה לא הוחזרה בעקבות כשל. הוכחה מבנית לאי-נסיגה: טקסט שהגופן אינו מכיל מניב ‎.notdef‎ בלבד (10 מתוך 11 תווים ב־hello world — הרווח דווקא קיים בגופן), לעולם לא גליפים מגופן אחר.
- **סריקת נתיבי נסיגה** — קוד המדידה נקי מ־Canvas, fetch/XHR, CDN, גופני מערכת (Arial/sans-serif/systemFont) ו־SimulatedMeasurer; הספק המדומה מנוע מייצור גם בטיפוס וגם ב־depcruise (שלב 22).

## מטמון shaping (M3; שלב 26)

- **LruShapingCache** — מימוש LRU עם שתי תקרות (רשומות + אומדן בתים); ערכים קפואים ומשותפים. העקרון הנעול (§6.4): **המטמון אופטימיזציה בלבד** — קר/חם זהים ביט-ביט; פינוי, ניקוי (ביטול job) או מדדים אינם משנים שום תוצאה.
- **withShapingCache(provider)** — עטיפת ספק: ‎shape‎ בודק מטמון לפי המפתח הקנוני של שלב 22 (כל רכיבי ההשפעה ורק הם — אין זמן/מונה/מיקום ב־batch); הזהות, ‎lineOpportunities‎ וה־batch עוברים כמות שהם; ה־batch ממומש דרך ה־shape הממוקד — שקיפות מלאה.
- **מדדים** — ‎hits/misses/evictions/bytes‎ מצטברים ומחוץ לקביעת התוצאה לחלוטין; ניתן להזריק מטמון משותף בין ריצות של אותו job.

## הזדמנויות שבירה — UAX #14 (M3; שלב 27)

- **UAX #14 rev 53 (Unicode 16.0.0) נעול** — האלגוריתם המלא (LB2–LB31 כולל הכללים החדשים של rev 53: LB15a-d, LB19a, LB20a, LB21a, LB28a) עם **conformance 100%** מול ‎LineBreakTest.txt‎ הרשמי — 16,672/16,672 מקרים. הטבלאות מיוצרות מקובצי ה־UCD הרשמיים הנעולים ב־SHA (‎packages/test-fixtures/unicode/‎) על ידי מחולל דטרמיניסטי.
- **LB1 נאפה בטבלה** — ‎AI/SG/XX→AL‎; ‎SA→CM‎ לבעלי gc=Mn/Mc ואחרת AL; ‎CJ→NS‎ (ברירת המחדל המומלצת של UAX — כך גם קובץ המבחן). תנאי ‎$EastAsian = EAW ∈ {F, W, H}‎.
- **עיבוד מקדים** — LB9: מיזוג ‎CM/ZWJ‎ לבסיס שלפניהם (אין שבירה בתוך צרור — גם כשהניקוד מפוצל לאטום נפרד); LB10: שאריות ← AL. דגל ‎wasZwj‎ שומר את LB8a (אין שבירה אחרי ZWJ שלא מוזג) גם לאחר העיבוד — ומתאפס כש־CM נדבק אחריו.
- **API ברמת האטום** — ‎computeBreakOpportunities(atoms, hooks?)‎: רק החלטות שנופלות בדיוק על גבול בין אטומים; הפלט כולל הזדמנויות + שבירות חובה + רישומי ‎hook:forbid‎ (לביקורת); **כל נקודה מקושרת למזהה האטום** (שער השלב). אין בחירת שורה כאן — מועמדים בלבד (המנוע — M5).
- **Hooks מדיניות** — ‎forbid/allow‎ מקומיים אחרי UAX עם סיבה מתועדת לכל שינוי (‎hook:forbid(LB31)‎ וכד'); שבירת חובה (mandatory) אינה ניתנת לאיסור. דוגמה מחייבת: **מקף עברי (U+05BE, מחלקה BA)** — UAX ברירת מחדל מתיר שבירה אחריו (LB31), ומדיניות התורה תאסור זאת ב־hook (כמו הישן).
- **הספק** — ‎lineOpportunities‎ של harfbuzz עבר מהמימוש הזמני (שדה breakBefore) ל־UAX האמיתי; ה־hooks נצרכים על ידי המנוע ישירות דרך ‎computeBreakOpportunities‎.

## שבירת שורות גלובלית — כללי סיום פסקה (M5; שלב 45)

### מדיניות סיום פסקה (ParagraphEndRules)
כללי הקו האחרון וקו הפתיחה של פסקה, הנקראים מהמרשם (`avoid-runt-word`, `avoid-orphans`, `body-last-line-align`) דרך `readParagraphEndRules` (ערך חסר ← ברירת מחדל נעולה; ערך זר ⇒ SETTING_INVALID מקוטלג). הכללים נכנסים לחישוב העלות של ה-DP ומשפיעים על בחירת מועמדים בלבד — אין post-pass שמזיז מילים אחרי השבירה (בישן: applyAvoidRuntWord מיזג את שתי המילים האחרונות אחרי מדידה — עדות בלבד).
**קוד:** `layout-engine/src/linebreak/paragraph-end.ts`

### runt (שורה אחרונה חד-מילולית)
שורת הסיום של פסקה רב-שורתית המכילה מילה אחת; חוב 1 ברכיב `runtDebt` (רכיב 5 בווקטור ADR-004, לפני ה-badness) כש-`avoid-runt-word` פעיל. פסקה חד-שורתית אינה נחשבת ("ויש יותר משורה אחת" — כמו בישן).
**קוד:** `paragraph-end.ts → paragraphEndDebts`

### יתום ברמת הפסקה (widowOrphanDebt)
קו פתיחה חד-מילולי של פסקה; חוב 1 ברכיב `widowOrphanDebt` (רכיב 4) כש-`avoid-orphans` פעיל — ההיטל של בקרת "ראש הטור" מהישן לרמת הפסקה. בקרת העמוד המלאה (תחתית/ראש טור; `avoid-widows` אצל הישן, כולל היפוך השמות המתועד שם) מצטרפת ב-M6 לאותו רכיב.
**קוד:** `paragraph-end.ts → paragraphEndDebts`

### body-last-line-align
יישור קו סיום הפסקה (`center`|`right`, ברירת מחדל `center` מהמרשם). נאכף ב-policy בכך שקו הסיום אינו ממתח רווחים לעולם (justification `last`), והערך נישא ב-`LadderResult.lastLineAlign` להצבה ול-IR (חיבור מלא בשלב 47).
**קוד:** `paragraph-end.ts`, `emergency.ts → LadderResult`

## שבירת שורות גלובלית — סוללת השורה (M5; שלב 46)

### סוללת השורה (line battery)
קובצי ה-fixtures הנעולים של כל מקרי הקצה החובה של שבירת השורות (§17.1–17.4): שורה ריקה, פסקה ארוכה, מילה אחת, מילה ארוכה, ניקוד, BiDi, מקפים, סוגריים, note anchors, שורה ראשונה/אחרונה ורצפי whitespace — 11 קבצים ב-`layout-engine/test/fixtures/line-battery/`. כל fixture חייב לעבור: כיסוי אטומים מלא דרך הסולם (כולל אטומי רווחים), חוקיות מתועדת (קוד fallback לכל קו שאינו חוקי רמה-0), אי-חציית שבירה כפויה, דטרמיניזם מלא, hash יציב וביקורת נקייה.
**קוד:** `layout-engine/test/fixtures/line-battery/`, `test/line-battery.test.ts`

### הגנת חזית (frontier protection)
כלל באלומת ה-DP: צומת הפעיל עם `startTok` הגדול ביותר אינו נגזז לעולם. בתרחישי חירום שבהם כל קו חוקי הוא חד-מילולי, צומת החזית הוא היחיד שיכול לפתוח את השורה הבאה; בלי ההגנה גזמה האלומה אותו ראשון (האיכות המצטברת שלו הגרועה ביותר דווקא בגלל שהוא "הכי הרבה שורות עד כה") והפסקה כולה חזרה ריקה — נתגלה בסוללת שלב 46.
**קוד:** `dp.ts` (חיתוך האלומה)

## שבירת שורות גלובלית — מסלול next היחיד (M5; שלב 47)

### מסלול next יחיד
משלב 47 ה־DP הגלובלי (פרק ו) הוא אלגוריתם שבירת השורות היחיד במנוע next — המילוי החמדני הוסר מ-typeset ונותר ב-greedy.ts כפיקסטורת השוואה מסומנת לבדיקות differential בלבד. "אין שני אלגוריתמים מתחרים בשקט" (§18-M5).
**קוד:** `typeset-v0.ts → breakBlockGlobal`

### רשומת :path
רשומת הפנקס שמתעדת לכל פסקה את סיבת בחירת המסלול הסופי: הרמה שנבחרה מסולם החירום, הרמות שנוסו ונפסלו (עם סיבה) והתקציב שהוציא ה־DP. גם פסקה שקטה ברמה 0 מתועדת.
**קוד:** `typeset-v0.ts → pathRecord`

### הצדקה גאומטרית (placement plan)
מימוש החלטות ה־DP בהצבה: קו justify מותאם לרוחב הטור בדיוק על ידי חלוקת ההפרש על רווחי המילים (פר-תו, שארית לראשונים; בתוך אטום — פר-גליף); רווחים עוקבים בסוף קו מקבלים קידום אפס (מחוץ לרוחב; האטומים נשמרים); קו סיום פסקה מוזז ליישורו (body-last-line-align) בלי מתיחה.
**קוד:** `typeset-v0.ts → placementPlanOf`
