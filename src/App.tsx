import { useEffect } from 'react';
import { AppShell } from './components/layout/AppShell';
import { useAutoSave } from './hooks/useAutoSave';
import { ErrorBoundary } from './components/common/ErrorBoundary';

function App() {
  useAutoSave();

  useEffect(() => {
    console.log('Tora Book Typesetter loaded');
  }, []);

  return (
    <ErrorBoundary>
      <AppShell />
    </ErrorBoundary>
  );
}

export default App;
