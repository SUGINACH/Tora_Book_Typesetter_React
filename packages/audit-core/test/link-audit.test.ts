/**
 * link-audit.test.ts — בדיקות שלב 72: הביקורת הסמנטית על כל target
 * (אפיון §14.2; פרק ט/M8).
 *
 * מה מוכח כאן:
 *   1. דוח תקין — כל היעדים קיימים, שני הכיוונים, המזהים הנגזרים ⇒ ok=true.
 *   2. קישור שבור — יעד שאינו במלאי ⇒ LINK_TARGET_MISSING HIGH ⇒ ok=false.
 *   3. מזהה זר — linkId שאינו הנגזרת ⇒ LINK_ID_FOREIGN (אכיפת "אין ids
 *      תלויי סדר ריצה אקראי").
 *   4. כפילות ⇒ LINK_DUPLICATE.
 *   5. חד-כיווניות — הערה בלי חזרה / TOC בלי חזרה ⇒ ONE_WAY.
 *   6. קישור חיצוני שלא לפי מדיניות ⇒ LINK_EXTERNAL_POLICY.
 *   7. אי-התאמת עמוד מול ה-AnchorTable ⇒ LINK_PAGE_MISMATCH (MEDIUM).
 *   8. שליליים — קלט שגוי ⇒ INVALID_INPUT; קוד ממצא לא רשום ⇒ זריקה.
 */
import { describe, expect, test } from 'vitest';
import {
  buildAnchorTable,
  buildLinkTable,
  makeLinkId,
  type LinkEndpoint,
  type LinkRecord,
} from '@tora/layout-api';
import { auditLinks, LINK_AUDIT_FINDING_CODES } from '../src/link-audit.js';

const anchors = buildAnchorTable([
  { targetId: 'h1|1', kind: 'heading', pageKind: 'shaar', physicalPage: 1 },
  { targetId: 'h2|1', kind: 'heading', pageKind: 'body', physicalPage: 4 },
  { targetId: 'n1', kind: 'note', pageKind: 'notes', physicalPage: 12 },
]);
const inv = {
  anchors,
  noteIds: ['n1', 'n2'],
  headingIds: ['h1|1', 'h2|1'],
  bodyBlockIds: ['p1'],
  anchorIds: ['toc:h2|1'],
};

const bodyP1: LinkEndpoint = { kind: 'block', id: 'p1' };
const noteN1: LinkEndpoint = { kind: 'note', id: 'n1', physicalPage: 12 };
const noteN2: LinkEndpoint = { kind: 'note', id: 'n2', physicalPage: 13 };
const fwdN1: LinkRecord = { linkId: makeLinkId('note', bodyP1, noteN1), kind: 'note', source: bodyP1, target: noteN1 };
const backN1: LinkRecord = { linkId: makeLinkId('note-back', noteN1, bodyP1), kind: 'note-back', source: noteN1, target: bodyP1 };
const fwdN2: LinkRecord = { linkId: makeLinkId('note', bodyP1, noteN2), kind: 'note', source: bodyP1, target: noteN2 };
const backN2: LinkRecord = { linkId: makeLinkId('note-back', noteN2, bodyP1), kind: 'note-back', source: noteN2, target: bodyP1 };
const tocAnchor: LinkEndpoint = { kind: 'anchor', id: 'toc:h2|1' };
const headingH2: LinkEndpoint = { kind: 'heading', id: 'h2|1', pageKind: 'body', physicalPage: 4 };
const fwdToc: LinkRecord = { linkId: makeLinkId('toc', tocAnchor, headingH2), kind: 'toc', source: tocAnchor, target: headingH2 };
const backToc: LinkRecord = { linkId: makeLinkId('toc-back', headingH2, tocAnchor), kind: 'toc-back', source: headingH2, target: tocAnchor };

const codes = (report: { findings: readonly { readonly code: string }[] }): string[] => report.findings.map((f) => f.code);

