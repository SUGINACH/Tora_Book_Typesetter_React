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

**כללי הוספה:** קוד חדש נרשם ב־`ERROR_CATALOG` בלבד (סטטי, קפוא); הוספה מלווה בשורה כאן ובבדיקה שהמפתח רשום. מפתחות אינם משתנים לאחר פרסום — שינוי משמעות מחייב קוד חדש.
