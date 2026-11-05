import { useEffect } from 'react';
import { AppShell } from './components/layout/AppShell';
import { ErrorBoundary } from './components/common/ErrorBoundary';
import { migrateLegacyUiState } from './stores/legacy-migrate.js';
import { rehydrateStores, registerRunCancellation } from './stores/index.js';
import { peekUiRuntime } from './worker-host/ui-runtime.js';

function App() {
  useEffect(() => {
    // עלייה חד־פעמית: מיגרציית state ה־UI הישן (קריאה בלבד; שלב 76)
    // ואז החייאת ה־stores מהאחסון הפעיל. אין עימוד כאן — הריצה הראשונה
    // היא פעולה מפורשת של המשתמש דרך ה־Worker (§12.1).
    migrateLegacyUiState();
    rehydrateStores();
    // שלב 84: הרכבה — כל מעבר בין מסמכים (resetForNewDocument) מבטל
    // ריצה פעילה ומנקה מנויים דרך ההוק הזה. peek — אין בניית זמן־ריצה
    // בעלייה רק כדי לרשום ביטול; אם לא נבנה עדיין, אין job פעיל לבטל.
    registerRunCancellation(() => {
      peekUiRuntime()?.controller.cancel();
    });
    return () => registerRunCancellation(null);
  }, []);

  return (
    <ErrorBoundary>
      <AppShell />
    </ErrorBoundary>
  );
}

export default App;
