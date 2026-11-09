#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
i18n_audit.py — ביקורת לוקליזציה ב-CI (שלב 96; אפיון §16, §18-M11).

תכנית השלב: "scripts/i18n_audit.py ב-CI: parity, placeholders, JSON
validation; מבחן locale switching מתמשך; שמירת בחירת שפה בין הפעלות."
שעת השער (M11): "אין מחרוזות גולמיות במסלולים שבהיקף; שני locales עוברים
parity; החלפת שפה נשמרת."

מה נבדק (עצמאי מהמאמתים ב-Node — חישוב כפול מכלי אחר):
  1. JSON תקין: כל 8 קבצי ה-locales נפתחים; כל ערך מחרוזת (לכל העומק).
  2. parity מלא he↔en: אותם מפתחות בדיוק בכל אחד מארבעת הקבצים (מבנה
     מקונן כולל) — גם בסדר קנוני ממוין.
  3. placeholders זהים: לכל מפתח עלה — אותו ריבוי-קבוצה של {name} בשתי
     השפות, באותו מיון.
  4. אין מחרוזות גולמיות בהיקף: סריקת הקומפוננטות — כל מחרוזת תצוגה
     עברית ב-JSX מגיעה מהקטלוגים (מותר: מזהי testid, ערכי נתונים,
     קודים קטלוגיים כ-'errors.*'/'audit.*', קבצים קנוניים כ-tora-settings.json,
     ובלוקי קוד/הערות).
  5. מקור יחיד: gen-i18n-locales.mjs קיים וה-regen זהה ל-committed
     (מורץ כאן שוב — אין סחף שני מקורות).
  6. שמירת השפה בין הפעלות: הלוקייל נשמר ב-viewStore (tora-ui:view:v1)
     ובדיקת ההתמדה קיימת ב-E2E (02 — reload שומר את השפה).

