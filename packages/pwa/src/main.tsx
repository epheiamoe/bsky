import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App.js';
import './index.css';
import 'highlight.js/styles/github.css';
import { setSwRegistration, checkForPwaUpdate, shouldIgnoreUpdate } from './services/pwa.js';

// ── Register PWA Service Worker ──
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js', { scope: './' }).then(
      (reg) => {
        setSwRegistration(reg);
        console.log('[PWA] SW registered:', reg.scope);

        reg.addEventListener('updatefound', () => {
          const newWorker = reg.installing;
          if (!newWorker) return;
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              if (!shouldIgnoreUpdate()) {
                window.dispatchEvent(new CustomEvent('pwa-update-available'));
              }
            }
          });
        });
      },
      (err) => console.warn('[PWA] SW registration failed:', err),
    );
  });
}

// Auto-check for updates when user returns to the app
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    checkForPwaUpdate();
  }
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
