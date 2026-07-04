import * as Sentry from '@sentry/react';
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './app/App';
import './index.css';

Sentry.init({
  dsn: import.meta.env.VITE_SENTRY_DSN as string | undefined,
  environment: import.meta.env.MODE,
  enabled: !!import.meta.env.VITE_SENTRY_DSN,
  integrations: [Sentry.browserTracingIntegration()],
  tracesSampleRate: 0.1,
  ignoreErrors: ['ERR_NETWORK', 'ERR_CONNECTION_REFUSED', 'Non-Error promise rejection captured'],
});

// aplica o tema salvo (claro/escuro) antes de renderizar
if (localStorage.getItem('nexa_theme') === 'dark') document.documentElement.classList.add('dark');

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
