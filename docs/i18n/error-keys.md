# טבלת מפתחות תרגום ראשונית — שגיאות (שלב 12)

מקור: `ERROR_CATALOG` ב־`packages/measurement-api/src/errors.ts`. המפתח הקטלוגי הוא עצמו מפתח ה־i18n. קובצי ה־locale (`src/i18n/locales/he-IL/errors.json` וכו') ייבנו מהטבלה הזו בשלב 93. כלל: אין הצגת `error.message` גולמי — מציגים מפתח+params; הפרטים הטכניים בלוג פיתוח.

| מפתח | פרמטרים | חומרה | תבנית עברית ראשונית |
|---|---|---|---|
| `errors.font.MISSING_FONT` | family, file | fatal | הגופן ‏{family} ({file}) חסר ואינו יכול להיטען |
| `errors.font.FONT_HASH_MISMATCH` | file, expectedSha256, actualSha256 | fatal | חתימת הגופן {file} אינה תואמת את הנעילה — הקובץ השתנה |
| `errors.measurement.MEASUREMENT_UNAVAILABLE` | provider, reason | fatal | שירות המדידה {provider} אינו זמין: {reason}. אין מדידה חלופית שקטה |
| `errors.units.UNSAFE_INTEGER` | what, value | error | חריגה מטווח השלמים הבטוחים בעת {what} (ערך: {value}) |
| `errors.units.INVALID_DENOMINATOR` | d | error | מכנה לא חוקי בחלוקת עיגול: {d} |
| `errors.units.NON_FINITE_MM` | mm | error | ערך מ"מ אינו סופי: {mm} |
| `errors.units.NON_FINITE_PT` | pt | error | ערך נקודות אינו סופי: {pt} |
| `errors.units.INVALID_UNITS_PER_EM` | unitsPerEm | error | unitsPerEm של גופן שגוי: {unitsPerEm} |
| `errors.units.UNSAFE_ADD` | a, b, ctx | error | חיבור גאומטרי גלש מהטווח הבטוח ({a} + {b}) בהקשר {ctx} |
| `errors.units.UNSAFE_SUB` | a, b, ctx | error | חיסור גאומטרי גלש מהטווח הבטוח ({a} - {b}) בהקשר {ctx} |
| `errors.units.UNSAFE_MUL` | a, b, ctx | error | כפל גאומטרי גלש מהטווח הבטוח ({a} × {b}) בהקשר {ctx} |
| `errors.units.NON_FINITE_COST` | value, ctx | error | ערך עלות אינו סופי: {value} בהקשר {ctx} |
| `errors.units.NON_FINITE_QUANTIZE` | value, ctx | error | ערך הגדרה אינו סופי בקוונטיזציה: {value} בהקשר {ctx} |
| `errors.hash.UNSUPPORTED_TYPE` | type | error | ערך מסוג {type} אינו ניתן לסריאליזציה קנונית |
| `errors.hash.NON_FINITE_NUMBER` | value | error | מספר לא סופי אינו ניתן לסריאליזציה קנונית: {value} |
| `errors.hash.INVALID_LENGTH` | len | error | אורך קלט שגוי לגיבוב: {len} |

## measurement-api — חוזי מדידה (שלב 22, פרק ד)

מקור: `ERROR_CATALOG` ב־`packages/measurement-api/src/errors.ts`, מוצאן ב־`provider.ts`, `cache-key.ts`, `hash.ts`.

| מפתח | פרמטרים | חומרה | תבנית עברית ראשונית |
|---|---|---|---|
| `errors.font.MISSING_GLYPH` | fontId, count | error | ל־{count} אטומים אין גליף בגופן {fontId} — דיווח גלוי, אין החלפה שקטה |
| `errors.shape.INVALID_REQUEST` | reason | error | בקשת shaping לא חוקית: {reason} |
| `errors.shape.INVALID_PROVIDER` | reason | error | זהות provider לא חוקית: {reason} |
| `errors.font.UNKNOWN_FONT_ID` | fontId | fatal | מזהה גופן בלתי-מוכר: {fontId} — אין גופן כזה במניפסט |
| `errors.font.FONT_FORMAT_MISMATCH` | file, expectedFormat, actualFormat | fatal | חתימת הקובץ {file} אינה תואמת את הרשומה (צפוי {expectedFormat}, נמצא {actualFormat}) |
| `errors.font.MANIFEST_INVALID` | reason | fatal | מניפסט הגופנים אינו תקין: {reason} |
| `errors.font.FONT_SFNT_MISMATCH` | file, expectedSha256, actualSha256 | fatal | פריקת WOFF2 של {file} אינה תואמת את הנעילה — ה־sfnt השתנה |

## content-model — קטלוג מקומי (שלב 14+)

מקור: `CONTENT_MODEL_ERROR_CATALOG` ב־`packages/content-model/src/errors.ts`. ל־content-model אין תלויות (גרף §5) ולכן הקטלוג מקומי — באותם כללי שלב 12 (אכיפת רישום בזמן יצירה; מפתח = מפתח i18n).

| מפתח | פרמטרים | חומרה | תבנית עברית ראשונית |
|---|---|---|---|
| `errors.span.INVALID_DOCUMENT_ID` | documentId | error | מזהה מסמך לא חוקי: {documentId} |
| `errors.span.INVALID_STREAM` | stream | error | זרם תוכן לא חוקי: {stream} |
| `errors.span.INVALID_RANGE` | startUtf16, endUtf16 | error | טווח פרוסה שגוי (נדרש 0 ≤ start ≤ end): {startUtf16}–{endUtf16} |
| `errors.span.NON_INTEGER_OFFSET` | value, field | error | היסט פרוסה אינו שלם בטוח ({field}): {value} |
| `errors.span.INVALID_IMPORTER_PATH` | importerPath | error | נתיב מקור לא חוקי: {importerPath} |
| `errors.span.SLICE_OUT_OF_RANGE` | from, to, length | error | תת־פרוסה מחוץ לטווח: [{from}, {to}) מתוך {length} |
| `errors.span.INVALID_ID` | kind, value | error | ערך מזהה לא חוקי ל־{kind}: {value} |
| `errors.span.NOT_A_SPAN` | reason | error | הערך אינו SourceSpan תקין: {reason} |

### content-model · atoms (שלב 15)

מקור: `CONTENT_MODEL_ERROR_CATALOG` ב־`packages/content-model/src/errors.ts`, מוצאן ב־`atoms.ts`.

| מפתח | פרמטרים | חומרה | תבנית עברית ראשונית |
|---|---|---|---|
| `errors.atom.NOT_AN_ATOM` | reason | error | הערך אינו TextAtom תקין (כולל אמיתת גזירת המזהה): {reason} |
| `errors.atom.INVALID_SPAN` | reason | error | פרוסת מקור לא תקינה לאטום: {reason} |
| `errors.atom.INVALID_TEXT` | reason, excerpt | error | טקסט אטום לא חוקי ({reason}): {excerpt} |
| `errors.atom.TEXT_SPAN_MISMATCH` | textLength, spanLength | error | אטום מקור חייב להכסות את פרוסתו במדויק (טקסט {textLength}, פרוסה {spanLength}) |
| `errors.atom.INVALID_SCRIPT` | script | error | כתב אטום לא חוקי: {script} |
| `errors.atom.INVALID_BIDI_LEVEL` | value | error | רמת BiDi חייבת שלם בטוח 0–125: {value} |
| `errors.atom.INVALID_BREAK_BEFORE` | value | error | סוג שבירה לא חוקי: {value} |
| `errors.atom.INVALID_ORIGIN` | origin | error | מקור החדרה לא חוקי: {origin} |
| `errors.atom.INVALID_ORDINAL` | value | error | סידור אטום חייב שלם בטוח ואי־שלילי: {value} |
| `errors.atom.ID_DERIVATION_TOO_LONG` | length | error | המזהה הנגזר חורג מ־512 תווים (אורך {length}) |
| `errors.atom.SPLIT_OUT_OF_RANGE` | at, length | error | נקודת פיצול מחוץ לטקסט: {at} מתוך {length} |
| `errors.atom.SPLIT_MID_SURROGATE` | at | error | אין לפצל באמצע surrogate pair (מיקום {at}) |
| `errors.atom.SPLIT_MID_GRAPHEME` | at | error | אין לפצל בתוך צרור גרפמה (מיקום {at}) |
| `errors.atom.SPLIT_EMPTY_SPAN` | startUtf16 | error | פיצול אטום החדרה (פרוסה ריקה ב־{startUtf16}) אינו נתמך |
| `errors.atom.MERGE_NOT_ADJACENT` | aEnd, bStart | error | איחוד חוקי רק בסמיכות מלאה (סוף {aEnd} מול התחלה {bStart}) |
| `errors.atom.MERGE_INCOMPATIBLE_ORIGIN` | aOrigin, bOrigin | error | אין לאחד מקורות החדרה שונים ({aOrigin} מול {bOrigin}) |
| `errors.atom.MERGE_INCOMPATIBLE_BIDI` | aBidiLevel, bBidiLevel | error | אין לאחד רמות BiDi שונות ({aBidiLevel} מול {bBidiLevel}) |
| `errors.atom.INVALID_TRANSFORM` | reason | error | רשומת טרנספורמציה לא חוקית: {reason} |
| `errors.atom.COVERAGE_INVALID_LENGTH` | expectedLength | error | אורך מסמך צפוי לא חוקי: {expectedLength} |

### content-model · inline / block / document (שלב 16)

מקור: `CONTENT_MODEL_ERROR_CATALOG` ב־`packages/content-model/src/errors.ts`; מוצאן ב־`inline.ts`, `blocks.ts`, `document.ts`.

| מפתח | פרמטרים | חומרה | תבנית עברית ראשונית |
|---|---|---|---|
| `errors.inline.NOT_AN_ITEM` | reason | error | רכיב inline לא תקין: {reason} |
| `errors.inline.EMPTY_TEXT` | count | error | רכיב טקסט חייב לפחות אטום אחד (קיבל {count}) |
| `errors.inline.ATOM_NOT_VALID` | reason | error | אטום לא תקין ברכיב טקסט: {reason} |
| `errors.inline.MIXED_STREAMS` | reason | error | אטומי רכיב טקסט חייבים אותו מסמך וזרם: {reason} |
| `errors.inline.INVALID_ID` | which, value | error | מזהה {which} לא חוקי: {value} |
| `errors.block.NOT_A_BLOCK` | reason | error | בלוק תוכן לא תקין: {reason} |
| `errors.block.INVALID_ROLE` | role | error | תפקיד בלוק לא חוקי: {role} |
| `errors.block.INVALID_STYLE_ID` | styleId | error | מזהה סגנון לא חוקי: {styleId} |
| `errors.block.HEADING_LEVEL_REQUIRED` | role | error | בלוק כותרת חייב headingLevel (H0–H7) |
| `errors.block.HEADING_LEVEL_FORBIDDEN` | role, level | error | headingLevel מוגדר רק לבלוקי כותרת ({role}, קיבל {level}) |
| `errors.block.INVALID_HEADING_LEVEL` | level | error | רמת כותרת חייבת שלם 0–7: {level} |
| `errors.block.INVALID_CHILDREN` | reason | error | ילדי הבלוק לא תקינים: {reason} |
| `errors.block.DUPLICATE_NODE_ID` | id, path | error | מזהה בלוק כפול: {id} (בנתיב {path}) |
| `errors.block.DEPTH_EXCEEDED` | depth, limit | error | עומק קינון בלוקים {depth} חורג מהמגבלה {limit} |
| `errors.block.INVALID_ORDINAL` | value | error | סידור בלוק חייב שלם בטוח ואי־שלילי: {value} |
| `errors.block.INVALID_ORIGIN` | origin | error | מקור בלוק לא חוקי: {origin} |
| `errors.block.ID_DERIVATION_TOO_LONG` | length | error | המזהה הנגזר חורג מ־512 תווים (אורך {length}) |
| `errors.document.NOT_A_DOCUMENT` | reason | error | מסמך לא תקין: {reason} |
| `errors.document.INVALID_SCHEMA_VERSION` | version | error | גרסת סכמה לא נתמכת: {version} |
| `errors.document.INVALID_DOCUMENT_ID` | documentId | error | מזהה מסמך לא חוקי: {documentId} |
| `errors.document.INVALID_METADATA` | reason, key | error | ערך metadata לא תקין ({reason}): {key} |
| `errors.document.DUPLICATE_METADATA_KEY` | key | error | מפתח metadata כפול: {key} |
| `errors.document.INVALID_PART` | reason, partId | error | חלק לא תקין: {reason} |
| `errors.document.INVALID_SIMAN` | reason | error | סימן לא תקין: {reason} |
| `errors.document.INVALID_SIMAN_NUMBER` | simanNumber | error | מספר סימן לא חוקי: {simanNumber} |
| `errors.document.INVALID_SHAAR_DESIGN` | shaarDesign | error | עיצוב שער לא חוקי: {shaarDesign} |
| `errors.document.INVALID_NOTE` | reason, kind | error | הערה לא תקינה ({reason}, סוג {kind}) |
| `errors.document.INVALID_NOTE_BLOCK_ROLE` | noteId, role | error | גוף הערה {noteId} חייב תפקיד note-body (קיבל {role}) |
| `errors.document.DUPLICATE_NOTE_ID` | noteId | error | מזהה הערה כפול: {noteId} |
| `errors.document.UNRESOLVED_NOTE_REFERENCE` | noteId | error | הפניית הערה שאין לה יעד: {noteId} |
| `errors.document.INVALID_SOURCE_HASH` | sourceHash | error | sourceHash חייב ריק או 64 תווי hex קטנים: {sourceHash} |

### content-model · parser (שלב 17)

מקור: `CONTENT_MODEL_ERROR_CATALOG` ב־`packages/content-model/src/errors.ts`; מוצאן ב־`parser/parse.ts`.

| מפתח | פרמטרים | חומרה | תבנית עברית ראשונית |
|---|---|---|---|
| `errors.parser.REGISTRY_RECORD_MISSING` | recordId | fatal | רשומת מרשם חסרה: {recordId} |
| `errors.parser.INVALID_OPTIONS` | reason | error | אפשרויות פרסר לא תקינות: {reason} |
| `errors.parser.SENTINEL_IN_INPUT` | offset | error | הקלט מכיל תווי sentinel אסורים (בהיסט {offset}) |
| `errors.parser.INVALID_CONTROL_CHAR` | offset, codePoint | error | תו בקרה אסור במקור (היסט {offset}, קוד {codePoint}) |
| `errors.parser.DUPLICATE_METADATA_KEY` | key, startUtf16 | error | מפתח metadata כפול: {key} (בהיסט {startUtf16}) |
| `errors.parser.INVALID_ENDNOTE_PREFIX` | prefix | error | קידומת הערות סיום חייבת מחרוזת לא ריקה: {prefix} |
| `errors.parser.INVALID_CUSTOM_STYLE` | styleId, reason | error | הגדרת סגנון מותאם לא חוקית ({styleId}): {reason} |
| `errors.parser.WARN_PRE_HEADING_CONTENT` | (ללא) | warning | שורה לפני הכותרת הראשונה שאינה metadata נשמרת כתוכן |
| `errors.parser.WARN_EDITORIAL_REMOVED` | (ללא) | warning | הערת עורך הוסרה מהגוף ונשמרה בזרם editorial; ההסרה נרשמה |
| `errors.parser.WARN_UNMATCHED_EDITORIAL` | (ללא) | warning | ## שלא נסגר — נשאר טקסט מילולי |
| `errors.parser.WARN_H7_SIMAN_DISCARDED` | simanNumber | warning | מספר הסימן ({simanNumber}) על כותרת 7 נזנח |
| `errors.parser.WARN_UNMATCHED_FOOTNOTE` | (ללא) | warning | תוחם הערת שוליים פתוח שלא נסגר — ההמשך מילולי |
| `errors.parser.WARN_NEAR_MISS_HEADING` | (ללא) | warning | שורה שמתחילה ב"כותרת" ולא תואמה — נשארת פסקה |
| `errors.parser.WARN_UNMATCHED_INLINE_MARKER` | styleId | warning | תוחם פתיחה של {styleId} שלא נסגר — טקסט מילולי |
| `errors.parser.WARN_HTML_IN_TEXT` | (ללא) | warning | תגית HTML בקלט — נשמרת מילולית; אין HTML כמקור אמת |

**כללי הוספה:** קוד חדש נרשם ב־`ERROR_CATALOG` בלבד (סטטי, קפוא); הוספה מלווה בשורה כאן ובבדיקה שהמפתח רשום. מפתחות אינם משתנים לאחר פרסום — שינוי משמעות מחייב קוד חדש.

### content-model · unicode (שלב 18, ADR-007)

מקור: `CONTENT_MODEL_ERROR_CATALOG` ב־`packages/content-model/src/errors.ts`; מוצאן ב־`unicode.ts`. הערה: אין קוד "טקסט לא תקין" — צורת המקור אינה נפסלת (ADR-007); הקודים למיפוי/טיפוסים בלבד.

| מפתח | פרמטרים | חומרה | תבנית עברית ראשונית |
|---|---|---|---|
| `errors.unicode.INVALID_FORM` | form | error | צורת נרמול לא חוקית: {form} (החוקיות: NFC, NFD, NFKC, NFKD) |
| `errors.unicode.INVALID_TEXT` | reason | error | קלט לא מחרוזת במודול ה־Unicode ({reason}) |
| `errors.unicode.MAPPING_MISMATCH` | expected, actual | error | מיפוי view↔source אינו עקבי (ציפוי {expected}, נמצא {actual}) |

### content-model · brackets (שלב 19)

מקור: `CONTENT_MODEL_ERROR_CATALOG` ב־`packages/content-model/src/errors.ts`; מוצאן ב־`brackets.ts` ובפרסר. בעיות סוגריים הן אזהרות קלט מדווחות — לעולם לא "מתוקנות" בשקט (§10.4).

| מפתח | פרמטרים | חומרה | תבנית עברית ראשונית |
|---|---|---|---|
| `errors.bracket.ID_DERIVATION_TOO_LONG` | length | error | מזהה זוג הסוגריים חורג מ־512 תווים ({length}) |
| `errors.parser.WARN_UNCLOSED_BRACKET` | kind, startUtf16 | warning | סוגר פתיחה מסוג {kind} לא נסגר עד סוף הזרימה (בהיסט {startUtf16}) |
| `errors.parser.WARN_STRAY_CLOSE_BRACKET` | kind, startUtf16 | warning | סוגר סגירה מסוג {kind} ללא פתיחה מתאימה (בהיסט {startUtf16}) |

### content-model · notes (שלב 20)

מקור: `CONTENT_MODEL_ERROR_CATALOG` ב־`packages/content-model/src/errors.ts`; מוצאן ב־`notes.ts`.

| מפתח | פרמטרים | חומרה | תבנית עברית ראשונית |
|---|---|---|---|
| `errors.notes.INVALID_POLICY` | reason | error | מדיניות מספור הערות לא חוקית ({reason}) |
| `errors.notes.INVALID_ORDINAL` | ordinal | error | מספר סידורי של הערה חייב להיות שלם חיובי (קיבל {ordinal}) |
| `errors.notes.PAGE_SCOPE_REQUIRES_CONTEXT` | scope | error | מספור בהיקף page דורש הקשר עמודים (החלטות העימוד) — אין לנחש |

### audit-core · Text Audit v1 (שלב 21, שער M2)

מקור: `AUDIT_CORE_ERROR_CATALOG` ב־`packages/audit-core/src/text-audit.ts` (שגיאות זריקה) + `TEXT_AUDIT_FINDING_CODES` (ממצאי דוח — לא נזרקים; messageKey = קוד הממצא).

**שגיאות (נזרקות):**

| מפתח | פרמטרים | חומרה | תבנית עברית ראשונית |
|---|---|---|---|
| `errors.audit.INVALID_INPUT` | reason | error | קלט לביקורת לא תקין ({reason}) |
| `errors.audit.UNREGISTERED_FINDING_CODE` | code | fatal | קוד ממצא לא רשום: {code} |

**ממצאי דוח (§14.1/§14.3):** `audit.text.MISSING_ATOM` (HIGH) · `audit.text.DUPLICATE_ATOM` (HIGH) · `audit.text.OVERLAP_ATOM_SYNTAX` (HIGH) · `audit.text.DUPLICATE_ATOM_ID` (HIGH) · `audit.text.UNRESOLVED_NOTE_REFERENCE` (HIGH) · `audit.text.ORPHAN_NOTE` (MEDIUM) · `audit.text.LEDGER_ISSUE` (HIGH) · `audit.text.RAW_CONTROL_PLACEHOLDER` (HIGH) · `audit.text.HTML_IN_ATOMS` (LOW) · `audit.text.COVERAGE_DISAGREEMENT` (HIGH) · `audit.text.ATOM_TEXT_MISMATCH` (HIGH).

## layout-api — Layout IR, חוזה typeset, מניפסט ופנקס (שלבים 31–32, פרק ה)

מקור: `LAYOUT_API_ERROR_CATALOG` ב־`packages/layout-api/src/errors.ts`, מוצאן ב־`ir.ts`, `ir-serialize.ts`, `typeset.ts`, `run-manifest.ts`, `decision-ledger.ts`.

| מפתח | פרמטרים | חומרה | תבנית עברית ראשונית |
|---|---|---|---|
| `errors.layoutir.INVALID_DOCUMENT` | issues | error | מסמך עימוד (IR) שגוי: {issues} |
| `errors.layoutir.INVALID_SERIALIZATION` | reason | error | סריאליזציה של IR שגויה: {reason} |
| `errors.layoutir.INVALID_REQUEST` | issues | error | בקשת עימוד שגויה: {issues} |
| `errors.layoutir.INVALID_MANIFEST` | issues | error | מניפסט ריצה שגוי: {issues} |
| `errors.layoutir.INVALID_LEDGER` | issues | error | פנקס החלטות שגוי: {issues} |
| `errors.layoutir.UNREGISTERED_FALLBACK` | code | fatal | קוד נפילה {code} אינו רשום — אין קוד צד |
| `errors.layoutir.INVALID_TRACE_LEVEL` | value | error | רמת trace שגויה: {value} |
| `errors.layoutir.INVALID_BUDGET` | issues | error | תקציב חיפוש שגוי: {issues} |

## layout-engine — מנוע v0 (שלב 33, פרק ה)

מקור: `LAYOUT_ENGINE_ERROR_CATALOG` ב־`packages/layout-engine/src/errors.ts`, מוצאם ב־`v0/v0-settings.ts`, `v0/typeset-v0.ts`, `linebreak/emergency.ts`, `pagination/state.ts`.

| מפתח | פרמטרים | חומרה | תבנית עברית ראשונית |
|---|---|---|---|
| `errors.engine.SETTING_INVALID` | key, reason | error | הגדרה שגויה למנוע: {key} — {reason} |
| `errors.engine.BODY_FONT_MISSING` | usage | error | לא סופק גופן פתור עבור {usage} |
| `errors.engine.SHAPING_MISMATCH` | where | fatal | חוסר התאמה בין shaping לאטומים: {where} |
| `errors.engine.BLOCK_ATOM_GAP` | blockId | fatal | פער בכיסוי האטומים של בלוק {blockId} |
| `errors.engine.NO_LEGAL_LINE_BREAK` | blockId, level | error | אין שבירת שורה חוקית לבלוק {blockId} גם ברמה {level} |
| `errors.engine.PAGINATION_STATE_INVALID` | action, reason | error | מצב/מעבר עימוד לא חוקי ({action}): {reason} |
| `errors.engine.CURSOR_INVALID` | cursor, issues | error | סמן תוכן שגוי ‎{cursor}‎: {issues} |

## cli — reference runner (שלב 34, פרק ה)

מקור: `CLI_ERROR_CATALOG` ב־`packages/cli/src/errors.ts`. כל שגיאה נושאת גם קוד יציאה מתועד (§12.2): 3 קלט · 4 גופן · 5 מנוע · 6 פלט · 7 ממצאי ביקורת (שלב 38).

| מפתח | פרמטרים | חומרה | תבנית עברית ראשונית |
|---|---|---|---|
| `errors.cli.INPUT_UNREADABLE` | path, reason | fatal | קריאת מסמך הקלט נכשלה: {path} — {reason} |
| `errors.cli.INPUT_INVALID` | path, reason | fatal | מסמך הקלט שגוי: {path} — {reason} |
| `errors.cli.SETTINGS_UNREADABLE` | path, reason | fatal | קריאת קובץ הגדרות נכשלה: {path} — {reason} |
| `errors.cli.SETTINGS_INVALID` | path, reason | fatal | הגדרות שגויות: {path} — {reason} |
| `errors.cli.REGISTRY_UNREADABLE` | path, reason | fatal | קריאת מרשם ההגדרות נכשלה: {path} — {reason} |
| `errors.cli.FONTS_MANIFEST_UNREADABLE` | path, reason | fatal | קריאת מניפסט הגופנים נכשלה: {path} — {reason} |
| `errors.cli.FONTS_MANIFEST_INVALID` | path, reason | fatal | מניפסט הגופנים שגוי: {path} — {reason} |
| `errors.cli.FONT_NOT_FOUND` | spec | fatal | גופן לא נמצא במניפסט: {spec} |
| `errors.cli.FONT_LOAD_FAILED` | file, reason | fatal | טעינת גופן נכשלה: {file} — {reason} |
| `errors.cli.PROVIDER_FAILED` | reason | fatal | בניית ספק המדידה נכשלה: {reason} |
| `errors.cli.ENGINE_FAILED` | code, reason | error | המנוע נכשל [{code}]: {reason} |
| `errors.cli.REPEAT_MISMATCH` | run, expected, actual | fatal | ריצה {run} נתנה hash שונה ({actual} ≠ {expected}) — לא דטרמיניסטי |
| `errors.cli.OUTPUT_WRITE_FAILED` | path, reason | fatal | כתיבת פלט נכשלה: {path} — {reason} |
| `errors.cli.AUDIT_FINDINGS` | high | error | הביקורת מצאה {high} ממצאי HIGH — הפריסה אינה עוברת שער (יציאה 7) |
| `errors.cli.ENGINE_LEGACY_LOCKED` | baseline | fatal | הרץ ה-legacy נעול לבייסליין הקפוא ({baseline}) — אין מסלול צד; differential בשלב 48 (יציאה 2) |

## worker-host — פרוטוקול ה-Worker (שלב 35, פרק ה)

מקור: `src/worker-host/engine-worker.ts` (צד המעטפת; §12.1 — אין ערוץ
שגיאה גלובלי, כל שגיאה קשורה ל-jobId ונושאת מפתח קטלוגי + params).

| מפתח | פרמטרים | חומרה | תבנית עברית ראשונית |
|---|---|---|---|
| `errors.worker.DUPLICATE_JOB` | jobId | fatal | job {jobId} כבר רץ בעובד — אין הרצה כפולה |
| `errors.worker.ENGINE_UNCLASSIFIED` | reason | fatal | שגיאת מנוע לא מקוטלגת ({reason}) — דווח לפיתוח |
