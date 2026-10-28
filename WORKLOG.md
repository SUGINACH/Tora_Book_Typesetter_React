# Worklog — Tora Book Typesetter React

## 2026-10-29

### Commit: shaar JSON loading + back-shaar position fix + WORKLOG
- **תיקון קריטי**: שער אחורי הועבר מסוף הספר לעמוד 2 (גב השער הראשי)
- **שינוי תפיסה**: עיצובי שערים אינם מוטמעים בקוד — נטענים מ-JSON חיצוני (SVG)
- נוסף `src/lib/shaar-loader.ts` — טוען shaar_main/back/sub.json עם cache
- נוסף `ShaarDesignData` interface — מעביר עיצובי SVG לרינדור
- `renderer.ts`: `renderShaarPage` משתמש ב-SVG מ-JSON כרקע
- `useTypesetter.ts`: טוען shaar designs לפני עימוד
- CSS: הוסרו כל עיצובי השער המוטמעים, הוחלפו ב-overlay על SVG
- **כלל חדש**: בכל commit — עדכון WORKLOG
- **כלל חדש**: אחרי build מוצלח — בדיקת האתר ב-Pages

### Commit: full settings panel — shaar selector, template save/load, notes, headers
- **עיצובי שער**: בורר dropdown ל-32 עיצובי שער ראשי, 27 אחורי, 27 משנה
- **תבנית**: שמירת/טעימת הגדרות ל-JSON + איפוס לברירת מחדל
- **כותרות עליונות**: מתחלפות (Recto/Verso), חצי-חצי, תוכן ימין/מרכז/שמאל
- **הערות**: קו מפריד (5 סוגים), מספור (3 סגנונות), חלוקת טורים, איפוס מונה
- **גופן**: משפחה, גודל, ריווח שורות (slider), מילה ראשונה, דיבור המתחיל
- **שוליים**: 4 שוליים נפרדים (top/bottom/inner/outer)
- **גריד**: רוחב טור + רווח מרכזי (sliders), קו מפריד
- **איכות**: טוגלים לאלמנה/יתום
- **מספר עמוד**: פורמט (3) + מסגרת (5)

### Commit: running header half-half + alternating recto/verso
- **חצי-חצי**: פיצול שם הספר (מספר מילים זוגי) בין ימין ושמאל
  בעמוד ימני: חצי ראשון בימין, שני בשמאל
  בעמוד שמאלי: התחלפות
- **מתחלפות (Recto/Verso)**: החלפת תוכן ימין/שמאל בעמודים זוגיים
- **תוכן לכל אזור**: שם ספר / שם פרק / מספר עמוד — נבחר מהגדרות

### Commit: determinism tests + audit
- **בדיקת דטרמיניזם אוטומטית** (6 בדיקות):
  1. parseDocument: אותו קלט → אותו sourceHash
  2. parseDocument: אותו AST (deep equal)
  3. typesetDocument: אותו hash פלט בשתי ריצות
  4. typesetDocument: אותו מספר עמודים
  5. typesetDocument: אותו ממצאים
  6. parser: מזהי צמתים דטרמיניסטיים (ללא random)
- **ביקור קוד**: אין side effects ב-engine/parser (אין DOM/fetch/console)
- **ביקור קוד**: אין crypto.randomUUID (הוחלף ב-IDs דטרמיניסטיים)
- **ביקור קוד**: performance.now רק למדידת זמן — אינו משפיע על הפלט
- סהכ: 10 בדיקות עוברות (6 דטרמיניזם + 4 גיממומ)

### Commit: expanded audit (5 checks) + determinism verified
- **מבקר גיאומממטריה מורחב** (5 בדיקות):
  1. איזון טורים (פער > 30px = MEDIUM, > 60px = HIGH)
  2. overflow (טור גולש מעבר לגובה זמין = HIGH)
  3. אלמנות/יתומים (שורה בודדת בטור = HIGH)
  4. שורות דלילות (יחס p-end/p-cut גבוה = LOW)
  5. כותרות תלויות (כותרת בסוף טור = HIGH)
- כל בדיקות הגיאומממטריה הן pure functions — קוראות את העמודים, אינן משנות
- 10 בדיקות יחידה עוברות (6 דטרמיניזם + 4 גיממומ)
