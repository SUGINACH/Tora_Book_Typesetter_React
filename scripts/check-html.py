#!/usr/bin/env python3
"""
בדיקה מקיפה של HTML מיוצא — כל עמוד, כל טור, כל בלוק, כל שורה.
קורא את ה-HTML הגולמי ומחשב גדלים ללא דפדפן.

שימוש: python3 scripts/check-html.py <html-file>
דוגמה: python3 scripts/check-html.py /tmp/exported-long.html
"""

import sys
import re
import json
from pathlib import Path

# חישוב רוחב טקסט משוער (כמו SimulatedMeasurer)
def estimate_text_width(text, font_size=12):
    """רוחב משוער בפיקסלים — 0.55px לתו עברי, 0.3px לרווח."""
    width = 0
    for ch in text:
        if ch == ' ':
            width += font_size * 0.3
        elif '\u0590' <= ch <= '\u05FF':
            width += font_size * 0.55
        elif 'a' <= ch <= 'z' or 'A' <= ch <= 'Z':
            width += font_size * 0.45
        elif '0' <= ch <= '9':
            width += font_size * 0.5
        else:
            width += font_size * 0.5
    return width

# חישוב רוחב טור (מהגדרות ברירת מחדל)
PX_PER_MM = 3.7795
PAGE_WIDTH_PX = 210 * PX_PER_MM  # 793.7
MARGIN_PX = 25 * PX_PER_MM  # 94.5
PADDING_PX = 25 * PX_PER_MM  # 94.5
TEXT_AREA_WIDTH = PAGE_WIDTH_PX - 2 * PADDING_PX  # 604.7
MARGIN_WIDTH_PX = (10 / 100) * TEXT_AREA_WIDTH  # 60.5
TEXT_MAIN_WIDTH = TEXT_AREA_WIDTH - 2 * MARGIN_WIDTH_PX  # 483.7
GAP_PX = TEXT_MAIN_WIDTH * 0.05  # 24.2
COLUMN_WIDTH_PX = (TEXT_MAIN_WIDTH - GAP_PX) / 2  # 229.8
LINE_HEIGHT_PX = 12 * 1.45  # 17.4
TARGET_HEIGHT_PX = (297 * PX_PER_MM - 2 * MARGIN_PX) * 0.80  # ~745px

def parse_html(html):
    """פרסור HTML לרשימת עמודים עם טורים, בלוקים, שורות."""
    pages = []
    
    # מצא את כל העמודים
    page_pattern = r'<div class="tora-page[^"]*"(?:\s+data-page="(\d+)")?(?:\s+data-page-type="([^"]*)")?[^>]*>([\s\S]*?)(?=<div class="tora-page|</body>)'
    
    for match in re.finditer(page_pattern, html):
        page_num = int(match.group(1)) if match.group(1) else 0
        page_type = match.group(2) or 'unknown'
        page_content = match.group(3)
        
        page = {
            'num': page_num,
            'type': page_type,
            'columns': [],
            'issues': [],
        }
        
        # מצא טורים
        col_pattern = r'<div class="tora-column tora-column-(right|left)"[^>]*>([\s\S]*?)</div>\s*(?:<div class="tora-column-divider|</div>\s*</div>)'
        for col_match in re.finditer(col_pattern, page_content):
            side = col_match.group(1)
            col_content = col_match.group(2)
            
            column = {
                'side': side,
                'blocks': [],
                'height': 0,
                'issues': [],
            }
            
            # מצא בלוקים (tora-body-text או tora-heading)
            block_pattern = r'<(?:div|p) class="tora-(body-text|heading)[^"]*"[^>]*>([\s\S]*?)</(?:div|p)>'
            for block_match in re.finditer(block_pattern, col_content):
                block_type = block_match.group(1)
                block_content = block_match.group(2)
                
                block = {
                    'type': block_type,
                    'lines': [],
                    'height': 0,
                    'issues': [],
                }
                
                # מצא שורות (tora-line)
                line_pattern = r'<span class="tora-line[^"]*"[^>]*>([\s\S]*?)</span>'
                for line_match in re.finditer(line_pattern, block_content):
                    line_text = re.sub(r'<[^>]+>', '', line_match.group(1))
                    line_text = line_text.replace('&amp;', '&').replace('&lt;', '<').replace('&gt;', '>').replace('&quot;', '"').replace('&#039;', "'").replace('&nbsp;', ' ').strip()
                    
                    estimated_width = estimate_text_width(line_text)
                    
                    block['lines'].append({
                        'text': line_text,
                        'width': estimated_width,
                        'word_count': len(line_text.split()),
                        'issues': [],
                    })
                
                # חשב גובה בלוק
                block['height'] = len(block['lines']) * LINE_HEIGHT_PX
                
                # בדיקות בלוק
                if block_type == 'body-text':
                    if len(block['lines']) == 0:
                        block['issues'].append('בלוק ריק (0 שורות)')
                    elif len(block['lines']) == 1:
                        block['issues'].append(f'בלוק בשורה אחת בלבד')
                    
                    # בדיקת שורות דלילות
                    for i, line in enumerate(block['lines']):
                        if line['width'] < COLUMN_WIDTH_PX * 0.3 and i < len(block['lines']) - 1:
                            line['issues'].append(f'שורה דלילה: {line["width"]:.0f}px (רוחב טור: {COLUMN_WIDTH_PX:.0f}px)')
                        if line['width'] > COLUMN_WIDTH_PX * 1.05:
                            line['issues'].append(f'שורה חורגת: {line["width"]:.0f}px > {COLUMN_WIDTH_PX:.0f}px')
                
                column['blocks'].append(block)
                column['height'] += block['height']
            
            page['columns'].append(column)
        
        # בדיקות עמוד
        total_height = sum(c['height'] for c in page['columns'])
        if page['type'] in ('regular', 'chapter-opener'):
            if total_height > TARGET_HEIGHT_PX:
                page['issues'].append(f'overflow: {total_height:.0f}px > {TARGET_HEIGHT_PX:.0f}px')
            if total_height < TARGET_HEIGHT_PX * 0.3:
                page['issues'].append(f'עמוד ריק: {total_height:.0f}px < {TARGET_HEIGHT_PX * 0.3:.0f}px')
            
            # בדיקת איזון טורים
            if len(page['columns']) == 2:
                diff = abs(page['columns'][0]['height'] - page['columns'][1]['height'])
                if diff > 50:
                    page['issues'].append(f'איזון: פער {diff:.0f}px בין טורים')
            elif len(page['columns']) == 1 and page['columns'][0]['blocks']:
                page['issues'].append('עמוד עם טור אחד בלבד')
            elif len(page['columns']) == 0 and page['type'] == 'regular':
                page['issues'].append('עמוד ללא טורים')
        
        # בדיקת tora-single-column ב-H2
        if page['type'] == 'chapter-opener' and 'tora-single-column' in page_content:
            page['issues'].append('H2 עם tora-single-column (אסור!)')
        
        pages.append(page)
    
    return pages

