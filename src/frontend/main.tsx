import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.js';
import { LanguageProvider } from './i18n/index.js';
import './styles.css';

const container = document.getElementById('root');

if (container === null) {
  throw new Error('Root-Element nicht gefunden.');
}

createRoot(container).render(
  <StrictMode>
    <LanguageProvider>
      <App />
    </LanguageProvider>
  </StrictMode>,
);
