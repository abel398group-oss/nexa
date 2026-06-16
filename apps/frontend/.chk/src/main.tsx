import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './app/App';
import './index.css';

// aplica o tema salvo (claro/escuro) antes de renderizar
if (localStorage.getItem('nexa_theme') === 'dark') document.documentElement.classList.add('dark');

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
