import React from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';

function App(): React.JSX.Element {
  return (
    <main>
      <p className="eyebrow">PHASE 1 FOUNDATION</p>
      <h1>Codex Context Bridge</h1>
      <p>
        Local project identity, validated handoffs, auditable storage, and assisted transfer gates.
      </p>
      <section>
        <strong>No automatic sending is enabled.</strong>
        <span>The workflow UI is intentionally deferred beyond this foundation milestone.</span>
      </section>
    </main>
  );
}

const root = document.getElementById('root');
if (!root) throw new Error('Renderer root element is missing.');

createRoot(root).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
