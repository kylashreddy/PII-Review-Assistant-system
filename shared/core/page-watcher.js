// Watches the page for new tasks (SPA navigation, panel re-render, labels
// being added/removed) and asks content.js to re-analyse, debounced.
(function (g) {
  'use strict';
  const P = g.PIIRA;

  function start({ onChange, isRelevant, delay }) {
    const S = P.SELECTORS;
    let timer = null;
    const schedule = (reason) => {
      clearTimeout(timer);
      timer = setTimeout(() => onChange(reason), delay ? delay() : (S.debounceMs || 600));
    };

    // Observe <body> (not just the task root): sites often replace the whole
    // task container, which would silently detach an observer on it.
    const observer = new MutationObserver((mutations) => {
      // Check every mutation (not just the first relevant one) so content.js
      // learns which of the two documents changed.
      let relevant = false;
      for (const m of mutations) {
        if (m.type === 'attributes' && m.attributeName === 'style') continue; // animations, hover effects
        if (isRelevant(m.target)) relevant = true;
      }
      if (relevant) schedule('mutation');
    });
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
      // All attributes: auto-detected label markup may use any attribute name.
      attributes: true,
    });

    // URL changes without a reload (single-page app navigation).
    let href = location.href;
    const urlTimer = setInterval(() => {
      if (location.href !== href) { href = location.href; schedule('url'); }
    }, 1000);
    addEventListener('popstate', () => schedule('url'));

    return {
      stop() { observer.disconnect(); clearInterval(urlTimer); clearTimeout(timer); },
      schedule,
    };
  }

  P.watcher = { start };
})(globalThis);
