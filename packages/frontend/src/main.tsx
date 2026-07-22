import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.js';
import './i18n';
import './index.css';
import './styles/base.css';
import './styles/components-params.css';
import './styles/components-backtest.css';
import './styles/components-portfolio.css';
import './styles/components-common.css';
import './styles/utilities.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