describe('שלב 72: auditLinks — הביקורת הסמנטית על כל target (§14.2)', () => {
  test('דוח תקין — כל היעדים קיימים, שני הכיוונים, מזהים נגזרים ⇒ ok=true, אפס ממצאים', () => {
    const links = buildLinkTable([fwdN1, backN1, fwdN2, backN2, fwdToc, backToc]);
    const report = auditLinks(links, inv);
    expect(report.ok).toBe(true);
    expect(report.findings).toHaveLength(0);
    expect(report.stats.links).toBe(6);
    expect(report.stats.byKind['note']).toBe(2);
    expect(report.stats.byKind['note-back']).toBe(2);
    expect(report.stats.byKind['toc']).toBe(1);
    expect(report.stats.byKind['toc-back']).toBe(1);
  });

  test('קישור שבור — יעד שאינו בשום מלאי ⇒ LINK_TARGET_MISSING HIGH ⇒ ok=false', () => {
    const ghostNote: LinkEndpoint = { kind: 'note', id: 'ghost-note', physicalPage: 99 };
    const broken: LinkRecord = { linkId: makeLinkId('note', bodyP1, ghostNote), kind: 'note', source: bodyP1, target: ghostNote };
    const links = buildLinkTable([broken]);
    const report = auditLinks(links, inv);
    expect(report.ok).toBe(false);
    expect(codes(report)).toContain('audit.links.LINK_TARGET_MISSING');
    const f = report.findings.find((x) => x.code === 'audit.links.LINK_TARGET_MISSING')!;
    expect(f.severity).toBe('HIGH');
    expect(f.params.target).toBe('ghost-note');
  });

  test('כותרת שבורה בקישור TOC ⇒ LINK_TARGET_MISSING (היעד heading אינו קיים)', () => {
    const ghostHeading: LinkEndpoint = { kind: 'heading', id: 'h9|9' };
    const broken: LinkRecord = { linkId: makeLinkId('toc', tocAnchor, ghostHeading), kind: 'toc', source: tocAnchor, target: ghostHeading };
    const report = auditLinks(buildLinkTable([broken]), inv);
    expect(report.ok).toBe(false);
    expect(codes(report)).toContain('audit.links.LINK_TARGET_MISSING');
  });

  test('מזהה זר — linkId שאינו הנגזרת הקנונית ⇒ LINK_ID_FOREIGN (אין ids תלויי סדר ריצה)', () => {
    const foreign: LinkRecord = { ...fwdN1, linkId: 'link:generated-at-runtime:17' };
    const report = auditLinks(buildLinkTable([foreign, backN1]), inv);
    expect(report.ok).toBe(false);
    expect(codes(report)).toContain('audit.links.LINK_ID_FOREIGN');
  });

  test('כפילות ⇒ LINK_DUPLICATE HIGH', () => {
    const links = buildLinkTable([fwdN1, { ...fwdN1 }]);
    const report = auditLinks(links, inv);
    expect(codes(report)).toContain('audit.links.LINK_DUPLICATE');
    expect(report.ok).toBe(false);
  });

  test('חד-כיווניות — הפניה קדימה בלי חזרה ⇒ LINK_NOTE_ONE_WAY; וגם ההפך', () => {
    const onlyFwd = auditLinks(buildLinkTable([fwdN1]), inv);
    expect(codes(onlyFwd)).toContain('audit.links.LINK_NOTE_ONE_WAY');
    expect(onlyFwd.findings.find((f) => f.code === 'audit.links.LINK_NOTE_ONE_WAY')!.params.direction).toBe('forward-without-back');
    const onlyBack = auditLinks(buildLinkTable([backN2]), inv);
    expect(codes(onlyBack)).toContain('audit.links.LINK_NOTE_ONE_WAY');
    expect(onlyBack.findings.find((f) => f.code === 'audit.links.LINK_NOTE_ONE_WAY')!.params.direction).toBe('back-without-forward');
  });

  test('TOC חד-כיווני ⇒ LINK_TOC_ONE_WAY', () => {
    const report = auditLinks(buildLinkTable([fwdToc]), inv);
    expect(codes(report)).toContain('audit.links.LINK_TOC_ONE_WAY');
    expect(report.ok).toBe(false);
  });

  test('קישור חיצוני לפי מדיניות — javascript: ⇒ LINK_EXTERNAL_POLICY HIGH; https תקין', () => {
    const badUrl: LinkEndpoint = { kind: 'url', id: 'javascript:alert(1)' };
    const bad: LinkRecord = { linkId: makeLinkId('external', bodyP1, badUrl), kind: 'external', source: bodyP1, target: badUrl };
    const report = auditLinks(buildLinkTable([bad]), inv);
    expect(codes(report)).toContain('audit.links.LINK_EXTERNAL_POLICY');
    expect(report.findings.find((f) => f.code === 'audit.links.LINK_EXTERNAL_POLICY')!.params.scheme).toBe('javascript');
    const okUrl: LinkEndpoint = { kind: 'url', id: 'https://example.com/ref' };
    const okLink: LinkRecord = { linkId: makeLinkId('external', bodyP1, okUrl), kind: 'external', source: bodyP1, target: okUrl };
    const okReport = auditLinks(buildLinkTable([okLink]), inv);
    expect(okReport.ok).toBe(true);
  });

  test('אי-התאמת עמוד מול ה-AnchorTable ⇒ LINK_PAGE_MISMATCH MEDIUM (לא HIGH)', () => {
    const wrongPage: LinkEndpoint = { kind: 'note', id: 'n1', physicalPage: 55 };
    const mismatch: LinkRecord = { linkId: makeLinkId('note', bodyP1, wrongPage), kind: 'note', source: bodyP1, target: wrongPage };
    const links = buildLinkTable([mismatch, { ...backN1, source: wrongPage, linkId: makeLinkId('note-back', wrongPage, bodyP1) }]);
    const report = auditLinks(links, inv);
    const f = report.findings.find((x) => x.code === 'audit.links.LINK_PAGE_MISMATCH');
    expect(f).toBeDefined();
    expect(f!.severity).toBe('MEDIUM');
    expect(f!.params.expected).toBe(12);
    expect(f!.params.actual).toBe(55);
    // MEDIUM אינו פוסל — ok נותר true כשאין HIGH אחר
    expect(report.ok).toBe(true);
  });

  test('קלט שגוי ⇒ INVALID_INPUT; מלאים חסרים ⇒ יעד שבור מדווח (לא שקט)', () => {
    expect(() => auditLinks(null as never, inv)).toThrowError(/INVALID_INPUT|נדרשת/);
    expect(() => auditLinks(buildLinkTable([]), { ...inv, anchors: {} as never })).toThrowError();
    // כל הקודים רשומים וסגורים
    expect(LINK_AUDIT_FINDING_CODES).toHaveLength(7);
    expect(new Set(LINK_AUDIT_FINDING_CODES).size).toBe(7);
    // מלאי ריק — כל יעד שבור במפורש
    const emptyInv = { anchors, noteIds: [], headingIds: [], bodyBlockIds: [], anchorIds: [] };
    const report = auditLinks(buildLinkTable([fwdN1]), emptyInv);
    expect(report.ok).toBe(false);
    expect(codes(report)).toContain('audit.links.LINK_TARGET_MISSING');
  });
});
