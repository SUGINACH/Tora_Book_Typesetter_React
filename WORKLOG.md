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
