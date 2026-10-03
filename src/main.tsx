import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'

import './styles/tokens.css'
import './styles/base.css'
import './styles/app.css'
import './styles/ui.css'
import './styles/attendance.css'

import { App } from './components/app/App'

const container = document.getElementById('root');
if (container === null) {
  throw new Error('Root element is missing from index.html');
}

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

/**
 * Service worker registration.
 *
 * `autoUpdate` swaps in a new build on the next load and precaches the whole
 * application shell, so the attendance workflow keeps working with the network
 * disabled. Registration failure is non-fatal: the app still runs, it just will
 * not survive a reload while offline.
 */
registerSW({
  immediate: true,
  onRegisterError(error: unknown) {
    if (import.meta.env.DEV) {
      console.warn('Service worker registration failed:', error);
    }
  },
});