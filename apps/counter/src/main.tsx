// The counter entry (offline-counter.md 5.1): the enrolment and device sign-in pages (S1-F12-T01). It imports the
// selling entry point, as the counter's till screens will, so the build holds the shared chunk the golden-case page
// also runs (5.5) and the build guard has the real graph to check (5.4). The costing entry point is never imported
// here (PRD-OFF-004).
import * as selling from '@apparel-os/calculations';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { t } from './messages';
import './tokens.css';

document.title = t('counter.title');
// The selling exports the build holds, named on the page so the chunk is kept: the till screens arrive with S4.
document.documentElement.dataset.sellingExports = String(Object.keys(selling).length);

const target = document.getElementById('counter');
if (target !== null) {
  createRoot(target).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
