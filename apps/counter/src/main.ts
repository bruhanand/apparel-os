// The counter entry (offline-counter.md 5.1). No screen exists yet: it imports the selling entry point, as the counter
// will, so the build holds the shared chunk the golden-case page also runs (5.5) and the build guard has the real
// graph to check (5.4). The costing entry point is never imported here (PRD-OFF-004).
import * as selling from '@apparel-os/calculations';

const target = document.getElementById('counter');
if (target !== null) {
  target.textContent = `Counter build holds ${String(Object.keys(selling).length)} selling exports. No screen yet.`;
}
