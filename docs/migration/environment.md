# סביבת ריצה נעולה — שלב 1 בתכנית 100 השלבים

**אסמכתא:** אפיון §2, §18-M0 · תכנית 100 השלבים, שלב 1 · מסמך מלווה: `docs/migration/source-manifest.json`

## Node ו-npm

| רכיב | ערך נעול | מנגנון |
|---|---|---|
| Node | 22 (עיקרי: v22.23.4) | `.nvmrc` + `engines.node` ב־`package.json` |
| npm | 10.x של Node 22 | `package-lock.json` (lockfileVersion 3) |
| התקנה | `npm ci` בלבד | ה־lockfile מחייב; אין `npm install` שמשנה נעילה |

מדדי ההצלחה שנבדקו בשלב זה: `npm ci` עובר תחת Node v22.23.4, וסקריפט האימות `scripts/migration/verify-source-manifest.mjs` ירוק.

## Playwright

- גרסה נעולה: **1.64.1** (דרך `package-lock.json`).
- היקף שימוש מותר: **בדיקות visual בלבד**. אף החלטת עימוד — שבירת שורה, מיקום, מספור או גובה — אינה נשענת על Playwright, על דפדפן או על מדידת Canvas בזמן ריצה (כללי 1–2 בתכנית). הליבה טהורה מדפדפן ורצה זהה ב־Node.js, ב־Worker וב־CLI.

## מדיניות בייסליין — אזהרת סביבה

**Orange רץ בסביבה שונה מקודמיו** (Yellow/Gold/Green/IMUD). לפיכך:

1. ריצות בייסליין להשוואה (שלב 3 ואילך) מופקות **רק** מ־`SUGINACH/Tora_Book_Typesetter_Orange` @ `93ad1e5704405fb2806a126ea1b519a35a87f378`.
2. **אין לערבב baselines** בין ענפים, בין מקורות או בין סביבות; פלט ממקור אחד אינו הופך ל־golden של מקור אחר.
3. מקורות אחרים (IMUD, Yellow, Gold, Green, Typesetter_doc) משמשים כמלאי דרישות וכתיעוד בלבד, ב־SHA הנעול שלהם במניפסט.

## מדיניות offline

ליבת המנוע אינה פונה לרשת בזמן ריצה (אין `fetch`, CDN, טעינת גופנים מרחוק או עדכונים). ההתקנה מתבצעת מה־lockfile בלבד, והבייסליין ניתן לשחזור offline במלואו (יוכח בשלב 3).

## פקודת אימות

```bash
node scripts/migration/verify-source-manifest.mjs
```

הסקריפט מאמת: מבנה המניפסט, קיום ונגישות כל SHA (מראה מקומית או GitHub API), התאמת `.nvmrc` מול `engines`, קיום ה־lockfile ונעילת גרסת Playwright.
