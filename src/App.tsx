import { useEffect } from 'react';
import { AppShell } from './components/layout/AppShell';
import { ErrorBoundary } from './components/common/ErrorBoundary';
import { migrateLegacyUiState } from './stores/legacy-migrate.js';
import { rehydrateStores } from './stores/index.js';

function App() {
  useEffect(() => {
    // עלייה חד־פעמית: מיגרציית state ה־UI הישן (קריאה בלבד; שלב 76)
    // ואז החייאת ה־stores מהאחסון הפעיל. אין עימוד כאן — הריצה הראשונה
    // היא פעולה מפורשת של המשתמש דרך ה־Worker (§12.1).
    migrateLegacyUiState();
    rehydrateStores();
  }, []);

  return (
    <ErrorBoundary>
      <AppShell />
    </ErrorBoundary>
  );
}

export default App;
