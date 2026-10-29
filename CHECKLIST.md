# צ'קליסט עבודה — Tora_Book_Typesetter_React

**כלל:** אחרי כל תיקון → בניה → בדיקה → דחיפה.

---

## בדיקות אוטומטיות (אחרי כל שינוי)

- [ ] `npx tsc --noEmit` — TypeScript נקי
- [ ] `npm run build` — בניה עוברת
- [ ] `npx vitest run` — כל בדיקות unit ירוקות
- [ ] `npx tsx scripts/check-full.ts` — בדיקת DOM בדפדפן (Playwright)

## בדיקות DOM בדפדפן (מתוך check-full.ts)

- [ ] אין overflow (0/N עמודים גולשים)
- [ ] tora-line מופיע בכל פסקה (0 פסקאות ללא tora-line)
- [ ] nowrap פעיל (100% מהשורות)
- [ ] שורות לפסקה > 1 (לא כל פסקה בשורה אחת)
- [ ] אין `<?xml>` גולמי ב-HTML
- [ ] סיידנוטים מחולקים (לא כולן בעמוד אחד)

## מצב נוכחי (2026-10-29)

### מה עובד ✅
1. CanvasMeasurer — מדידת טקסט אמיתית עם Canvas API
2. breakLines — שבירת שורות ידנית (3.6 שורות לפסקה)
3. tora-line + white-space:nowrap — נטרול השפעת הדפדפן
4. stripSvgXmlDeclaration — הסרת `<?xml?>` מ-SVG
5. Sidenote distribution — 1 סיידנוט לעמוד
6. Chapter-opener with content — פסקאות מופיעות (לא רק כותרת)
7. fixWidowsAndOrphans — מימוש אמיתי
8. balanceColumnsInPage — אלגוריתם דו-שלבי
9. paren-protector — הגנת סוגריים
10. text-completeness audit — וידוא שלמות טקסט
11. trace-logger + trace-store + input-declaration
12. V21 audit checks (heading-escort, page-underfill, block-gap, multiple-blocks)
13. editorial-note-parser — לא מוחק שורות ריקות
14. targetHeight 0.92 — ניצול מירבי של עמוד
15. 75 בדיקות unit

### מה לא עובד ❌
1. ייצוא HTML — לא תואם לתצוגה החיה (צריך בדיקה)
2. ייצוא PDF — לא עובד (המשתמש דיווח)
3. GitHub Pages — מכיל build ישן (צריך deploy)
4. Web Worker — לא מחובר (עדיין sync ב-main thread)
5. Playwright e2e config — לא מוגדר
6. CI workflow — לא קיים

### מה חסר ⚠️
1. עיטורי H2/H3 מלאים (סטים, סגנונות, מימדים)
2. רקעים לעמודים (regular, h0Open, h2Open)
3. מפריד חלקים (section-divider)
4. shaar builder (SVG מותאם עם margins)
5. TOC fonts by level
6. aq-word-spacing / aq-para-spacing / aq-line-height
7. page-num-initial-value
8. hdr-divider-style + hdr-* גופנים
9. fn-layout-mode
10. note-body font size

---

## סדר עדיפויות לתיקון

### דחוף (גורם למסמך לא תקין)
1. ❌ ייצוא HTML לא תואם לתצוגה — בדוק מה ההבדל
2. ❌ ייצוא PDF לא עובד — תקן את window.print()
3. ❌ GitHub Pages ישן — דחוף build חדש

### חשוב (תכונות חסרות)
4. ⚠️ עיטורי H2/H3 — מערכת מלאה
5. ⚠️ רקעים לעמודים
6. ⚠️ מפריד חלקים
7. ⚠️ shaar builder

### רצוי (איכות)
8. ⚠️ Web Worker אמיתי
9. ⚠️ CI workflow
10. ⚠️ Playwright e2e
