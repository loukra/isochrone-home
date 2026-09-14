import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.js';
import { LanguageProvider } from './i18n/index.js';
import { ThemeProvider } from './theme.js';
// Die Schriften werden mitgeliefert, nicht vom System geborgt: `system-ui` ist
// auf dem Mac eine andere Schrift als unter Windows, und die App soll überall
// gleich aussehen. Über npm statt über Google Fonts, weil die Mac-App auch
// ohne Netz startet und weil sonst jeder Start eine fremde Adresse anspräche.
// Die `unicode-range`-Angaben der Pakete sorgen dafür, dass der Browser nur
// den lateinischen Schnitt lädt.
import '@fontsource-variable/ibm-plex-sans/wght.css';
import '@fontsource/ibm-plex-mono/latin-500.css';
import './styles.css';

const container = document.getElementById('root');

if (container === null) {
  throw new Error('Root-Element nicht gefunden.');
}

createRoot(container).render(
  <StrictMode>
    <ThemeProvider>
      <LanguageProvider>
        <App />
      </LanguageProvider>
    </ThemeProvider>
  </StrictMode>,
);
