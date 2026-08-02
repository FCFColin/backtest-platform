import { StrictMode } from 'react';
import { hydrateRoot, createRoot } from 'react-dom/client';
import '@fontsource-variable/geist';
import '@fontsource-variable/geist-mono';
import App from './App.js';
import './i18n';
import './styles/tokens.css';
import './index.css';
import './styles/base.css';
const rootEl = document.getElementById('root')!;
const hasSsrContent = rootEl.querySelector(':scope > *') !== null;
if (hasSsrContent) {
  hydrateRoot(
    rootEl,
    <StrictMode>
      <App />
    </StrictMode>,
  );
} else {
  createRoot(rootEl).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
