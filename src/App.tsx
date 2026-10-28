import { useEffect } from 'react';
import { AppShell } from './components/layout/AppShell';
import { useAutoSave } from './hooks/useAutoSave';

function App() {
  useAutoSave();

  useEffect(() => {
    console.log('Tora Book Typesetter loaded');
  }, []);

  return <AppShell />;
}

export default App;
