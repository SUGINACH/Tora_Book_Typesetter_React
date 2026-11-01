# נתוני Unicode 16.0.0 — הפקת טבלאות UAX #14 (שלב 27)

מקור: https://www.unicode.org/Public/16.0.0/ucd/ — הורדו ב־2026-11-01 ונעולים ב־SHA-256
(נרשמים ב־registry.json של test-fixtures ומאומתים במאמת השלב).

| קובץ | תפקיד |
|---|---|
| `LineBreak.txt` | מחלקות שבירת השורה לכל נקודת קוד (המקור הנורמטיבי) |
| `LineBreakTest.txt` | מבחני conformance הרשמיים (~8,400 מקרים) — ה־oracle |
| `EastAsianWidth.txt` | רוחב מזרח-אסייאתי — לתנאי ‎$EastAsian‎ (LB19a/LB21a/LB30) |
| `UnicodeData.txt` | קטגוריה כללית — לקבוצות ‎Pi/Pf‎ (LB15a/LB15b/LB19) ולפתרון ‎SA→CM/AL‎ (LB1) |
| `emoji-data.txt` | ‎Extended_Pictographic‎ — ל־LB30b |

הפקה: `node scripts/migration/gen-uax14-tables.mjs` ← `packages/measurement-api/src/uax14-tables.ts`
(דטרמיניסטי; הטבלאות המיוצרות כוללות את אפיון הגרסה וה־SHA של המקור).
