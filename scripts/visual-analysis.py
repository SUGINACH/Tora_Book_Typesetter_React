#!/usr/bin/env python3
"""
ניתוח ויזואלי של עמודי ספר באמצעות Ollama (מקומי, חינמי, offline).

דרישות:
  1. התקן Ollama מ-https://ollama.com
  2. הורד מודל ראייה: ollama run llama3.2-vision
  3. pip install ollama playwright
  4. playwright install chromium

שימוש:
  python3 scripts/visual-analysis.py <url> [--output dir]

דוגמה:
  python3 scripts/visual-analysis.py http://localhost:4173 --output analysis
"""

import sys
import os
import subprocess
import json
from pathlib import Path

def take_screenshots(url: str, output_dir: str) -> list[str]:
    """צילום מסך של כל עמוד באמצעות Playwright."""
    os.makedirs(output_dir, exist_ok=True)

    script = f"""
    const {{ chromium }} = require('@playwright/test');
    (async () => {{
      const browser = await chromium.launch({{ headless: true }});
      const page = await browser.newPage({{ viewport: {{ width: 1280, height: 900 }} }});
      await page.addInitScript(() => localStorage.clear());
      await page.goto('{url}');
      await page.waitForSelector('h1');
      // מילוי טקסט ברירת מחדל
      const textarea = page.locator('textarea').first();
      const testText = `שם הספר - ספר בדיקה\\nשם המחבר - מחבר\\n\\nכותרת 2 מספר 1 - פרק ראשון\\n\\n${{Array.from({{length: 10}}, (_, i) => `פסקה מספר ${{i + 1}} שמכילה מספר משפטים לבדיקת עימוד עם הרבה מילים וטקסט ארוך יחסית כדי לראות את השורות השבורות והטורים בעמוד המרונדר.`).join('\\\\n\\\\n')}}\\n\\nכותרת 2 מספר 2 - פרק שני\\n\\n${{Array.from({{length: 6}}, (_, i) => `עוד פסקה מספר ${{i + 1}} בפרק השני.`).join('\\\\n\\\\n')}}`;
      await textarea.fill(testText);
      await page.locator('button', {{ hasText: /עדכן/ }}).first().click();
      await page.waitForSelector('.tora-page', {{ timeout: 60000 }});
      await page.waitForTimeout(3000);

      const pages = await page.locator('.tora-page').all();
      const screenshots = [];
      for (let i = 0; i < Math.min(pages.length, 10); i++) {{
        const path = `{output_dir}/page-${{i + 1}}.png`;
        await pages[i].screenshot({{ path }});
        screenshots.push(path);
        console.log(`Saved: ${{path}}`);
      }}
      await browser.close();
    }})();
    """

    # כתיבת הסקריפט לקובץ זמני
    script_path = os.path.join(output_dir, '_screenshot.js')
    with open(script_path, 'w') as f:
        f.write(script)

    # הרצה
    result = subprocess.run(['npx', 'tsx', script_path], capture_output=True, text=True)
    print(result.stdout)
    if result.stderr:
        print("STDERR:", result.stderr)

    # איסוף רשימת תמונות
    screenshots = sorted([
        os.path.join(output_dir, f) for f in os.listdir(output_dir)
        if f.startswith('page-') and f.endswith('.png')
    ])
    return screenshots


def analyze_with_ollama(image_path: str) -> str:
    """ניתוח תמונה עם Ollama (מודל ראייה מקומי)."""
    try:
        import ollama
    except ImportError:
        return "שגיאה: התקן pip install ollama"

    prompt = (
        "You are an expert typography and book layout analyzer. "
        "The developer of this software is blind and needs an exact, objective description "
        "of the visual layout in this screenshot. Please check and report on:\n"
        "1. Margins: Are the top, bottom, left, and right margins symmetrical and correct?\n"
        "2. Text overlapping: Is there any text running into borders, overflowing, or overlapping?\n"
        "3. Elements placement: Are page numbers, headers, and footers positioned correctly?\n"
        "4. Line spacing and justification: Does the text spacing look uniform and balanced?\n"
        "5. Two columns: Is the text properly split into two columns? Are they balanced?\n"
        "6. Empty space: Is there excessive empty space anywhere on the page?\n"
        "Please be direct and specific about any visual flaws. Answer in Hebrew."
    )

    try:
        response = ollama.chat(
            model='llama3.2-vision',
            messages=[{
                'role': 'user',
                'content': prompt,
                'images': [image_path]
            }]
        )
        return response['message']['content']
    except Exception as e:
        return f"שגיאה בניתוח: {e}"


def main():
    if len(sys.argv) < 2:
        print("שימוש: python3 scripts/visual-analysis.py <url> [--output dir]")
        print("דוגמה: python3 scripts/visual-analysis.py http://localhost:4173")
        sys.exit(1)

    url = sys.argv[1]
    output_dir = 'analysis'

    # פרסור ארגומנטים
    if '--output' in sys.argv:
        idx = sys.argv.index('--output')
        if idx + 1 < len(sys.argv):
            output_dir = sys.argv[idx + 1]

    print(f"=== ניתוח ויזואלי של {url} ===")
    print(f"תיקיית פלט: {output_dir}")
    print()

    # שלב 1: צילום מסך
    print("שלב 1: צילום מסך של כל עמוד...")
    screenshots = take_screenshots(url, output_dir)
    print(f"צולמו {len(screenshots)} עמודים")
    print()

    # שלב 2: ניתוח עם Ollama
    print("שלב 2: ניתוח ויזואלי עם Ollama (llama3.2-vision)...")
    results = {}
    for img in screenshots:
        print(f"\nמנתח: {img}")
        analysis = analyze_with_ollama(img)
        results[img] = analysis
        print(analysis)
        print("---")

    # שלב 3: שמירת תוצאות
    results_path = os.path.join(output_dir, 'analysis.json')
    with open(results_path, 'w', encoding='utf-8') as f:
        json.dump(results, f, ensure_ascii=False, indent=2)
    print(f"\nתוצאות נשמרו: {results_path}")


if __name__ == '__main__':
    main()
