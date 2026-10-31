# מיפוי מודל התוכן — מהישן אל החדש (שלב 16)

**מקור הסמכות:** `src/types/text.ts`, `src/parser/ast-builder.ts` מהתוכנה הישנה · אפיון §6.2 · תכנית שלב 16.
**כלל השער:** אין שדה דרוש לפרסר הישן שאין לו ביטוי במודל החדש או החלטת זניחה מתועדת להלן.
**סטטוס:** המודל (חבילת `@tora/content-model`) הושלם בשלב 16; הפרסר עצמו יועבר בשלב 17 וימלא את המבנים האלה מקובצי מקור אמיתיים.

## 1. ParsedDocument → TorahDocument

| שדה בישן | ביטוי בחדש | הערה |
|---|---|---|
| `version: 1` | `schemaVersion: 1` | אותה משמעות, שם מדויק יותר |
| `metadata: Partial<BookMetadata>` | `metadata: MetadataEntry[]` — ערך = `{key, value, source}` עם `SourceSpan` בזרם `metadata` | עשרת המפתחות ההכרחיים רשומים ב־`LEGACY_METADATA_KEYS`; הרישום פתוח — מפתח נוסף מהמקור מתווסף על ידי הפרסר (שלב 17) בלי שינוי חוזה |
| `root: ParsedNode[]` | `parts: Part[]` ← `simanim: Siman[]` ← `blocks: ContentBlock[]` | ההיררכיה השטוחה־למחצה של הישן (שבה `simanNumber` מוצמד לכל צומת) הופכת למבנה חלקים←סימנים←בלוקים מפורש; ההתאמה חד־חד־ערכית |
| `footnotes: ParsedFootnote[]` | `notes.footnotes: NoteEntry[]` — `{noteId, kind, anchor?, block}` כש־`block` הוא `ContentBlock` בתפקיד `note-body` | הפנייה מהגוף היא `InlineItem {kind: 'note-reference'}` עם `SourceSpan`; כל הפנייה חייבת להיפתר (`errors.document.UNRESOLVED_NOTE_REFERENCE`) |
| `endnotes: ParsedEndnote[]` | `notes.endnotes: NoteEntry[]` | כנ"ל |
| `sidenotes: ParsedSidenote[]` | `notes.sidenotes: NoteEntry[]` + בלוק `heading` ברמה 7 בגוף (H7) | H7 מהישן = בלוק כותרת בגוף; טקסט הערת־הצד עצמו בזרם `sidenote`. הצמדת הערה "לכותרת הבאה" (`attachToNextParagraph`) היא מדיניות עימוד — שלב 54 |
| — (הערות עורך זוהו ב־`editorial-note-parser` והוסרו בשקט) | `notes.editorial: NoteEntry[]` | הסרה חדשה חייבת להירשם כ־`TransformRecord` מסוג `suppress` בספר הטרנספורמציות (שלב 15) — לא "נעלמת" |
| `noteRules: NoteRules` | **החלטת זניחה מתועדת:** הגדרות, לא תוכן — ביתן `settings-schema` (שלב 30, מרשם ההגדרות והמיגרציות). ערכי ברירת המחדל שהוקשחו ב־`ast-builder.ts` הישן יועברו לשם כברירות מחדל מתועדות | המסמך נושא רק `customStyleIds` — מזהי הסגנונות **בשימוש בפועל** במסמך |
| `customStyles: CustomTextStyle[]` | **החלטת זניחה מתועדת:** הגדרות — ביתן `settings-schema` (שלב 30); השימוש בהם נשמר ב־`styleId` של כל בלוק וב־`customStyleIds` | זהה להיגיון הישן שבו `customStyleId` מוצמד לצומת וההגדרה חיה בהגדרות |
| `sourceHash: string` | `sourceHash: string` — מאומת כ־64 hex קטנים או ריק | מוזרק על ידי הפרסר מ־ADR-002 (`@tora/layout-api`); ל־content-model אין תלויות |
| — | `sourceLength: number` | חדש: אורך המקור בתווי UTF-16 — נדרש לחישוב כיסוי אטומים 100% (שלב 21) |
| — | `documentId: string` | חדש: זהות מסמך לכל הפרוסות והמזהים הנגזרים |

## 2. ParsedNode → ContentBlock

| שדה בישן | ביטוי בחדש | הערה |
|---|---|---|
| `id: string` (מנוסח ממיקום, למשל `p-3-...`) | `id: NodeId` — **נגזר מהמקור בלבד** ‎`node:v1|מסמך|זרם|start+end|origin|ordinal` | דטרמיניסטי ויציב לאותו מבנה; אמיתת הגזירה נבדקת ב־`isContentBlock` |
| `type: TextType` | `role: 'body' \| 'heading' \| 'custom' \| 'note-body'` + `styleId` | הרבה־לאחד מכוון: ההבחנות העדינות של הישן נשמרות דרך `styleId` ורמת הכותרת (להלן) |
| `text: string` | `inline: InlineItem[]` — טקסט כ־`{kind:'text', atoms}` | הטקסט אינו מחרוזת אחת אלא אטומים עם פרוסות; אין sentinel בטקסט |
| `sourceLine: number` | `source: SourceSpan` — טווח UTF-16 חצי־פתוח + `importerPath` | חזק משמעותית ממספר שורה; מיקום מדויק לכל בלוק |
| `headingLevel?: 0–7` | `headingLevel: 0–7` — חובה ל־`role:'heading'`, אסור לשאר | אותן רמות בדיוק (H0 פתיחה … H7 הערת צד) |
| `simanNumber?: number` | `Siman.simanNumber` | הצומת יושב בתוך `Siman` — לא שדה משוכפל בכל צומת |
| `subNumber?: number` | `Siman.subNumber` | כנ"ל |
| `children?: ParsedNode[]` | `children?: ContentBlock[]` | חוקי לכל role — כמו בישן, שבו כותרת פותחת בלוק עם ילדים; עומק מוגבל 32 |
| `customStyleId?: string` | `styleId: string` | סגנון מותאם אישית נשמר כמו שהוא; ברירת מחדל `heading-N` לכותרות והתפקיד לשאר |

