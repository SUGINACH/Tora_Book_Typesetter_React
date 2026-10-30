# בייסליין ריצה של המנוע הישן — שלב 3 בתכנית 100 השלבים

**מקור:** `SUGINACH/Tora_Book_Typesetter_Orange` @ `93ad1e5704405fb2806a126ea1b519a35a87f378` (הבייסליין הנעול) · **אסמכתא:** אפיון §18-M0 · תכנית 100 השלבים, שלב 3.

## מה יש כאן

| Artifact | קלט | עמודים | ממצאים (H/M/L) | מצב |
|---|---|---|---|---|
| `canonical.json.gz` | `very_long_test_text.txt` (המסמך הקנוני) | 639 | 0/11/28 | עקבי בין-הרצות; דטרמיניזם פנימי PASS |
| `canonical-run2.json.gz` | זהה (הרצה שנייה) | 639 | 0/11/28 | זהה לחלוטין לאחר נרמול שדות זמן |
| `mid.json.gz` | `mid_long_test_text.txt` | 125 | 0/4/11 | אודיט מלא (step-by-step) |
| `ch63.json.gz` | `fixtures/ch63_final_paragraph_failure_case.txt` | 8 | 0/2/1 | מקרה הכשל המתועד |
| `twocol.json.gz` | `tests/fixtures/no-legal-two-column-split.txt` | 4 | 0/1/1 | מקרה פיצול טורים |
| `smoke.json.gz` | `tests/fixtures/geometry-audit-smoke.txt` | 6 | 0/2/1 | אימות צינור |

`baseline-run.json` — הרשומה הראשית: סביבה נעולה, שורות פקודה, SHA-256 של כל קלט/הגדרות/גופנים/פלט, מדדי זמן וזיכרון (ייחוס בלבד), והוכחת העקביות.

## שדות דטרמיניזם

שלושה שדות זמן-ריצה בלבד נורמלו לפני השוואה: `run.generatedAt`, `run.renderMs`, `geometry.stats.extractMs`. ההשוואה העמוקה בין שתי הרצות הקנוניות לא מצאה אף הבדל מבני.

## אימון

```bash
node scripts/migration/verify-baseline-run.mjs
```

## שחזור (offline)

מראה של Orange ב־SHA הנעול ← `npm ci` ← הרצת שורות ה־CLI המתועדות ב־`baseline-run.json` תחת Node v22.23.4, Playwright 1.55.0, Chromium build v1187. ה־offline guard של ה־CLI מוודא שאין בקשות רשת חיצוניות (קוד יציאה 7 אחרת).

**אזהרה:** אין לערבב baselines בין ענפים או סביבות — ראו `docs/migration/environment.md`.