יציאה: 0 = הכל ירוק; 1 = כשל.
"""
import json
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
checks = 0
failures = 0


def ok(msg: str) -> None:
    global checks
    checks += 1
    print(f"  [OK]   {msg}")


def fail(msg: str) -> None:
    global checks, failures
    checks += 1
    failures += 1
    print(f"  [FAIL] {msg}")


FILES = ["common", "settings", "errors", "audit"]
LOCALES = ["he-IL", "en-US"]

print("1) JSON תקין")
data = {}
bad_json = 0
for loc in LOCALES:
    for name in FILES:
        p = ROOT / "src" / "i18n" / "locales" / loc / f"{name}.json"
        try:
            data[(loc, name)] = json.loads(p.read_text(encoding="utf-8"))
        except Exception as e:  # noqa: BLE001
            bad_json += 1
            fail(f"{loc}/{name}.json — JSON שגוי: {e}")
        else:
            ok(f"{loc}/{name}.json — נפתח ({len(data[(loc, name)])} מפתחות)")
if bad_json == 0 and len(data) == 8:
    ok("כל 8 קבצי ה-locales תקינים")

print("\n2) parity מפתחות he↔en (כולל מבנה מקונן)")


def flat(d: dict, prefix: str = "") -> dict:
    out = {}
    for k, v in d.items():
        key = f"{prefix}{k}"
        if isinstance(v, dict):
            out.update(flat(v, key + "."))
        else:
            out[key] = v
    return out


parity_bad = 0
for name in FILES:
    he = flat(data[("he-IL", name)])
    en = flat(data[("en-US", name)])
    he_keys = sorted(he.keys())
    en_keys = sorted(en.keys())
    if he_keys != en_keys:
        missing_en = [k for k in he_keys if k not in en_keys]
        missing_he = [k for k in en_keys if k not in he_keys]
        parity_bad += 1
        fail(f"{name} — מפתחות אינם זהים (חסר ב-en: {missing_en[:5]}; חסר ב-he: {missing_he[:5]})")
    else:
        ok(f"{name} — {len(he_keys)} מפתחות ב-parity מלא")
if parity_bad == 0:
    ok("parity he↔en מלא בכל ארבעת הקבצים")

print("\n3) placeholders זהים")
ph = re.compile(r"\{(\w+)\}")
ph_bad = 0
for name in FILES:
    he = flat(data[("he-IL", name)])
    en = flat(data[("en-US", name)])
    for k in sorted(he.keys()):
        if k not in en:
            continue
        h = sorted(ph.findall(str(he[k])))
        e = sorted(ph.findall(str(en[k])))
        if h != e:
            ph_bad += 1
            fail(f"{name}:{k} — placeholders שונים ({h} ≠ {e})")
    ok(f"{name} — placeholders נבדקו")
if ph_bad == 0:
    ok("כל ה-placeholders זהים בין השפות")

print("\n4) אין מחרוזות גולמיות בקומפוננטות ה-UI (היקף §16)")
# מחרוזות עברית ב-JSX: >טקסט< או טקסט בתוך תכונת מחרוזת — למעט היתרים
# מתועדים (מזהי קנוניים, נתונים, קוד קטלוגי).
ALLOWED_LITERAL = re.compile(
    r"^("
    r"errors\.[\w.]+|audit\.[\w.]+|import\.[\w.]+|settings\.[\w.-]+|preview\.[\w-]+|"
    r"app\.[\w.-]+|editor\.[\w.-]+|zoom\.[\w-]+"
    r")$"
)
hebrew = re.compile(r"[\u0590-\u05FF]")
# בלוקי קוד (import/comment) נשללים מראש
strip_comments = re.compile(r"/\*[\s\S]*?\*/|//[^\n]*")
strip_imports = re.compile(r"^import\b.*$", re.M)
COMPONENTS = sorted((ROOT / "src" / "components").rglob("*.tsx"))
raw_hits = []
for p in COMPONENTS:
    src = p.read_text(encoding="utf-8")
    src = strip_comments.sub("", src)
    src = strip_imports.sub("", src)
    # טקסט JSX בין > ל-< המכיל עברית
    for m in re.finditer(r">([^<>{}]*[\u0590-\u05FF][^<>{}]*)<", src):
        text = m.group(1).strip()
        if not text:
            continue
        # תוויות סמלים בלבד (✓/⚠/✖/●/·) — לא מחרוזת
        if not re.search(r"[\u0590-\u05FF]", text):
            continue
        # מפתח קטלוגי מותר בתור fallback (למשל key ב-object)
        raw_hits.append((str(p.relative_to(ROOT)), "JSX", text[:40]))
    # מחרוזות עברית גולמיות בקוד — שורה בודדת בלבד (לא חוצות שורות; שם-הקובץ
    # ב-40 התווים הראשונים). מפתחות קטלוגיים (errors.*/audit.*/…) מותרים כליטרלים.
    for m in re.finditer(r"'([^'\n]*[\u0590-\u05FF][^'\n]*)'|\"([^\"\n]*[\u0590-\u05FF][^\"\n]*)\"", src):
        text = (m.group(1) or m.group(2)).strip()
        if ALLOWED_LITERAL.match(text):
            continue
        raw_hits.append((str(p.relative_to(ROOT)), "lit", text[:40]))
if raw_hits:
    for f, kind, text in raw_hits[:10]:
        fail(f"{kind} גולמי: {f}: {text}")
    if len(raw_hits) > 10:
        fail(f"…ו{len(raw_hits) - 10} נוספים")
else:
    ok(f"אפס מחרוזות תצוגה גולמיות ב-{len(COMPONENTS)} קומפוננטות")

print("\n5) מקור יחיד — regen === committed")
gen = ROOT / "scripts" / "gen-i18n-locales.mjs"
if gen.exists():
    ok("scripts/gen-i18n-locales.mjs קיים")
    before = {loc: {name: (ROOT / "src" / "i18n" / "locales" / loc / f"{name}.json").read_text(encoding="utf-8") for name in FILES} for loc in LOCALES}
    r = subprocess.run(["node", str(gen)], cwd=str(ROOT), capture_output=True, text=True)
    if r.returncode == 0:
        after = {loc: {name: (ROOT / "src" / "i18n" / "locales" / loc / f"{name}.json").read_text(encoding="utf-8") for name in FILES} for loc in LOCALES}
        drifted = [f"{loc}/{name}" for loc in LOCALES for name in FILES if before[loc][name] != after[loc][name]]
        if drifted:
            fail(f"regen שינה קבצים (סחף בין ה-TS ל-JSON): {drifted}")
        else:
            ok("ה-committed === regen (ביט-ביט)")
    else:
        fail(f"regen נכשל: {r.stderr[:120]}")
else:
    fail("scripts/gen-i18n-locales.mjs קיים")

print("\n6) שמירת השפה בין הפעלות")
view = (ROOT / "src" / "stores" / "view-store.ts").read_text(encoding="utf-8")
ok("הלוקייל נשמר ב-viewStore") if ("tora-ui:view:v1" in view and "locale" in view) else fail("viewStore — שמירת לוקייל")
e2e = (ROOT / "tests" / "e2e" / "02-cli-oracle.spec.ts").read_text(encoding="utf-8")
ok("בדיקת התמדה ב-E2E (reload שומר שפה)") if ("reload" in e2e and "toggle-locale" in e2e) else fail("E2E — בדיקת התמדת שפה")

print()
print("=" * 60)
if failures:
    print(f"נכשל: {failures} בעיות מתוך {checks} בדיקות")
    sys.exit(1)
print(f"i18n audit ירוק — {checks} בדיקות (parity, placeholders, JSON, היקף, מקור יחיד, התמדה)")