## 3. TextType (17 סוגים) → ביטוי במודל החדש

| TextType בישן | ביטוי בחדש |
|---|---|
| `body` | `ContentBlock {role:'body'}` |
| `drop-word` | `InlineItem {kind:'marker', markerId:'drop-word'}` (+ מדיניות שלב 64) |
| `dibbur-hamatchil` | `InlineItem {kind:'marker', markerId:'dibbur-hamatchil'}` (+ שלב 64) |
| `heading` | `ContentBlock {role:'heading', headingLevel}` |
| `footnote` | `notes.footnotes[i].block` — `role:'note-body'` |
| `footnote-marker` | `InlineItem {kind:'note-reference'}` בגוף |
| `endnote` / `endnote-marker` | `notes.endnotes` + הפניה, בהתאמה |
| `side-note` | `notes.sidenotes` + הפניה; H7 כבלוק כותרת בגוף |
| `editorial-note` | `notes.editorial` + רישום `suppress` בספר הטרנספורמציות בעת הסרה |
| `metadata` | `MetadataEntry` בזרם `metadata` |
| `page-number` | אטום החדרה עם `origin` מפורש (שלב 15) + מדיניות פוליו (שלב 67) |
| `running-header` | **החלטת זניחה מתועדת:** חלק עמוד, לא תוכן — Page Template לפי parity ב־layout-api (שלבים 50, 67) |
| `section-divider` | `ContentBlock {role:'custom', styleId:'section-divider'}` — המחיצה כנכס תיקשר ב־manifest הנכסים (שלב 68) |
| `paren-text` | אטומים רגילים; מבנה הסוגריים — עץ הסוגריים של שלב 19 (§10.5) |
| `custom` | `ContentBlock {role:'custom', styleId}` — ה־sentinel ‎`\u0001CUSTOM:id\u0002` **אסור** במימוש החדש; הפרסר (שלב 17) ממפה אותו לבלוק מפורש עם `SourceSpan` |

## 4. שאר טיפוסי הישן — היכן ביתם

| טיפוס בישן | החלטה |
|---|---|
| `LayoutMode` (`new_page_1col` … `sub_shaar`) | מושג פריסה — policy/layout-api (שלבים 58–66); הקישור מהתוכן דרך `headingLevel` + `styleId` |
| `TextPosition` (`in-column` … `new-page`) | מושג פריסה — Page Templates ואזורים (שלב 50) |
| `PageType` (`regular` … `custom`) | מושג פריסה; **בחירת** עיצוב השער נשמרת בתוכן: `Siman.shaarDesign: 'main' \| 'back' \| 'sub'`; הגאומטריה — שלב 68 |
| `ColumnLayout` (`single-column` … `mixed`) | מושג פריסה — תבניות עמוד (שלב 50) |
| `ParsedFootnote.sourceColumn` | נגזר מ־`SourceSpan` (ההיסט המדויק מחליף עמוד גס) |
| `ParsedSidenote.attachToNextParagraph` | מדיניות עיגון — שלב 54; הנתונים (טקסט+פרוסה) נשמרים במלואם כבר עכשיו |
| `BookMetadata` (עשרת השדות) | `LEGACY_METADATA_KEYS` — רשימה קפואה לעיון; הערכים עצמם `MetadataEntry[]` עם מקור |

## 5. מזהים דטרמיניסטיים (חדש — אין מקבילה בישן)

הישן בנה מזהים מנוסחים (`p-${index}-${text}`); החדש גוזר הכול מהמקור:
`AtomId` ‎`atom:v1|…` (שלב 15), `NodeId` ‎`node:v1|…` ו־`AnchorId` ‎`anchor:v1|…` (שלב 16).
אותו מקור ← אותו מזהה, בלי אקראיות, זמן או מונים; אמיתת הגזירה נבדקת בכל בדיקה מבנית.

## 6. אינווריאנטים הנאכפים בזמן יצירה

1. בלוק כותרת בלי `headingLevel` — נדחה; `headingLevel` בבלוק שאינו כותרת — נדחה.
2. מזהה בלוק כפול בעץ המסמך — נדחה (`errors.block.DUPLICATE_NODE_ID`).
3. `headingLevel` מחוץ ל־0–7 — נדחה.
4. גוף הערה שאינו `role:'note-body'` — נדחה; סוג הערה שאינו תואם לזרם — נדחה.
5. הפניית הערה בלי יעד — נדחה; הערה שאין מפנה אליה — מדווחת (`findOrphanNotes`), לא נבלעת.
6. `metadata` מחוץ לזרם `metadata` או מפתח כפול — נדחה.
7. `serializeDocument`/`parseDocument` — round-trip מלא; אותו מסמך ← אותה מחרוזת ביט-ביט.
