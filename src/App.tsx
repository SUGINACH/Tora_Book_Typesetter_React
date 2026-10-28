import { useEffect } from 'react';
import { AppShell } from './components/layout/AppShell';

function App() {
  // שחזור state בעת טעינה — ה-stores כבר מטפלים ב-persist
  useEffect(() => {
    console.log('Tora Book Typesetter loaded');
  }, []);

  return <AppShell />;
}

export default App;
