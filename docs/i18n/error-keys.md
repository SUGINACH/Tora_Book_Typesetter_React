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
| `errors.hash.UNSUPPORTED_TYPE` | type | error | ערך מסוג {type} אינו ניתן לסריאליזציה קנונית |
| `errors.hash.NON_FINITE_NUMBER` | value | error | מספר לא סופי אינו ניתן לסריאליזציה קנונית: {value} |
| `errors.hash.INVALID_LENGTH` | len | error | אורך קלט שגוי לגיבוב: {len} |

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

**כללי הוספה:** קוד חדש נרשם ב־`ERROR_CATALOG` בלבד (סטטי, קפוא); הוספה מלווה בשורה כאן ובבדיקה שהמפתח רשום. מפתחות אינם משתנים לאחר פרסום — שינוי משמעות מחייב קוד חדש.