def main():
    html_file = sys.argv[1] if len(sys.argv) > 1 else '/tmp/exported-long.html'
    
    if not Path(html_file).exists():
        print(f'קובץ לא נמצא: {html_file}')
        sys.exit(1)
    
    html = Path(html_file).read_text(encoding='utf-8')
    print(f'גודל HTML: {len(html)} תווים')
    print(f'רוחב טור מחושב: {COLUMN_WIDTH_PX:.1f}px')
    print(f'גובה עמוד יעד: {TARGET_HEIGHT_PX:.1f}px')
    print(f'גובה שורה: {LINE_HEIGHT_PX:.1f}px')
    print()
    
    pages = parse_html(html)
    print(f'סה"כ עמודים: {len(pages)}')
    
    total_issues = 0
    issue_types = {}
    
    for page in pages:
        page_issues = list(page['issues'])
        
        for col in page['columns']:
            page_issues.extend(col['issues'])
            
            for block in col['blocks']:
                page_issues.extend(block['issues'])
                
                for line in block['lines']:
                    page_issues.extend(line['issues'])
        
        if page_issues:
            total_issues += len(page_issues)
            for issue in page_issues:
                # סווג
                category = issue.split(':')[0].split('(')[0].strip()
                issue_types[category] = issue_types.get(category, 0) + 1
            
            # הדפס רק 5 בעיות ראשונות לעמוד
            print(f'\nעמוד {page["num"]} ({page["type"]}): {len(page_issues)} בעיות')
            for issue in page_issues[:5]:
                print(f'  ❌ {issue}')
            if len(page_issues) > 5:
                print(f'  ... ועוד {len(page_issues) - 5} בעיות')
    
    print(f'\n{"="*50}')
    print(f'סיכום: {total_issues} בעיות בסה"כ')
    print(f'\nסיווג:')
    for cat, count in sorted(issue_types.items(), key=lambda x: -x[1]):
        print(f'  {cat}: {count}')
    
    # סטטיסטיקות
    print(f'\nסטטיסטיקות:')
    total_blocks = sum(len(b['blocks']) for p in pages for b in p['columns'])
    total_lines = sum(len(l['lines']) for p in pages for b in p['columns'] for l in b['blocks'])
    print(f'  בלוקים: {total_blocks}')
    print(f'  שורות: {total_lines}')
    if total_blocks > 0:
        print(f'  שורות לבלוק: {total_lines / total_blocks:.1f}')

if __name__ == '__main__':
    main()
