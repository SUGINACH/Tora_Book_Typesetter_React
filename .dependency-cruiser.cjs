// .dependency-cruiser.cjs — אכיפת גרף התלות המחייב (שלב 8 בתכנית 100 השלבים).
// אסמכתא: אפיון §5 · תכנית שלב 8: "הפרת גבול נתפסת אוטומטית".
//
// הכללים:
//   1. גרף התלות: כל חבילה רשאית לייבא רק את תלויותיה לפי הגרף (בדיוק).
//   2. ליבה ללא Node: חבילות הליבה (הכול למעט cli) אינן מייבאות מודולי ליבה של Node.
//   3. layout-engine אינו מייבא policy-torah (הזרקה בלבד) — נובע מהגרף.
//   4. audit-core אינו מייבא layout-engine — נובע מהגרף.
//   5. אין תלות מהחבילות אל המעטפת (src/).
//   6. cli רשאי Node (מארח); test-fixtures — נתונים בלבד.

// גרף התלות המחייב (זהה ל־scripts/migration/verify-workspaces.mjs)
const GRAPH = {
  'content-model': [],
  'settings-schema': [],
  'measurement-api': [],
  'layout-api': ['content-model', 'settings-schema', 'measurement-api'],
  'layout-engine': ['layout-api'],
  'policy-torah': ['layout-api'],
  'measurement-harfbuzz': ['measurement-api'],
  'audit-core': ['layout-api', 'content-model'],
  'render-html': ['layout-api'],
  'export-pdf': ['layout-api'],
  'cli': ['content-model', 'settings-schema', 'measurement-api', 'layout-api',
    'layout-engine', 'policy-torah', 'measurement-harfbuzz', 'audit-core',
    'render-html', 'export-pdf', 'test-fixtures'],
  'test-fixtures': [],
};

const graphRules = Object.entries(GRAPH).map(([name, deps]) => {
  const allowed = [name, ...deps];
  return {
    name: `graph-${name}`,
    comment: `לחבילה ${name} מותרות רק התלויות: ${deps.length ? deps.join(', ') : '(אין)'}`,
    severity: 'error',
    from: { path: `^packages/${name}/`, pathNot: '/test/' }, // קוד ריצה בלבד; בדיקות מתזמרות חבילות
    to: {
      path: `^packages/`,
      pathNot: `^packages/(${allowed.join('|')})/`,
    },
  };
});

const CORE_PACKAGES = Object.keys(GRAPH).filter((p) => p !== 'cli' && p !== 'test-fixtures');

module.exports = {
  forbidden: [
    ...graphRules,
    {
      name: 'core-no-node-builtins',
      comment: 'קוד הריצה של חבילות הליבה אינו מייבא מודולי ליבה של Node (fs, path, crypto…) — הליבה רצה זהה ב־Node, Worker ו־Tauri. קבצי בדיקה (test/) פטורים: הם רצים ב־Node ומשתמשים בו כאורקל.',
      severity: 'error',
      from: { path: `^packages/(${CORE_PACKAGES.join('|')})/`, pathNot: '/test/' },
      to: { dependencyTypes: ['core'] },
    },
    {
      name: 'no-packages-to-shell',
      comment: 'אין תלות מהחבילות אל המעטפת (src/) — המעטפת צורכת חבילות, לא להפך.',
      severity: 'error',
      from: { path: '^packages/' },
      to: { path: '^src/' },
    },
    {
      name: 'no-circular',
      comment: 'אין תלות מעגלית בין חבילות.',
      severity: 'error',
      from: {},
      to: { circular: true },
    },
    {
      // שלב 22: TestMeasurementProvider — הזרקה בבדיקות בלבד (אפיון §6.4).
      name: 'no-test-provider-in-production',
      comment: 'TestMeasurementProvider (subpath @tora/measurement-api/test) אסור בייבוא מקוד ריצה — אין SimulatedMeasurer במסלול production; מוזרק במפורש בבדיקות יחידה בלבד.',
      severity: 'error',
      from: { path: '^(packages|src)/', pathNot: ['^packages/measurement-api/', '/test/'] },
      to: { path: '^packages/measurement-api/(dist/)?test-provider\\.js$' },
    },
    {
      // שלב 22: חוזי המדידה חסרי DOM/Canvas מעצם הגדרתם — הספרייה עצמה אוסרת
      // זאת, אבל אכיפה כפולה בגרף: אין ייבוא react/jsdom/canvas בחבילות הליבה.
      name: 'core-no-dom-libs',
      comment: 'חבילות הליבה אינן מייבאות react/jsdom/canvas — חוזי המדידה והעימוד נטולי DOM מעצם הגדרתם (אפיון §5, §6.4).',
      severity: 'error',
      from: { path: `^packages/(${CORE_PACKAGES.join('|')})/`, pathNot: '/test/' },
      to: { dependencyTypes: ['npm'], path: '(node_modules/)?(react|react-dom|jsdom|canvas)/' },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    // הפרסר הישן המוחזק (React lock, שלב 17) — עותק מילולי קפוא לבדיקות differential
    // בלבד; אינו חלק מגרף ה־12 חבילות ואין מתקנים בו (כולל תלות טיפוסים מעגלית מקורית).
    exclude: { path: 'packages/test-fixtures/legacy' },
    tsPreCompilationDeps: true,
    enhancedResolveOptions: { exportsFields: ['exports'], conditionNames: ['import', 'types'] },
    reporterOptions: { text: {} },
  },
};
